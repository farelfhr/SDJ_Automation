import { z } from 'zod';
import type { ReminderStore, ReminderRecipient } from '@sdj/application';
import { Database } from './db.js';
import { CryptoBox } from './crypto.js';

const Occurrence = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  local_date: z.string(),
  slot: z.enum(['morning', 'afternoon', 'evening']),
});
export class PgReminderStore implements ReminderStore {
  constructor(
    private readonly db: Database,
    private readonly box: CryptoBox,
    private readonly accountId: string
  ) {}
  async claimDue(now: Date, limit: number): Promise<ReminderRecipient[]> {
    const result = await this.db.scheduler.query(
      'SELECT id,user_id,local_date::text,slot FROM sdj.claim_reminders($1,$2,$3)',
      [this.accountId, now, limit]
    );
    return result.rows.map((raw) => {
      const row = Occurrence.parse(raw);
      return { id: row.id, userId: row.user_id, localDate: row.local_date, slot: row.slot };
    });
  }
  async enqueue(
    recipient: ReminderRecipient,
    render: (name: string | null) => string
  ): Promise<void> {
    await this.db.tenant({ userId: recipient.userId }, async (client) => {
      const row = (
        await client.query<{
          identity_id: string;
          profile_name_ciphertext: Buffer | null;
          eligible: boolean;
        }>(
          `SELECT r.identity_id,u.profile_name_ciphertext,(u.status='active' AND u.reminders_enabled AND i.status='active' AND EXISTS(SELECT FROM sdj.tracker_connections t JOIN sdj.google_connections g ON g.id=t.google_connection_id AND g.user_id=t.user_id WHERE t.user_id=u.id AND t.status='active' AND g.status='active')) AS eligible
         FROM sdj.reminder_occurrences r JOIN sdj.users u ON u.id=r.user_id
         JOIN sdj.channel_identities i ON i.id=r.identity_id AND i.user_id=r.user_id
         WHERE r.id=$1 AND r.status='leased' AND r.lease_expires_at>now() AND r.expires_at>now()
         AND i.channel_account_id=$2 FOR UPDATE OF r,u`,
          [recipient.id, this.accountId]
        )
      ).rows[0];
      if (!row) return;
      if (!row.eligible) {
        await client.query(
          "UPDATE sdj.reminder_occurrences SET status='cancelled',lease_expires_at=NULL WHERE id=$1",
          [recipient.id]
        );
        return;
      }
      const name = row.profile_name_ciphertext
        ? this.box.open(row.profile_name_ciphertext, `user:profile:${recipient.userId}`, z.string())
        : null;
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO sdj.deliveries(id,user_id,identity_id,channel_account_id,dedupe_key,body_ciphertext,kind,reminder_id)
        VALUES($1,$2,$3,$4,$5,$6,'reminder',$7) ON CONFLICT(user_id,dedupe_key) DO NOTHING`,
        [
          id,
          recipient.userId,
          row.identity_id,
          this.accountId,
          `reminder:${recipient.id}`,
          this.box.seal(render(name), `delivery:body:${recipient.userId}:${id}`),
          recipient.id,
        ]
      );
      await client.query(
        "UPDATE sdj.reminder_occurrences SET status='queued',lease_expires_at=NULL WHERE id=$1",
        [recipient.id]
      );
    });
  }
}
