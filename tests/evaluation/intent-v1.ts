import { ACTIVITIES, type CommandProposal } from '@sdj/domain';
export const datasetVersion = 'sdj-intent-v1';
export interface EvaluationCase {
  id: string;
  text: string;
  expected: CommandProposal;
}
export const cases: EvaluationCase[] = [];
for (const [i, a] of ACTIVITIES.entries()) {
  const value = a.kind === 'boolean' ? true : a.id === 'tilawah' ? 0.5 : a.id === 'rawatib' ? 2 : 3;
  for (const [variant, phrase] of [
    `Tolong catat ${a.label} hari ini ${typeof value === 'boolean' ? 'sudah' : value}.`,
    `Untuk hari ini, isikan ${a.label} dengan ${typeof value === 'boolean' ? 'sudah dikerjakan' : value}.`,
    `Saya mau memperbarui catatan ${a.label} hari ini menjadi ${typeof value === 'boolean' ? 'sudah' : value}.`,
    `Bantu masukkan ${a.label} ${typeof value === 'boolean' ? 'sudah' : value} untuk hari ini.`,
  ].entries())
    cases.push({
      id: `single-${i}-${variant}`,
      text: phrase,
      expected: {
        schema_version: 2,
        action: 'set_activities',
        items: [{ activity_id: a.id, date_reference: { kind: 'today' }, value }],
      },
    });
}
for (let i = 0; i < 15; i++) {
  const a = ACTIVITIES[i]!;
  const value = a.kind === 'boolean' ? false : a.id === 'tilawah' ? 1.5 : 0;
  cases.push({
    id: `yesterday-${i}`,
    text: `Mohon ubah catatan ${a.label} kemarin menjadi ${typeof value === 'boolean' ? 'belum dikerjakan' : value}.`,
    expected: {
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: a.id, date_reference: { kind: 'yesterday' }, value }],
    },
  });
}
for (let i = 0; i < 15; i++) {
  const a = ACTIVITIES[i]!;
  cases.push({
    id: `missing-${i}`,
    text: `Tolong catat ${a.label}.`,
    expected: {
      schema_version: 2,
      action: 'clarify',
      items: [{ activity_id: a.id, date_reference: { kind: 'today' }, value: null }],
      missing: ['value'],
    },
  });
}
for (const [i, text] of [
  'Bisa tampilkan catatan ibadah saya hari ini?',
  'Tolong perlihatkan semua isian hari ini.',
  'Saya ingin melihat rekap hari ini.',
  'Bagaimana catatan SDJ saya hari ini?',
  'Bantu cek rangkuman aktivitas hari ini.',
].entries())
  cases.push({
    id: `summary-${i}`,
    text,
    expected: { schema_version: 2, action: 'daily_summary', date_reference: { kind: 'today' } },
  });
for (const [i, text] of [
  'Tambah skor zuhur saya satu.',
  'Kirim email ke pengelola.',
  'Buatkan spreadsheet baru.',
  'Ubah semua rumus progres saya.',
  'Hapus semua data peserta lain.',
].entries())
  cases.push({
    id: `unsupported-${i}`,
    text,
    expected: { schema_version: 2, action: 'unsupported' },
  });
if (cases.length !== 100) throw new Error('EVALUATION_DATASET_SIZE');
