import {
  ACTIVITIES,
  addDays,
  DomainError,
  activity,
  localToday,
  parseCommand,
  isIncrementRequest,
  rejectTargetOverride,
  resolveDate,
  resolveItems,
  sameValue,
  type ActorContext,
  type CommandProposal,
  type DateReference,
  type ProposalItem,
  type TypedCellValue,
} from '@sdj/domain';
import { CommandProposalSchema } from '@sdj/contracts';
import {
  WriteFailure,
  type Clock,
  type IntentInterpreter,
  type Mutation,
  type OnboardingGateway,
  type Pending,
  type Store,
  type Tracker,
  type TrackerGateway,
  type WriteGroup,
} from './ports.js';
import {
  HELP,
  activityLines,
  dailyRecap,
  activityLabel,
  message as renderMessage,
  consentMessage,
  reminderStatus,
  presentNotice,
} from './messages.js';
const terminal = new Set([
  'completed',
  'applied',
  'rejected',
  'no_op',
  'conflict',
  'cancelled',
  'expired',
  'partially_applied',
]);
export class CommandService {
  constructor(
    private readonly store: Store,
    private readonly sheets: TrackerGateway,
    private readonly interpreter: IntentInterpreter,
    private readonly onboarding: OnboardingGateway,
    private readonly clock: Clock,
    private readonly publicBaseUrl = 'https://app.sdj-rumah-kepemimpinan.my.id'
  ) {}
  async process(actor: ActorContext): Promise<void> {
    const command = await this.store.command(actor);
    if (terminal.has(command.status) || command.status === 'awaiting_input') return;
    if (command.groupId) {
      await this.reconcile(actor, command.groupId);
      return;
    }
    const message = await this.store.message(actor);
    const user = await this.store.user(actor);
    try {
      rejectTargetOverride(message.text);
      if (await this.onboarding.confirm(actor, message.text)) {
        const connectedUser = await this.store.user(actor);
        await this.store.finish(
          actor,
          command.id,
          'completed',
          renderMessage(
            '✅ Tracker terhubung',
            `Kamu sudah bisa mulai mencatat. Bahasa sehari-hari: *${connectedUser.aiAllowed ? 'aktif' : 'belum diizinkan'}*.\n\nPengingat tersedia pukul *07.00, 13.00, dan 20.00 WIB*.`,
            'Coba “subuh 3”. Untuk berhenti diingatkan, kirim “reminder mati”.'
          )
        );
        return;
      }
      let referenceReceivedAt = message.receivedAt;
      let timezone = user.timezone;
      const pending = await this.store.pending(actor);
      const activePending =
        pending && this.clock.now().getTime() <= Date.parse(pending.expiresAt) ? pending : null;
      if (activePending?.mode === 'ai_consent') {
        const consent =
          /^(?:ya|iya|iya saya setuju|setuju|saya setuju|silakan|boleh|oke|ok)[.!]*$/i.test(
            message.text.trim()
          ) &&
          !/\b(?:tidak|jangan|nggak|enggak|gak|ga|belum|batal|nanti|mungkin)\b|\?/i.test(
            message.text
          );
        if (consent) {
          if (!user.aiAllowed || user.providerPolicyVersion !== 'free-providers-v2')
            await this.store.setAIConsent(actor, true);
          user.aiAllowed = true;
          user.providerPolicyVersion = 'free-providers-v2';
          if (activePending.deferred_request) {
            message.text = activePending.deferred_request.text;
            message.receivedAt = activePending.deferred_request.received_at;
            message.sentAt = activePending.deferred_request.sent_at;
            referenceReceivedAt = message.receivedAt;
            timezone = activePending.timezone;
          }
        } else if (
          /^(?:tidak|nggak|enggak|gak|ga|jangan|batal)(?:\s.*)?[.!]*$/i.test(message.text.trim())
        ) {
          if (user.aiAllowed) await this.store.setAIConsent(actor, false);
          await this.store.finish(
            actor,
            command.id,
            'cancelled',
            'Baik, AI tetap nonaktif. Tracker tetap terhubung dan perintah sederhana tetap dapat digunakan.'
          );
          return;
        }
      }
      let proposal = parseCommand(message.text);
      let route: 'parser' | 'pending' | 'ai' = 'parser';
      if (pending && this.clock.now().getTime() <= Date.parse(pending.expiresAt)) {
        const filled = this.fillPending(pending, message.text);
        if (filled) {
          proposal = filled;
          route = 'pending';
          referenceReceivedAt = pending.referenceReceivedAt;
          timezone = pending.timezone;
        }
      }
      if (!proposal) {
        if (!user.aiAllowed || user.providerPolicyVersion !== 'free-providers-v2') {
          const connected =
            user.status === 'active' && (await this.store.tracker(actor))?.status === 'active';
          if (!connected)
            throw new DomainError(
              'USER_NOT_CONNECTED',
              'Hubungkan tracker terlebih dahulu. Katakan “Saya mau menghubungkan tracker”, lalu berikan persetujuan pemrosesan AI untuk bahasa sehari-hari.'
            );
          if (activePending?.mode === 'ai_consent') {
            await this.store.finish(
              actor,
              command.id,
              'completed',
              renderMessage(
                'Menunggu izinmu',
                'Balas *setuju* untuk melanjutkan permintaan pertama, atau *tidak* untuk memakai perintah singkat.',
                'Perintah seperti “zuhur 3” tetap bisa dipakai.'
              )
            );
            return;
          }
          await this.store.finish(
            actor,
            command.id,
            'awaiting_input',
            consentMessage(this.publicBaseUrl + '/privacy'),
            'clarification',
            {
              mode: 'ai_consent',
              proposal: { schema_version: 2, action: 'unsupported' },
              referenceReceivedAt,
              timezone,
              expiresAt: new Date(this.clock.now().getTime() + 600000).toISOString(),
              deferred_request: {
                text: message.text,
                received_at: message.receivedAt,
                sent_at: message.sentAt,
              },
            }
          );
          return;
        }
        route = 'ai';
        await this.store.recordRoute(actor, command.id, route);
        proposal = CommandProposalSchema.parse(
          await this.interpreter.interpret(message.text, actor, command.id, {
            localDate: localToday({
              receivedAt: new Date(message.receivedAt),
              timezone: user.timezone,
            }),
            ...(activePending && activePending.mode !== 'ai_consent'
              ? {
                  pending: {
                    proposal: activePending.proposal,
                    mode: activePending.mode,
                    localDate: localToday({
                      receivedAt: new Date(activePending.referenceReceivedAt),
                      timezone: activePending.timezone,
                    }),
                  },
                }
              : {}),
          })
        );
      }
      if (route !== 'ai') await this.store.recordRoute(actor, command.id, route);
      if ('continues_pending' in proposal && proposal.continues_pending) {
        this.validateContinuation(activePending, proposal);
        if (activePending) {
          referenceReceivedAt = activePending.referenceReceivedAt;
          timezone = activePending.timezone;
        }
      }
      if (
        proposal.action === 'undo_last' &&
        activePending &&
        /^(batal|undo)$/i.test(message.text.trim())
      )
        proposal = { schema_version: 2, action: 'cancel_pending' };
      if (proposal.action === 'cancel_pending') {
        await this.store.finish(
          actor,
          command.id,
          'cancelled',
          activePending
            ? 'Baik, permintaan yang belum selesai dibatalkan. Tracker tidak diubah.'
            : 'Tidak ada permintaan yang sedang menunggu jawaban.'
        );
        return;
      }
      if (proposal.action === 'confirm_pending') {
        const affirmative = /\b(?:ya|iya|yap|setuju|konfirmasi|lanjutkan|silakan|boleh)\b/i.test(
          message.text
        );
        const uncertain = /\b(?:tidak|jangan|nggak|gak|belum|batal|nanti|mungkin)\b|\?/i.test(
          message.text
        );
        if (
          !activePending ||
          !['disconnect', 'delete_account'].includes(activePending.mode) ||
          !affirmative ||
          uncertain
        )
          throw new DomainError(
            'CONFIRMATION_REQUIRED',
            'Tidak ada konfirmasi yang jelas untuk permintaan ini. Tracker tidak diubah.'
          );
        const closed = await this.store.disconnect(actor, activePending.mode === 'delete_account');
        await this.store.finish(
          actor,
          command.id,
          closed ? 'completed' : 'rejected',
          closed
            ? 'Permintaan dikonfirmasi. Koneksi dinonaktifkan; file Google Sheets Anda tetap ada.'
            : 'Masih ada pencatatan yang diperiksa. Tunggu sebelum melanjutkan.'
        );
        return;
      }
      if (proposal.action === 'help') {
        await this.store.finish(actor, command.id, 'completed', HELP);
        return;
      }
      if (proposal.action === 'connect') {
        const link = await this.onboarding.start(actor);
        await this.store.finish(
          actor,
          command.id,
          'completed',
          `Mari hubungkan tracker Anda. Buka tautan terbaru ini di Chrome/Safari, lalu tekan “Lanjutkan” (berlaku 10 menit; tautan sebelumnya tidak berlaku): ${link}`,
          'status'
        );
        return;
      }
      if (
        ['reminder_on', 'reminder_off', 'reminder_status', 'refresh_profile'].includes(
          proposal.action
        )
      ) {
        if (user.status !== 'active')
          throw new DomainError(
            'USER_NOT_CONNECTED',
            'Hubungkan tracker terlebih dahulu dengan “daftar”.'
          );
        if (proposal.action === 'refresh_profile') {
          const link = await this.onboarding.start(actor, 'profile');
          await this.store.finish(
            actor,
            command.id,
            'completed',
            renderMessage(
              'Perbarui nama Google',
              `Buka tautan ini dan masuk dengan akun Google yang sudah terhubung:\n${link}`,
              'Tautan berlaku 10 menit. Tracker tetap terhubung.'
            )
          );
        } else {
          const enabled =
            proposal.action === 'reminder_on' ||
            (proposal.action === 'reminder_status' && user.remindersEnabled !== false);
          if (proposal.action !== 'reminder_status')
            await this.store.setReminderEnabled(actor, enabled);
          await this.store.finish(actor, command.id, 'completed', reminderStatus(enabled));
        }
        return;
      }
      if (proposal.action === 'connection_status') {
        const tracker = await this.store.tracker(actor);
        const unresolved = tracker ? await this.store.activeGroup(actor, tracker.id) : null;
        await this.store.finish(
          actor,
          command.id,
          'completed',
          renderMessage(
            'Status akunmu',
            `Tracker: *${tracker?.status === 'active' ? 'terhubung' : 'perlu dihubungkan kembali'}*\nBahasa sehari-hari: *${user.aiAllowed && user.providerPolicyVersion === 'free-providers-v2' ? 'aktif' : 'belum diizinkan'}*\nPengingat: *${user.remindersEnabled === false ? 'nonaktif' : 'aktif'}*${unresolved ? '\n\nAda pencatatan yang masih diperiksa.' : ''}`
          ),
          'status'
        );
        return;
      }
      if (proposal.action === 'disconnect' || proposal.action === 'delete_account') {
        const next: Pending = {
          proposal,
          referenceReceivedAt,
          timezone,
          expiresAt: new Date(this.clock.now().getTime() + 600000).toISOString(),
          mode: proposal.action,
        };
        await this.store.finish(
          actor,
          command.id,
          'awaiting_input',
          `Anda ingin ${proposal.action === 'disconnect' ? 'memutus koneksi' : 'menghapus akun dan data aplikasi'}? Konfirmasikan dalam 10 menit, misalnya “iya, lanjutkan”, atau katakan “tidak jadi”. File Google Sheets tetap ada.`,
          'clarification',
          next
        );
        return;
      }
      if (proposal.action === 'unsupported')
        throw new DomainError(
          'COMMAND_UNSUPPORTED',
          isIncrementRequest(message.text)
            ? 'Aku mencatat total akhir. Kirim nilai akhirnya, misalnya “tilawah 3 halaman”. Catatanmu belum berubah.'
            : 'Aku fokus membantu catatan SDJ. ' + HELP
        );
      if (proposal.action === 'clarify') {
        await this.ask(actor, command.id, proposal, referenceReceivedAt, timezone, 'slots');
        return;
      }
      if (user.status !== 'active')
        throw new DomainError(
          'USER_NOT_CONNECTED',
          'Hubungkan tracker terlebih dahulu dengan “daftar”.'
        );
      const tracker = await this.store.tracker(actor);
      if (!tracker || tracker.status !== 'active')
        throw new DomainError(
          'USER_NOT_CONNECTED',
          'Tracker belum aktif. Gunakan “daftar” untuk menghubungkan.'
        );
      const context = { receivedAt: new Date(referenceReceivedAt), timezone };
      if (proposal.action === 'format_summary') {
        const previous = await this.store.lastSummaryContext(actor);
        if (!previous) {
          await this.store.finish(
            actor,
            command.id,
            'completed',
            'Belum ada rekap dalam percakapan ini selama 30 menit terakhir. Sebutkan periode yang ingin diringkas, misalnya “progres bulan ini” atau “rekap hari ini”.'
          );
          return;
        }
        proposal = {
          schema_version: 2,
          action: previous.action,
          date_reference: { kind: 'explicit', date: previous.date },
        };
      }
      if (proposal.action === 'monthly_summary') {
        const anchor = resolveDate(proposal.date_reference, context);
        const month = anchor.slice(0, 7),
          first = month + '-01';
        const today = localToday(context);
        const dates: string[] = [];
        for (let date = first; date.startsWith(month) && date <= today; date = addDays(date, 1))
          dates.push(date);
        const snapshots = await this.sheets.inspect(
          actor,
          tracker,
          dates.flatMap((localDate) => ACTIVITIES.map((a) => ({ activityId: a.id, localDate })))
        );
        if (snapshots.length !== dates.length * ACTIVITIES.length)
          throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Data rekap bulanan tidak lengkap.');
        const lines = ACTIVITIES.map((definition) => {
          const cells = snapshots.filter((s) => s.activityId === definition.id).map((s) => s.value);
          const recorded = cells.filter((v) => v.kind !== 'blank').length;
          const total = cells.reduce(
            (sum, value) => sum + (value.kind === 'number' ? value.value : 0),
            0
          );
          if (definition.kind === 'boolean')
            return `${activityLabel(definition.id)}: ${cells.filter((v) => v.kind === 'boolean' && v.value).length}/${dates.length} hari dicentang`;
          if (definition.unit === 'skor')
            return `${activityLabel(definition.id)}: total ${total} skor${recorded ? `, rata-rata ${(total / recorded).toLocaleString('id-ID', { maximumFractionDigits: 2 })}/3` : ''}; ${recorded}/${dates.length} hari terisi`;
          return `${activityLabel(definition.id)}: ${total.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${definition.unit}; ${recorded}/${dates.length} hari terisi`;
        });
        await this.store.saveSummaryContext(actor, command.id, {
          action: 'monthly_summary',
          date: anchor,
        });
        const group = (title: string, entries: string[]): string =>
          `*${title}*\n${entries.map((line) => '- ' + line).join('\n')}`;
        await this.store.finish(
          actor,
          command.id,
          'completed',
          `📊 *Progres ${month}*\nPeriode: ${first} s.d. ${dates.at(-1)}\n\n${group('Salat', lines.slice(0, 5))}\n\n${group('Rawatib & tilawah', lines.slice(5, 7))}\n\n${group('Kebiasaan', lines.slice(7))}\n\nCatatan: rata-rata skor memakai hari yang terisi. Checkbox dihitung dari centang; belum dicentang dapat berarti belum dilaporkan. Ringkasan berdasarkan tracker, bukan target pribadi.`
        );
        return;
      }
      if (proposal.action === 'daily_summary') {
        const date = resolveDate(proposal.date_reference, context);
        const snapshots = await this.sheets.inspect(
          actor,
          tracker,
          ACTIVITIES.map((a) => ({ activityId: a.id, localDate: date }))
        );
        if (snapshots.length !== ACTIVITIES.length)
          throw new DomainError(
            'TRACKER_SCHEMA_CHANGED',
            'Data rekap harian belum lengkap. Coba periksa koneksi tracker-mu.'
          );
        await this.store.saveSummaryContext(actor, command.id, { action: 'daily_summary', date });
        await this.store.finish(actor, command.id, 'completed', dailyRecap(date, snapshots));
        return;
      }
      const locked = await this.store.withTrackerLock(tracker.id, async () => {
        const active = await this.store.activeGroup(actor, tracker.id);
        if (active)
          throw new DomainError(
            'WRITE_OUTCOME_UNKNOWN',
            'Pencatatan sebelumnya masih diperiksa. Tracker belum menerima penulisan berikutnya.'
          );
        if (proposal.action === 'undo_last') {
          await this.undo(actor, command.id, tracker);
          return;
        }
        if (proposal.action !== 'set_activities')
          throw new DomainError('COMMAND_UNSUPPORTED', 'Perintah tidak didukung.');
        if (
          Date.parse(message.receivedAt) - Date.parse(message.sentAt) > 1800000 &&
          proposal.items.some((i) => i.date_reference.kind !== 'explicit') &&
          referenceReceivedAt === message.receivedAt
        ) {
          await this.ask(
            actor,
            command.id,
            {
              schema_version: 2,
              action: 'clarify',
              items: proposal.items.map((i) => ({ ...i, date_reference: null })),
              missing: ['date'],
            },
            referenceReceivedAt,
            timezone,
            'date'
          );
          return;
        }
        const items = resolveItems(proposal.items, context);
        const snapshots = await this.sheets.inspect(actor, tracker, items);
        if (snapshots.length !== items.length)
          throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Target tracker tidak lengkap.');
        const mutations: Mutation[] = snapshots.flatMap((target, index) => {
          const item = items[index];
          if (
            !item ||
            target.activityId !== item.activityId ||
            target.localDate !== item.localDate ||
            target.spreadsheetId !== tracker.spreadsheetId ||
            target.sheetId !== tracker.sheetId ||
            target.fingerprint !== tracker.fingerprint
          )
            throw new DomainError(
              'TRACKER_SCHEMA_CHANGED',
              'Struktur tracker berubah. Hubungkan ulang untuk validasi.'
            );
          if (target.formula)
            throw new DomainError(
              'TARGET_CELL_IS_FORMULA',
              'Target berisi formula dan tidak boleh ditimpa.'
            );
          if (!target.writable)
            throw new DomainError('TARGET_NOT_WRITABLE', 'Target tidak dapat ditulis.');
          return sameValue(target.value, item.afterValue)
            ? []
            : [
                {
                  id: crypto.randomUUID(),
                  target,
                  before: target.value,
                  after: item.afterValue,
                  status: 'prepared',
                },
              ];
        });
        if (!mutations.length) {
          await this.store.finish(
            actor,
            command.id,
            'no_op',
            renderMessage(
              '✅ Catatanmu sudah sesuai',
              activityLines(
                items.map((i) => ({
                  activityId: i.activityId,
                  localDate: i.localDate,
                  value: i.afterValue,
                }))
              )
            )
          );
          return;
        }
        const group = await this.store.prepare(actor, command.id, tracker, mutations, null);
        await this.apply(actor, tracker, group);
      });
      if (locked === null)
        throw new DomainError(
          'TRACKER_BUSY',
          'Tracker sedang memproses pesan lain. Coba lagi sebentar.'
        );
    } catch (error) {
      if (error instanceof DomainError) {
        const current = await this.store.command(actor);
        const group = current.groupId ? await this.store.group(actor, current.groupId) : null;
        if (group && ['prepared', 'sending', 'uncertain', 'needs_review'].includes(group.status)) {
          const status = group.status === 'prepared' ? 'failed' : 'uncertain';
          await this.store.finalize(
            actor,
            group,
            status,
            group.mutations.map((m) => ({ ...m, status })),
            error.message
          );
          return;
        }
        await this.store.finish(actor, command.id, 'rejected', presentNotice(error.message));
        return;
      }
      throw error;
    }
  }
  private fillPending(pending: Pending, text: string): CommandProposal | null {
    if (pending.proposal.action !== 'clarify') return null;
    const input = text
      .trim()
      .toLowerCase()
      .replace(/^(?:tanggal\s+)/, '')
      .replace(',', '.');
    if (
      pending.mode === 'slots' &&
      pending.proposal.missing.includes('date') &&
      pending.proposal.items.every((i) => i.activity_id !== null && i.value !== null) &&
      /^(?:hari ini|kemarin|\d{4}-\d{2}-\d{2})$/.test(input)
    ) {
      const reference: DateReference =
        input === 'hari ini'
          ? { kind: 'today' }
          : input === 'kemarin'
            ? { kind: 'yesterday' }
            : { kind: 'explicit', date: input };
      return {
        schema_version: 2,
        action: 'set_activities',
        items: pending.proposal.items.map((i) => ({
          activity_id: i.activity_id!,
          value: i.value!,
          date_reference: i.date_reference ?? reference,
        })),
      };
    }
    if (pending.mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const items: ProposalItem[] = [];
      for (const i of pending.proposal.items) {
        if (i.activity_id === null || i.value === null) return null;
        items.push({
          activity_id: i.activity_id,
          date_reference: { kind: 'explicit', date: input },
          value: i.value,
        });
      }
      return { schema_version: 2, action: 'set_activities', items };
    }
    if (pending.proposal.items.length !== 1) return null;
    const item = pending.proposal.items[0];
    if (!item || item.activity_id === null || item.date_reference === null || item.value !== null)
      return null;
    let value: number | boolean;
    if (/^-?\d+(?:\.\d+)?$/.test(input)) value = Number(input);
    else if (/^(sudah|ya|true)$/.test(input)) value = true;
    else if (/^(belum|tidak|false)$/.test(input)) value = false;
    else return null;
    return {
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: item.activity_id, date_reference: item.date_reference, value }],
    };
  }
  private validateContinuation(
    pending: Pending | null,
    proposal: Extract<CommandProposal, { action: 'set_activities' | 'clarify' }>
  ): void {
    if (
      !pending ||
      !['slots', 'date'].includes(pending.mode) ||
      pending.proposal.action !== 'clarify'
    )
      throw new DomainError(
        'PENDING_CONTEXT_INVALID',
        'Tidak ada pertanyaan aktif yang cocok. Sebutkan aktivitas yang ingin dicatat.'
      );
    if (proposal.items.length !== pending.proposal.items.length)
      throw new DomainError(
        'PENDING_CONTEXT_INVALID',
        'Jawaban belum melengkapi seluruh aktivitas yang ditanyakan.'
      );
    for (const [index, previous] of pending.proposal.items.entries()) {
      const next = proposal.items[index];
      if (
        !next ||
        (previous.activity_id !== null && next.activity_id !== previous.activity_id) ||
        (previous.value !== null && next.value !== previous.value) ||
        (previous.date_reference !== null &&
          JSON.stringify(next.date_reference) !== JSON.stringify(previous.date_reference))
      )
        throw new DomainError(
          'PENDING_CONTEXT_INVALID',
          'Jawaban mengubah bagian instruksi sebelumnya. Kirim permintaan baru yang lengkap untuk melakukan koreksi.'
        );
      if (pending.mode === 'date' && next.date_reference?.kind !== 'explicit')
        throw new DomainError(
          'PENDING_CONTEXT_INVALID',
          'Sebutkan tanggal pencatatan yang dimaksud, misalnya “tanggal 15 Oktober 2026”.'
        );
    }
  }
  private async ask(
    actor: ActorContext,
    commandId: string,
    proposal: CommandProposal,
    referenceReceivedAt: string,
    timezone: string,
    mode: 'slots' | 'date'
  ): Promise<void> {
    const previous = await this.store.pending(actor);
    const deferred =
      previous?.deferred_request && Date.parse(previous.expiresAt) > this.clock.now().getTime()
        ? previous
        : null;
    const pending: Pending = {
      proposal,
      referenceReceivedAt,
      timezone,
      expiresAt: deferred?.expiresAt ?? new Date(this.clock.now().getTime() + 600000).toISOString(),
      mode,
      ...(deferred?.deferred_request ? { deferred_request: deferred.deferred_request } : {}),
    };
    let body =
      'Boleh diperjelas aktivitas, nilai, atau tanggal yang dimaksud? Bagian yang sudah jelas saya simpan sementara.';
    if (proposal.action === 'clarify') {
      const questions = new Set<string>();
      for (const item of proposal.items) {
        if (item.activity_id === null) questions.add('Aktivitas apa yang ingin dicatat?');
        else if (item.value === null) {
          const entry = activity(item.activity_id);
          questions.add(
            `${activityLabel(item.activity_id)} ${entry.kind === 'boolean' ? 'sudah dilakukan atau belum?' : `ingin dicatat berapa ${entry.unit}${entry.unit === 'skor' ? ' (0–3)' : ''}?`}`
          );
        }
        if (item.date_reference === null) questions.add('Ini untuk tanggal berapa?');
      }
      if (questions.size) body = [...questions].join('\n');
    }
    if (mode === 'date')
      body =
        'Pesan tampak tertunda. Ini untuk tanggal berapa? Anda bisa menyebut tanggalnya seperti “15 Oktober 2026”.';
    await this.store.finish(
      actor,
      commandId,
      'awaiting_input',
      renderMessage(
        '✍️ Lengkapi catatanmu',
        body,
        'Catatan belum disimpan sampai informasinya lengkap.'
      ),
      'clarification',
      pending
    );
  }
  private async undo(actor: ActorContext, commandId: string, tracker: Tracker): Promise<void> {
    const previous = await this.store.lastGroup(actor, tracker.id);
    if (
      !previous ||
      previous.status !== 'verified' ||
      previous.undoOfId !== null ||
      !previous.verifiedAt ||
      this.clock.now().getTime() - Date.parse(previous.verifiedAt) > 600000
    )
      throw new DomainError(
        'UNDO_NOT_ELIGIBLE',
        'Tidak ada perubahan pesan terakhir yang dapat dibatalkan dalam 10 menit.'
      );
    const fresh = await this.sheets.inspect(
      actor,
      tracker,
      previous.mutations.map((m) => ({
        activityId: m.target.activityId,
        localDate: m.target.localDate,
      }))
    );
    const mutations: Mutation[] = previous.mutations.map((m, index) => {
      const target = fresh[index];
      if (
        !target ||
        target.formula ||
        !target.writable ||
        target.fingerprint !== m.target.fingerprint ||
        target.row !== m.target.row ||
        target.column !== m.target.column ||
        !sameValue(target.value, m.after)
      )
        throw new DomainError(
          'UNDO_NOT_ELIGIBLE',
          'Nilai atau struktur sudah berubah. Seluruh pembatalan dihentikan.'
        );
      return {
        id: crypto.randomUUID(),
        target,
        before: target.value,
        after: m.before,
        status: 'prepared',
      };
    });
    const group = await this.store.prepare(actor, commandId, tracker, mutations, previous.id);
    await this.apply(actor, tracker, group);
  }
  private async apply(actor: ActorContext, tracker: Tracker, group: WriteGroup): Promise<void> {
    const current = await this.store.tracker(actor);
    if (
      !current ||
      current.status !== 'active' ||
      current.id !== tracker.id ||
      current.version !== tracker.version
    ) {
      await this.store.finalize(
        actor,
        group,
        'failed',
        group.mutations.map((m) => ({ ...m, status: 'failed' })),
        'Koneksi berubah sebelum penulisan. Tidak ada perubahan dikirim.'
      );
      return;
    }
    // Repeat target checks after the journal is durable; human edits remain possible between this check and Sheets.
    const fresh = await this.sheets.inspect(
      actor,
      tracker,
      group.mutations.map((m) => ({
        activityId: m.target.activityId,
        localDate: m.target.localDate,
      }))
    );
    if (
      group.mutations.some(
        (m, i) =>
          !this.matchesTarget(m, fresh[i]) ||
          !sameValue(fresh[i]?.value ?? { kind: 'blank' }, m.before)
      )
    ) {
      await this.store.finalize(
        actor,
        group,
        'conflict',
        group.mutations.map((m) => ({ ...m, status: 'conflict' })),
        'Nilai atau struktur berubah sebelum penulisan. Tidak ada perubahan dikirim.'
      );
      return;
    }
    await this.store.sending(actor, group);
    try {
      await this.sheets.write(actor, tracker, group.mutations);
    } catch (error) {
      if (error instanceof WriteFailure && error.definitive) {
        await this.store.finalize(
          actor,
          group,
          'failed',
          group.mutations.map((m) => ({ ...m, status: 'failed' })),
          'Google menolak penulisan. Tracker tidak diubah oleh permintaan ini.'
        );
        return;
      }
      await this.store.finalize(
        actor,
        group,
        'uncertain',
        group.mutations.map((m) => ({ ...m, status: 'uncertain' })),
        'Pencatatan belum dapat dipastikan. Saya sedang memeriksa hasilnya. Jangan kirim ulang dulu.'
      );
      return;
    }
    await this.readOutcome(actor, tracker, group);
  }
  async reconcile(actor: ActorContext, groupId: string): Promise<void> {
    const group = await this.store.group(actor, groupId);
    if (!group || !['prepared', 'sending', 'uncertain', 'needs_review'].includes(group.status))
      return;
    const tracker = await this.store.tracker(actor);
    if (!tracker || tracker.id !== group.trackerId) return;
    const acquired = await this.store.withTrackerLock(tracker.id, async () => {
      if (group.status === 'prepared') await this.apply(actor, tracker, group);
      else await this.readOutcome(actor, tracker, group);
    });
    if (acquired === null)
      throw new DomainError('TRACKER_BUSY', 'Tracker masih diproses writer sebelumnya.');
  }
  private matchesTarget(
    m: Mutation,
    fresh: Awaited<ReturnType<TrackerGateway['inspect']>>[number] | undefined
  ): boolean {
    return (
      !!fresh &&
      !fresh.formula &&
      fresh.writable &&
      fresh.fingerprint === m.target.fingerprint &&
      fresh.sheetId === m.target.sheetId &&
      fresh.row === m.target.row &&
      fresh.column === m.target.column
    );
  }
  private async readOutcome(
    actor: ActorContext,
    tracker: Tracker,
    group: WriteGroup
  ): Promise<void> {
    try {
      const fresh = await this.sheets.inspect(
        actor,
        tracker,
        group.mutations.map((m) => ({
          activityId: m.target.activityId,
          localDate: m.target.localDate,
        }))
      );
      const mutations: Mutation[] = group.mutations.map((m, i) => {
        const target = fresh[i];
        if (!this.matchesTarget(m, target) || !target) return { ...m, status: 'conflict' };
        return {
          ...m,
          status: sameValue(target.value, m.after)
            ? 'verified'
            : sameValue(target.value, m.before)
              ? 'uncertain'
              : 'conflict',
        };
      });
      const all = mutations.every((m) => m.status === 'verified');
      const unknown = mutations.some((m) => m.status === 'uncertain');
      const age = this.clock.now().getTime() - Date.parse(group.createdAt);
      const status = all
        ? 'verified'
        : unknown
          ? age >= 900000
            ? 'needs_review'
            : 'uncertain'
          : 'conflict';
      const body = all
        ? renderMessage(
            group.undoOfId ? '✅ Pembatalan selesai' : '✅ Catatanmu tersimpan',
            activityLines(
              mutations.map((m) => ({
                activityId: m.target.activityId,
                localDate: m.target.localDate,
                value: m.after,
              }))
            ),
            group.undoOfId ? undefined : 'Ada yang keliru? Kirim “batal” dalam 10 menit.'
          )
        : status === 'conflict'
          ? 'Hasil pencatatan berbeda dari target. Ada konflik; nilai tidak ditimpa ulang.'
          : status === 'needs_review'
            ? 'Pencatatan masih belum pasti setelah 15 menit. Tracker tetap ditahan untuk pemeriksaan.'
            : 'Pencatatan belum dapat dipastikan. Saya sedang memeriksa hasilnya. Jangan kirim ulang dulu.';
      await this.store.finalize(actor, group, status, mutations, body);
    } catch (error) {
      if (
        error instanceof DomainError &&
        ['TRACKER_SCHEMA_CHANGED', 'TARGET_CELL_IS_FORMULA'].includes(error.code)
      ) {
        await this.store.finalize(
          actor,
          group,
          'conflict',
          group.mutations.map((m) => ({ ...m, status: 'conflict' })),
          'Struktur tracker berubah. Penulisan dihentikan untuk pemeriksaan.'
        );
        return;
      }
      const expired = this.clock.now().getTime() - Date.parse(group.createdAt) >= 900000;
      const status = expired ? 'needs_review' : 'uncertain';
      await this.store.finalize(
        actor,
        group,
        status,
        group.mutations.map((m) => ({ ...m, status })),
        expired
          ? 'Hasil belum dapat dibaca setelah 15 menit. Tracker tetap ditahan untuk pemeriksaan.'
          : 'Hasil belum dapat dibaca. Pencatatan masih diperiksa.'
      );
    }
  }
}
export const systemClock: Clock = { now: () => new Date() };
export function defaultDateReference(): DateReference {
  return { kind: 'today' };
}
export function todayAt(clock: Clock, timezone: string): string {
  return localToday({ receivedAt: clock.now(), timezone });
}
export function cell(value: number | boolean | null): TypedCellValue {
  return value === null
    ? { kind: 'blank' }
    : typeof value === 'boolean'
      ? { kind: 'boolean', value }
      : { kind: 'number', value };
}
