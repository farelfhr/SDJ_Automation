import type { CommandProposal, InterpretationContext } from '@sdj/domain';

export const datasetVersion = 'sdj-conversation-v3';
export interface ConversationCase {
  id: string;
  text: string;
  context: InterpretationContext;
  expected: CommandProposal;
}
const context: InterpretationContext = { localDate: '2026-10-15' };
export const cases: ConversationCase[] = [
  {
    id: 'monthly-progress-question',
    text: 'bisa kamu cek progress saya bulan ini?',
    context,
    expected: { schema_version: 2, action: 'monthly_summary', date_reference: { kind: 'today' } },
  },
  {
    id: 'monthly-progress-request',
    text: 'tolong lihat progress saya bulan ini',
    context,
    expected: { schema_version: 2, action: 'monthly_summary', date_reference: { kind: 'today' } },
  },
  {
    id: 'informal-batch',
    text: 'Catetin ya, dua hari lalu aku baca Quran dua setengah halaman, udah dhuha juga',
    context,
    expected: {
      schema_version: 2,
      action: 'set_activities',
      items: [
        { activity_id: 'tilawah', date_reference: { kind: 'days_ago', days: 2 }, value: 2.5 },
        { activity_id: 'dhuha', date_reference: { kind: 'days_ago', days: 2 }, value: true },
      ],
    },
  },
  {
    id: 'followup-value',
    text: 'yang zuhur itu tiga aja ya',
    context: {
      localDate: '2026-10-16',
      pending: {
        mode: 'slots',
        localDate: '2026-10-15',
        proposal: {
          schema_version: 2,
          action: 'clarify',
          items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: null }],
          missing: ['value'],
        },
      },
    },
    expected: {
      schema_version: 2,
      action: 'set_activities',
      continues_pending: true,
      items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 3 }],
    },
  },
  {
    id: 'summary-relative',
    text: 'Boleh lihat catatanku seminggu lalu?',
    context,
    expected: {
      schema_version: 2,
      action: 'daily_summary',
      date_reference: { kind: 'days_ago', days: 7 },
    },
  },
  {
    id: 'undo-natural',
    text: 'Eh yang barusan jangan jadi dicatat, kembalikan seperti sebelumnya',
    context,
    expected: { schema_version: 2, action: 'undo_last' },
  },
  {
    id: 'correction-natural',
    text: 'Eh tilawahnya ganti jadi dua setengah halaman untuk kemarin',
    context,
    expected: {
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: 'tilawah', date_reference: { kind: 'yesterday' }, value: 2.5 }],
    },
  },
  {
    id: 'status-natural',
    text: 'Akun Googleku udah kesambung belum sih?',
    context,
    expected: { schema_version: 2, action: 'connection_status' },
  },
  {
    id: 'connect-natural',
    text: 'Bantu saya menyambungkan lembar catatan Google ke sini dong',
    context,
    expected: { schema_version: 2, action: 'connect' },
  },
  {
    id: 'help-natural',
    text: 'Kamu bisa bantu aku ngapain aja?',
    context,
    expected: { schema_version: 2, action: 'help' },
  },
  {
    id: 'disconnect-natural',
    text: 'Lepaskan saja sambungan Google saya dari aplikasi ini',
    context,
    expected: { schema_version: 2, action: 'disconnect' },
  },
  {
    id: 'delete-natural',
    text: 'Tolong hapus data akunku dari aplikasi ini',
    context,
    expected: { schema_version: 2, action: 'delete_account' },
  },
  {
    id: 'confirm-natural',
    text: 'iya saya setuju, silakan lanjutkan',
    context: {
      ...context,
      pending: {
        localDate: context.localDate,
        mode: 'disconnect',
        proposal: { schema_version: 2, action: 'disconnect' },
      },
    },
    expected: { schema_version: 2, action: 'confirm_pending' },
  },
  {
    id: 'cancel-natural',
    text: 'nggak jadi, jangan lanjut',
    context: {
      ...context,
      pending: {
        localDate: context.localDate,
        mode: 'delete_account',
        proposal: { schema_version: 2, action: 'delete_account' },
      },
    },
    expected: { schema_version: 2, action: 'cancel_pending' },
  },
  {
    id: 'ambiguous-prayer',
    text: 'Tadi aku sudah sholat zuhur, tolong catat ya',
    context,
    expected: {
      schema_version: 2,
      action: 'clarify',
      items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: null }],
      missing: ['value'],
    },
  },
  {
    id: 'unsupported-action',
    text: 'Tambahin satu lagi ke jumlah tilawahku hari ini',
    context,
    expected: { schema_version: 2, action: 'unsupported' },
  },
  {
    id: 'outside-scope',
    text: 'Pesankan tiket kereta untuk saya besok pagi',
    context,
    expected: { schema_version: 2, action: 'unsupported' },
  },
];
