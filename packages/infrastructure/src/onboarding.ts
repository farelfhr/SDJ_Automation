import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ACTIVITIES, DomainError, normalizeLabel, type ActorContext } from '@sdj/domain';
import {
  cleanProfileName,
  message as renderMessage,
  type OnboardingGateway,
  type TrackerGateway,
  type TrackerConfiguration,
  type TrackerRepairProgress,
} from '@sdj/application';
import type { Config } from '@sdj/config';
import { Database, type PoolClient } from './db.js';
import { CryptoBox, secureToken, safeEqual } from './crypto.js';
import type { TokenProvider } from './google.js';
const Session = z.object({
  id: z.string(),
  user_id: z.string(),
  identity_id: z.string(),
  source_message_id: z.string(),
  status: z.string(),
  expires_at: z.date(),
  csrf_hash: z.instanceof(Buffer).nullable(),
  oauth_state_hash: z.instanceof(Buffer).nullable(),
  pkce_ciphertext: z.instanceof(Buffer).nullable(),
  pending_google_connection_id: z.string().nullable(),
  pending_tracker_id: z.string().nullable(),
  channel_challenge_hash: z.instanceof(Buffer).nullable(),
  challenge_attempts: z.number(),
  ai_allowed: z.boolean(),
  purpose: z.enum(['connect', 'profile']).optional(),
  provider_policy_version: z.string().optional(),
  profile_name_ciphertext: z.instanceof(Buffer).nullable().optional(),
});
export type BrowserSession = z.infer<typeof Session>;
const RepairContinuation = z
  .object({
    version: z.literal(1),
    sessionId: z.string(),
    userId: z.string(),
    connectionId: z.string(),
    spreadsheetId: z.string(),
    sheetId: z.number().int(),
    runId: z.string(),
    fingerprint: z.string(),
    expiresAt: z.number().int(),
  })
  .strict();
export interface OnboardingRepairProgress {
  repairing: true;
  retrying?: boolean;
  retryAfterMs?: number;
  continuationToken: string;
  progress: TrackerRepairProgress['progress'];
}
export interface BrowserOnboarding {
  exchange(token: string, browserCookie?: string): Promise<{ cookie: string; csrf: string }>;
  session(cookie: string): Promise<BrowserSession>;
  checkCSRF(session: BrowserSession, csrf: string): void;
  oauthStart(session: BrowserSession, allowAI: boolean): Promise<string>;
  oauthCallback(session: BrowserSession, state: string, code: string): Promise<void>;
  oauthCancel?(session: BrowserSession, state: string): Promise<void>;
  picker(session: BrowserSession): Promise<{ accessToken: string; apiKey: string; appId: string }>;
  tabs(session: BrowserSession, spreadsheetId: string): Promise<{ id: number; title: string }[]>;
  select(
    session: BrowserSession,
    spreadsheetId: string,
    sheetId: number,
    allowAI?: boolean,
    continuationToken?: string
  ): Promise<TrackerConfiguration | OnboardingRepairProgress | void>;
  cancel(session: BrowserSession): Promise<void>;
}
function actor(session: BrowserSession): ActorContext {
  return {
    userId: session.user_id,
    identityId: session.identity_id,
    sourceMessageId: session.source_message_id,
  };
}
export class GoogleOnboarding implements OnboardingGateway, BrowserOnboarding {
  constructor(
    private readonly db: Database,
    private readonly box: CryptoBox,
    private readonly sheets: TrackerGateway,
    private readonly tokens: TokenProvider,
    private readonly config: Config,
    private readonly request: typeof fetch = fetch
  ) {}
  private configured(): void {
    if (
      !this.config.allowLiveSheets ||
      !this.config.googleClientId ||
      !this.config.googleClientSecret
    )
      throw new DomainError(
        'GOOGLE_NOT_CONFIGURED',
        'Login Google belum tersedia. Hubungi pengelola aplikasi untuk mengaktifkannya.'
      );
  }
  async start(a: ActorContext, purpose: 'connect' | 'profile' = 'connect'): Promise<string> {
    this.configured();
    const id = crypto.randomUUID(),
      token = secureToken();
    await this.db.tenant(a, async (client) => {
      await client.query(
        "UPDATE sdj.onboarding_sessions SET status='cancelled',pkce_ciphertext=NULL WHERE identity_id=$1 AND status NOT IN ('completed','expired','cancelled')",
        [a.identityId]
      );
      await client.query(
        "INSERT INTO sdj.onboarding_sessions(id,user_id,identity_id,source_message_id,link_token_hash,status,expires_at,purpose,provider_policy_version) VALUES($1,$2,$3,$4,$5,'created',now()+interval '10 minutes',$6,'free-providers-v2')",
        [id, a.userId, a.identityId, a.sourceMessageId, this.box.digest(token), purpose]
      );
    });
    return this.config.publicBaseUrl + '/connect?token=' + encodeURIComponent(token);
  }
  async exchange(token: string, browserCookie?: string): Promise<{ cookie: string; csrf: string }> {
    // A consumed bearer link cannot rebind to another browser. The original
    // browser may resume only when BOTH its cookie and that exact link match.
    if (browserCookie) {
      const bound = (
        await this.db.ingress.query<{ id: string; user_id: string }>(
          'SELECT * FROM sdj.onboarding_lookup($1,$2)',
          [this.box.digest(browserCookie), 'browser']
        )
      ).rows[0];
      if (bound) {
        const csrf = secureToken();
        const resumed = await this.db.tenant({ userId: bound.user_id }, (client) =>
          client.query(
            `UPDATE sdj.onboarding_sessions SET csrf_hash=$4
             WHERE id=$1 AND browser_session_hash=$2 AND link_token_hash=$3
             AND status NOT IN ('completed','expired','cancelled') AND expires_at>now()
             RETURNING id`,
            [
              bound.id,
              this.box.digest(browserCookie),
              this.box.digest(token),
              this.box.digest(csrf),
            ]
          )
        );
        if (resumed.rowCount) return { cookie: browserCookie, csrf };
      }
    }
    const row = (
      await this.db.ingress.query<{ id: string; user_id: string }>(
        'SELECT * FROM sdj.onboarding_lookup($1,$2)',
        [this.box.digest(token), 'link']
      )
    ).rows[0];
    if (!row)
      throw new DomainError(
        'ONBOARDING_EXPIRED',
        'Tautan ini sudah dipakai, diganti, atau kedaluwarsa. Lanjutkan di browser awal, atau kirim “daftar” sekali lagi lalu buka tautan paling baru dalam 10 menit.'
      );
    const cookie = secureToken(),
      csrf = secureToken();
    await this.db.tenant({ userId: row.user_id }, async (client) => {
      const r = await client.query(
        "UPDATE sdj.onboarding_sessions SET status='browser_bound',browser_session_hash=$2,csrf_hash=$3 WHERE id=$1 AND status='created' AND expires_at>now() RETURNING id",
        [row.id, this.box.digest(cookie), this.box.digest(csrf)]
      );
      if (!r.rowCount) throw new DomainError('ONBOARDING_EXPIRED', 'Tautan sudah dipakai.');
    });
    return { cookie, csrf };
  }
  async session(cookie: string): Promise<BrowserSession> {
    const row = (
      await this.db.ingress.query<{ id: string; user_id: string }>(
        'SELECT * FROM sdj.onboarding_lookup($1,$2)',
        [this.box.digest(cookie), 'browser']
      )
    ).rows[0];
    if (!row)
      throw new DomainError(
        'ONBOARDING_EXPIRED',
        'Sesi sudah selesai atau kedaluwarsa. Kirim “daftar” lagi.'
      );
    return this.db.tenant({ userId: row.user_id }, async (client) =>
      Session.parse(
        (await client.query('SELECT * FROM sdj.onboarding_sessions WHERE id=$1', [row.id])).rows[0]
      )
    );
  }
  checkCSRF(session: BrowserSession, csrf: string): void {
    if (
      !session.csrf_hash ||
      !safeEqual(session.csrf_hash.toString('hex'), this.box.digest(csrf).toString('hex'))
    )
      throw new DomainError('CSRF_INVALID', 'Sesi browser tidak sesuai.');
  }
  async oauthStart(session: BrowserSession, allowAI: boolean): Promise<string> {
    this.configured();
    const state = secureToken(),
      verifier = secureToken();
    await this.db.tenant(actor(session), async (client) => {
      const r = await client.query(
        "UPDATE sdj.onboarding_sessions SET status='oauth_pending',oauth_state_hash=$2,pkce_ciphertext=$3,ai_allowed=$4 WHERE id=$1 AND status IN ('browser_bound','oauth_pending') AND expires_at>now() RETURNING id",
        [
          session.id,
          this.box.digest(state),
          this.box.seal(verifier, `onboarding:pkce:${session.user_id}:${session.id}`),
          allowAI,
        ]
      );
      if (!r.rowCount)
        throw new DomainError('ONBOARDING_STATE_INVALID', 'Tahap onboarding tidak sesuai.');
    });
    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: this.config.publicBaseUrl + '/connect/google/callback',
      response_type: 'code',
      scope:
        session.purpose === 'profile'
          ? 'openid profile'
          : 'openid profile https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  }
  async oauthCancel(session: BrowserSession, state: string): Promise<void> {
    if (
      session.status !== 'oauth_pending' ||
      !session.oauth_state_hash ||
      !safeEqual(session.oauth_state_hash.toString('hex'), this.box.digest(state).toString('hex'))
    )
      throw new DomainError('OAUTH_STATE_INVALID', 'OAuth state tidak cocok.');
    await this.cancel(session);
  }
  async oauthCallback(session: BrowserSession, state: string, code: string): Promise<void> {
    if (
      session.status !== 'oauth_pending' ||
      !session.oauth_state_hash ||
      !session.pkce_ciphertext ||
      !safeEqual(session.oauth_state_hash.toString('hex'), this.box.digest(state).toString('hex'))
    )
      throw new DomainError('OAUTH_STATE_INVALID', 'OAuth state tidak cocok atau sudah dipakai.');
    const a = actor(session),
      verifier = this.box.open(
        session.pkce_ciphertext,
        `onboarding:pkce:${a.userId}:${session.id}`,
        z.string()
      );
    await this.db.tenant(a, async (client) => {
      const r = await client.query(
        "UPDATE sdj.onboarding_sessions SET oauth_state_hash=NULL,pkce_ciphertext=NULL,status='browser_bound' WHERE id=$1 AND oauth_state_hash=$2 AND expires_at>now() RETURNING id",
        [session.id, this.box.digest(state)]
      );
      if (!r.rowCount) throw new DomainError('OAUTH_STATE_INVALID', 'OAuth state sudah dipakai.');
    });
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.googleClientId,
        client_secret: this.config.googleClientSecret,
        redirect_uri: this.config.publicBaseUrl + '/connect/google/callback',
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new DomainError(
        'OAUTH_EXCHANGE_FAILED',
        'Google menolak login. Mulai login kembali sebelum sesi kedaluwarsa.'
      );
    const result = z
      .object({
        access_token: z.string(),
        refresh_token: z.string().optional(),
        scope: z.string().optional(),
      })
      .parse(await response.json());
    const scopes = (result.scope ?? 'openid https://www.googleapis.com/auth/drive.file').split(' ');
    if (
      session.purpose !== 'profile' &&
      !scopes.includes('https://www.googleapis.com/auth/drive.file')
    )
      throw new DomainError('OAUTH_SCOPE_MISSING', 'Izin file Google belum diberikan.');
    const userInfo = await this.request('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: 'Bearer ' + result.access_token },
      signal: AbortSignal.timeout(8000),
    });
    if (!userInfo.ok)
      throw new DomainError('OAUTH_IDENTITY_FAILED', 'Identitas Google tidak dapat diverifikasi.');
    const profile = z
      .object({
        sub: z.string().min(1),
        given_name: z.string().optional(),
        name: z.string().optional(),
      })
      .parse(await userInfo.json());
    const subject = profile.sub;
    const profileName = cleanProfileName(profile.given_name) ?? cleanProfileName(profile.name);
    if (session.purpose === 'profile') {
      await this.db.tenant(a, async (client) => {
        const connected = await client.query(
          "SELECT g.id FROM sdj.google_connections g JOIN sdj.users u ON u.id=g.user_id JOIN sdj.channel_identities i ON i.user_id=u.id WHERE g.subject_lookup=$1 AND g.status IN ('active','reauth_required') AND u.status='active' AND i.id=$2 AND i.status='active' FOR UPDATE OF u,g",
          [this.box.digest(subject), a.identityId]
        );
        if (!connected.rowCount)
          throw new DomainError(
            'PROFILE_ACCOUNT_MISMATCH',
            'Gunakan akun Google yang sudah terhubung ke tracker-mu. Tracker tetap terhubung; kirim “perbarui profil” untuk mencoba lagi.'
          );
        const completed = await client.query(
          "UPDATE sdj.onboarding_sessions SET status='completed',browser_session_hash=NULL,csrf_hash=NULL WHERE id=$1 AND status='browser_bound' AND expires_at>now() RETURNING id",
          [session.id]
        );
        if (!completed.rowCount)
          throw new DomainError('ONBOARDING_EXPIRED', 'Sesi pembaruan profil sudah kedaluwarsa.');
        if (profileName)
          await client.query('UPDATE sdj.users SET profile_name_ciphertext=$2 WHERE id=$1', [
            a.userId,
            this.box.seal(profileName, `user:profile:${a.userId}`),
          ]);
      });
      return;
    }
    if (profileName)
      await this.db.tenant(a, (client) =>
        client.query('UPDATE sdj.onboarding_sessions SET profile_name_ciphertext=$2 WHERE id=$1', [
          session.id,
          this.box.seal(profileName, `session:profile:${a.userId}:${session.id}`),
        ])
      );
    const id = crypto.randomUUID(),
      subjectHash = this.box.digest(subject);
    await this.db.tenant(a, async (client) => {
      let refresh = result.refresh_token;
      if (!refresh) {
        const old = (
          await client.query<{ id: string; refresh_token_ciphertext: Buffer }>(
            "SELECT id,refresh_token_ciphertext FROM sdj.google_connections WHERE subject_lookup=$1 AND status IN ('active','reauth_required')",
            [subjectHash]
          )
        ).rows[0];
        if (old?.refresh_token_ciphertext)
          refresh = this.box.open(
            old.refresh_token_ciphertext,
            `google:refresh:${a.userId}:${old.id}`,
            z.string()
          );
      }
      if (!refresh)
        throw new DomainError(
          'OAUTH_OFFLINE_ACCESS_REQUIRED',
          'Google tidak memberikan izin offline. Ulangi login dan persetujuan.'
        );
      await client.query(
        "INSERT INTO sdj.google_connections(id,user_id,subject_lookup,subject_ciphertext,refresh_token_ciphertext,granted_scopes,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",
        [
          id,
          a.userId,
          subjectHash,
          this.box.seal(subject, `google:subject:${a.userId}:${id}`),
          this.box.seal(refresh, `google:refresh:${a.userId}:${id}`),
          scopes,
        ]
      );
      const update = await client.query(
        "UPDATE sdj.onboarding_sessions SET pending_google_connection_id=$2,status='file_selection' WHERE id=$1 AND status='browser_bound' AND expires_at>now() RETURNING id",
        [session.id, id]
      );
      if (!update.rowCount) throw new DomainError('ONBOARDING_EXPIRED', 'Sesi kedaluwarsa.');
    });
  }
  async picker(
    session: BrowserSession
  ): Promise<{ accessToken: string; apiKey: string; appId: string }> {
    if (session.purpose === 'profile')
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Pembaruan profil tidak memilih tracker.');
    if (session.status !== 'file_selection' || !session.pending_google_connection_id)
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Login Google terlebih dahulu.');
    if (!this.config.googlePickerKey || !this.config.googleAppId)
      throw new DomainError(
        'PICKER_NOT_CONFIGURED',
        'Google Picker API key dan project number belum dikonfigurasi.'
      );
    return {
      accessToken: await this.tokens.accessToken(
        actor(session),
        session.pending_google_connection_id
      ),
      apiKey: this.config.googlePickerKey,
      appId: this.config.googleAppId,
    };
  }
  async select(
    session: BrowserSession,
    spreadsheetId: string,
    sheetId: number,
    allowAI?: boolean,
    continuationToken?: string
  ): Promise<TrackerConfiguration | OnboardingRepairProgress | void> {
    if (session.expires_at.getTime() <= Date.now())
      throw new DomainError(
        'ONBOARDING_EXPIRED',
        'Sesi penghubungan kedaluwarsa. Kirim daftar untuk melanjutkan dari sesi baru.'
      );
    if (session.purpose === 'profile')
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Pembaruan profil tidak memilih tracker.');
    if (session.status !== 'file_selection' || !session.pending_google_connection_id)
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Tahap pemilihan file tidak sesuai.');
    const a = actor(session),
      connection = session.pending_google_connection_id;
    const context = `onboarding:repair:${session.user_id}:${session.id}`;
    const runId = this.box
      .digest(`${session.id}:${connection}:${spreadsheetId}:${sheetId}:normalization-v1`)
      .toString('hex');
    let fingerprint: string | undefined;
    if (continuationToken) {
      try {
        const claim = this.box.open(
          Buffer.from(continuationToken, 'base64url'),
          context,
          RepairContinuation
        );
        if (
          claim.sessionId !== session.id ||
          claim.userId !== a.userId ||
          claim.connectionId !== connection ||
          claim.spreadsheetId !== spreadsheetId ||
          claim.sheetId !== sheetId ||
          claim.runId !== runId ||
          claim.expiresAt <= Date.now() ||
          claim.expiresAt > session.expires_at.getTime()
        )
          throw new Error('CONTEXT_MISMATCH');
        fingerprint = claim.fingerprint;
      } catch {
        throw new DomainError(
          'TRACKER_REPAIR_TOKEN_INVALID',
          'Sesi kelanjutan perbaikan tidak sesuai. Pilih tracker dari sesi penghubungan ini kembali.'
        );
      }
    }
    const validated = this.sheets.repairStep
      ? await this.sheets.repairStep(a, connection, spreadsheetId, sheetId, runId, fingerprint)
      : await this.sheets.validate(a, connection, spreadsheetId, sheetId);
    if ('repairing' in validated) {
      const token = this.box
        .seal(
          {
            version: 1,
            sessionId: session.id,
            userId: a.userId,
            connectionId: connection,
            spreadsheetId,
            sheetId,
            runId,
            fingerprint: validated.fingerprint,
            expiresAt: session.expires_at.getTime(),
          },
          context
        )
        .toString('base64url');
      return {
        repairing: true,
        ...(validated.retrying ? { retrying: true } : {}),
        ...(validated.retryAfterMs ? { retryAfterMs: validated.retryAfterMs } : {}),
        continuationToken: token,
        progress: validated.progress,
      };
    }
    const tracker = crypto.randomUUID(),
      challenge = secureToken().slice(0, 10).toUpperCase();
    await this.db.tenant(a, async (client) => {
      await client.query(
        "INSERT INTO sdj.tracker_connections(id,user_id,google_connection_id,spreadsheet_id,sheet_id,sheet_title,template_id,structure_fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,'sdj-v1.2-full-v1',$7,'pending')",
        [
          tracker,
          a.userId,
          connection,
          spreadsheetId,
          sheetId,
          validated.sheetTitle,
          validated.fingerprint,
        ]
      );
      for (const definition of ACTIVITIES)
        await client.query(
          'INSERT INTO sdj.activity_bindings(id,user_id,tracker_id,template_id,activity_id,row_index,normalized_label_hash,binding_version) VALUES($1,$2,$3,$4,$5,$6,$7,1)',
          [
            crypto.randomUUID(),
            a.userId,
            tracker,
            'sdj-v1.2-full-v1',
            definition.id,
            validated.bindings[definition.id],
            createHash('sha256')
              .update(
                normalizeLabel(
                  validated.normalizedLabels?.[definition.id] ??
                    definition.sourceLabels[0] ??
                    definition.label
                )
              )
              .digest('hex'),
          ]
        );
      const updated = await client.query(
        "UPDATE sdj.onboarding_sessions SET pending_tracker_id=$2,channel_challenge_hash=$3,status='channel_confirmation',ai_allowed=coalesce($4,ai_allowed) WHERE id=$1 AND status='file_selection' AND expires_at>now() RETURNING id",
        [session.id, tracker, this.box.digest(challenge), allowAI ?? null]
      );
      if (!updated.rowCount) throw new DomainError('ONBOARDING_EXPIRED', 'Sesi sudah kedaluwarsa.');
      const command = (
        await client.query<{ id: string }>(
          'SELECT id FROM sdj.commands WHERE origin_message_id=$1',
          [session.source_message_id]
        )
      ).rows[0];
      if (!command) throw new Error('ONBOARDING_COMMAND_MISSING');
      const id = crypto.randomUUID();
      await client.query(
        "INSERT INTO sdj.deliveries(id,user_id,command_id,identity_id,source_message_id,channel_account_id,dedupe_key,body_ciphertext,kind) SELECT $1,$2,$3,$4,m.id,m.channel_account_id,$5,$6,'onboarding' FROM sdj.inbound_messages m WHERE m.id=$7 ON CONFLICT(user_id,dedupe_key) DO NOTHING",
        [
          id,
          a.userId,
          command.id,
          a.identityId,
          session.id + ':challenge',
          this.box.seal(
            renderMessage(
              '🔗 Satu langkah lagi',
              (validated.configuration
                ? `Pemetaan tracker otomatis selesai: ${validated.configuration.activityCount} aktivitas, ${validated.configuration.dateCount} tanggal (${validated.configuration.dateFrom} s.d. ${validated.configuration.dateTo}).\n`
                : '') +
                (validated.configuration?.repairedValidationCells
                  ? `Aturan input pada ${validated.configuration.repairedValidationCells} sel diperbaiki otomatis.\n`
                  : '') +
                (validated.configuration?.resetInputCells
                  ? `${validated.configuration.resetInputCells} isian yang tidak dapat dipastikan dikosongkan. Nilai asal tersedia di tab cadangan tersembunyi; catat jumlah sebenarnya setelah terhubung.\n`
                  : '') +
                (validated.configuration?.convertedInputCells
                  ? `${validated.configuration.convertedInputCells} isian dikonversi otomatis ke tipe yang benar.\n`
                  : '') +
                'Untuk mengaktifkan tracker pilihan, balas dari DM ini:\n\nhubungkan ' +
                challenge
            ),
            `delivery:body:${a.userId}:${id}`
          ),
          a.sourceMessageId,
        ]
      );
    });
    return validated.configuration;
  }
  async tabs(
    session: BrowserSession,
    spreadsheetId: string
  ): Promise<{ id: number; title: string }[]> {
    if (session.purpose === 'profile')
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Pembaruan profil tidak memilih tracker.');
    if (session.status !== 'file_selection' || !session.pending_google_connection_id)
      throw new DomainError('ONBOARDING_STATE_INVALID', 'Login Google terlebih dahulu.');
    const token = await this.tokens.accessToken(
      actor(session),
      session.pending_google_connection_id
    );
    const response = await this.request(
      'https://sheets.googleapis.com/v4/spreadsheets/' +
        encodeURIComponent(spreadsheetId) +
        '?fields=sheets(properties(sheetId,title,hidden),developerMetadata(metadataKey))',
      { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new DomainError('GOOGLE_READ_FAILED', 'Daftar tab tidak dapat dibaca.');
    return z
      .object({
        sheets: z.array(
          z.object({
            properties: z.object({ sheetId: z.number(), title: z.string() }),
            developerMetadata: z.array(z.object({ metadataKey: z.string() })).optional(),
          })
        ),
      })
      .parse(await response.json())
      .sheets.filter(
        (s) => !s.developerMetadata?.some((m) => m.metadataKey === 'sdj.repair.run.v1')
      )
      .map((s) => ({ id: s.properties.sheetId, title: s.properties.title }));
  }
  async confirm(a: ActorContext, text: string): Promise<boolean> {
    const match = text.trim().match(/^hubungkan\s+([a-z0-9_-]{8,64})$/i);
    if (!match) return false;
    const result = await this.db.tenant(a, async (client) => {
      const raw = (
        await client.query(
          "SELECT * FROM sdj.onboarding_sessions WHERE identity_id=$1 AND status='channel_confirmation' AND expires_at>now() FOR UPDATE",
          [a.identityId]
        )
      ).rows[0];
      if (!raw) return false;
      const s = Session.parse(raw);
      if (s.challenge_attempts >= 5 || !s.channel_challenge_hash) return false;
      await client.query(
        'UPDATE sdj.onboarding_sessions SET challenge_attempts=challenge_attempts+1 WHERE id=$1',
        [s.id]
      );
      if (
        !safeEqual(
          s.channel_challenge_hash.toString('hex'),
          this.box.digest((match[1] ?? '').toUpperCase()).toString('hex')
        )
      )
        return false;
      if (
        (
          await client.query(
            "SELECT id FROM sdj.write_groups WHERE status IN ('prepared','sending','uncertain','needs_review')"
          )
        ).rowCount
      )
        throw new DomainError(
          'WRITE_OUTCOME_UNKNOWN',
          'Pencatatan lama masih diperiksa. Tunggu sebelum mengganti tracker.'
        );
      await client.query(
        "UPDATE sdj.tracker_connections SET status='disabled',version=version+1 WHERE status IN ('active','needs_validation','reauth_required')"
      );
      await client.query(
        "UPDATE sdj.google_connections SET status='revoked',refresh_token_ciphertext=NULL,version=version+1 WHERE status IN ('active','reauth_required')"
      );
      const google = await client.query(
        "UPDATE sdj.google_connections SET status='active',version=version+1 WHERE id=$1 AND status='pending' AND refresh_token_ciphertext IS NOT NULL RETURNING id",
        [s.pending_google_connection_id]
      );
      if (!google.rowCount)
        throw new DomainError('ONBOARDING_STATE_INVALID', 'Koneksi kandidat tidak valid.');
      try {
        await client.query(
          "UPDATE sdj.tracker_connections SET status='active',version=version+1 WHERE id=$1 AND status='pending'",
          [s.pending_tracker_id]
        );
      } catch (error) {
        if (z.object({ code: z.string() }).safeParse(error).data?.code === '23505')
          throw new DomainError(
            'TRACKER_ALREADY_REGISTERED',
            'Tracker sudah terdaftar. Pilih tracker lain.'
          );
        throw error;
      }
      await client.query(
        "UPDATE sdj.users SET status='active',privacy_notice_version='privacy-v1',provider_policy_version=$3,ai_processing_allowed=$2,consented_at=now(),reminders_started_at=now(),version=version+1 WHERE id=$1",
        [a.userId, s.ai_allowed, s.provider_policy_version ?? 'free-providers-v1']
      );
      if (s.profile_name_ciphertext) {
        const name = this.box.open(
          s.profile_name_ciphertext,
          `session:profile:${a.userId}:${s.id}`,
          z.string()
        );
        await client.query('UPDATE sdj.users SET profile_name_ciphertext=$2 WHERE id=$1', [
          a.userId,
          this.box.seal(name, `user:profile:${a.userId}`),
        ]);
      }
      await client.query(
        "UPDATE sdj.onboarding_sessions SET status='completed',browser_session_hash=NULL,csrf_hash=NULL,channel_challenge_hash=NULL WHERE id=$1",
        [s.id]
      );
      return true;
    });
    if (!result)
      throw new DomainError(
        'CHALLENGE_INVALID',
        'Konfirmasi salah, kedaluwarsa, atau berasal dari DM yang berbeda.'
      );
    return true;
  }
  async cancel(session: BrowserSession): Promise<void> {
    await this.db.tenant(actor(session), async (client) => {
      await this.cancelTx(client, session);
    });
  }
  private async cancelTx(client: PoolClient, session: BrowserSession): Promise<void> {
    await client.query(
      "UPDATE sdj.onboarding_sessions SET status='cancelled',profile_name_ciphertext=NULL,pkce_ciphertext=NULL,oauth_state_hash=NULL,browser_session_hash=NULL,csrf_hash=NULL WHERE id=$1",
      [session.id]
    );
    if (session.pending_tracker_id)
      await client.query(
        "UPDATE sdj.tracker_connections SET status='disabled' WHERE id=$1 AND status='pending'",
        [session.pending_tracker_id]
      );
    if (session.pending_google_connection_id)
      await client.query(
        "UPDATE sdj.google_connections SET status='revoked',refresh_token_ciphertext=NULL WHERE id=$1 AND status='pending'",
        [session.pending_google_connection_id]
      );
  }
}
