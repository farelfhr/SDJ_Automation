import type { Pool, PoolClient } from 'pg';

// Retention has its own tenant-scoped role. Never expose it through HTTP.
export class Maintenance {
  constructor(private readonly pool: Pool) {}
  async run(userIds?: readonly string[]): Promise<{ processed: number; held: number }> {
    if (!userIds) await this.pool.query('SELECT sdj.cleanup_expired_nonces()');
    const candidates = userIds
      ? userIds.map((user_id) => ({ user_id }))
      : (await this.pool.query<{ user_id: string }>('SELECT * FROM sdj.maintenance_candidates()'))
          .rows;
    let processed = 0,
      held = 0;
    for (const row of candidates) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.user_id',$1,true)", [row.user_id]);
        // Skip live jobs/delivery leases. Deletion must not race a writer or erase its evidence.
        const busy = await client.query(
          "SELECT id FROM sdj.jobs WHERE status='leased' AND lease_expires_at>now() UNION ALL SELECT id FROM sdj.deliveries WHERE status IN ('pending','leased')"
        );
        const unresolved = await client.query(
          "SELECT id FROM sdj.write_groups WHERE status IN ('prepared','sending','uncertain','needs_review')"
        );
        if (unresolved.rowCount) {
          held++;
          await client.query('COMMIT');
          continue;
        }
        const user = (
          await client.query<{ status: string; deletion_requested_at: Date | null }>(
            'SELECT status,deletion_requested_at FROM sdj.users FOR UPDATE'
          )
        ).rows[0];
        if (user?.status === 'deleting') {
          if (busy.rowCount) {
            held++;
            await client.query('COMMIT');
            continue;
          }
          await client.query(
            'INSERT INTO sdj.deletion_tombstones(user_id,requested_at) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',
            [row.user_id, user.deletion_requested_at ?? new Date()]
          );
          await this.deleteParticipant(client);
        } else {
          await client.query(
            "UPDATE sdj.onboarding_sessions SET status='expired',pkce_ciphertext=NULL,oauth_state_hash=NULL,browser_session_hash=NULL,csrf_hash=NULL,channel_challenge_hash=NULL WHERE expires_at<now() AND status NOT IN ('completed','expired','cancelled')"
          );
          await client.query(
            "UPDATE sdj.google_connections g SET status='revoked',refresh_token_ciphertext=NULL,version=version+1 WHERE status='pending' AND NOT EXISTS(SELECT FROM sdj.onboarding_sessions s WHERE s.pending_google_connection_id=g.id AND s.status NOT IN ('expired','cancelled','completed'))"
          );
          await client.query(
            "UPDATE sdj.commands SET status='expired',pending_ciphertext=NULL WHERE status='awaiting_input' AND expires_at<now()"
          );
          await client.query(
            "UPDATE sdj.inbound_messages m SET text_ciphertext=NULL WHERE received_at<now()-interval '7 days' AND NOT EXISTS(SELECT FROM sdj.jobs j WHERE j.message_id=m.id AND j.status IN ('queued','leased')) AND NOT EXISTS(SELECT FROM sdj.commands c WHERE c.origin_message_id=m.id AND c.status IN ('received','interpreting','ready','applying','uncertain','needs_review','awaiting_input'))"
          );
          // Keep dependencies for newer commands/undo and all unresolved operations.
          await client.query(
            "DELETE FROM sdj.deliveries WHERE created_at<now()-interval '30 days' AND status IN ('sent','cancelled','failed','delivery_unknown')"
          );
          await client.query(
            "DELETE FROM sdj.reminder_occurrences r WHERE created_at<now()-interval '30 days' AND NOT EXISTS(SELECT FROM sdj.deliveries d WHERE d.reminder_id=r.id)"
          );
          await client.query(
            "DELETE FROM sdj.provider_attempts WHERE created_at<now()-interval '30 days' AND status<>'reserved'"
          );
          await client.query(
            "DELETE FROM sdj.onboarding_sessions WHERE created_at<now()-interval '30 days' AND status IN ('completed','expired','cancelled')"
          );
          await client.query(
            "DELETE FROM sdj.jobs WHERE created_at<now()-interval '30 days' AND status IN ('done','failed','cancelled')"
          );
          const groups = await client.query<{ id: string; command_id: string }>(
            "SELECT g.id,g.command_id FROM sdj.write_groups g WHERE g.created_at<now()-interval '30 days' AND g.status IN ('verified','failed','conflict') AND NOT EXISTS(SELECT FROM sdj.write_groups child WHERE child.undo_of_id=g.id) AND NOT EXISTS(SELECT FROM sdj.jobs j WHERE j.group_id=g.id) ORDER BY g.created_at DESC LIMIT 100"
          );
          for (const group of groups.rows) {
            await client.query('DELETE FROM sdj.mutations WHERE group_id=$1', [group.id]);
            await client.query('DELETE FROM sdj.command_items WHERE command_id=$1', [
              group.command_id,
            ]);
            await client.query('DELETE FROM sdj.write_groups WHERE id=$1', [group.id]);
          }
          await client.query(
            "DELETE FROM sdj.commands c WHERE c.created_at<now()-interval '30 days' AND c.status IN ('completed','applied','partially_applied','no_op','rejected','conflict','cancelled','expired') AND NOT EXISTS(SELECT FROM sdj.write_groups g WHERE g.command_id=c.id) AND NOT EXISTS(SELECT FROM sdj.deliveries d WHERE d.command_id=c.id)"
          );
          await client.query(
            "DELETE FROM sdj.inbound_messages m WHERE m.received_at<now()-interval '30 days' AND NOT EXISTS(SELECT FROM sdj.commands c WHERE c.origin_message_id=m.id) AND NOT EXISTS(SELECT FROM sdj.deliveries d WHERE d.source_message_id=m.id) AND NOT EXISTS(SELECT FROM sdj.jobs j WHERE j.message_id=m.id) AND NOT EXISTS(SELECT FROM sdj.onboarding_sessions s WHERE s.source_message_id=m.id)"
          );
        }
        await client.query('COMMIT');
        processed++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    return { processed, held };
  }
  private async deleteParticipant(client: PoolClient): Promise<void> {
    // One statement per table; every row remains restricted by FORCE RLS.
    for (const table of [
      'onboarding_sessions',
      'deliveries',
      'reminder_occurrences',
      'jobs',
      'mutations',
      'command_items',
      'write_groups',
      'commands',
      'activity_bindings',
      'tracker_connections',
      'google_connections',
      'provider_attempts',
      'inbound_messages',
      'channel_identities',
      'users',
    ])
      await client.query('DELETE FROM sdj.' + table);
  }
}
