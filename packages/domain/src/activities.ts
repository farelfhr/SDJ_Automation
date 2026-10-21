export const ACTIVITY_IDS = [
  'subuh',
  'dzuhur',
  'ashar',
  'maghrib',
  'isya',
  'rawatib',
  'tilawah',
  'murojaah',
  'matsurat_pagi',
  'matsurat_petang',
  'dhuha',
  'tahajjud',
  'infaq',
  'puasa_sunnah',
  'merapikan_kamar',
] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];
export type TypedCellValue =
  { kind: 'blank' } | { kind: 'number'; value: number } | { kind: 'boolean'; value: boolean };
export interface ActivityDefinition {
  id: ActivityId;
  label: string;
  aliases: readonly string[];
  sourceLabels: readonly string[];
  kind: 'number' | 'boolean';
  integer: boolean;
  min: number;
  max: number | null;
  unit: string;
}
const numberActivity = (
  id: ActivityId,
  label: string,
  aliases: string[],
  sourceLabels: string[],
  integer: boolean,
  max: number | null,
  unit: string
): ActivityDefinition => ({
  id,
  label,
  aliases,
  sourceLabels,
  kind: 'number',
  integer,
  min: 0,
  max,
  unit,
});
const booleanActivity = (
  id: ActivityId,
  label: string,
  aliases: string[],
  sourceLabels: string[]
): ActivityDefinition => ({
  id,
  label,
  aliases,
  sourceLabels,
  kind: 'boolean',
  integer: false,
  min: 0,
  max: null,
  unit: 'pelaksanaan',
});
export const ACTIVITIES: readonly ActivityDefinition[] = [
  numberActivity(
    'subuh',
    'Subuh',
    ['subuh', 'shubuh', 'fajr'],
    ["Subuh Berjama'ah/Awal Waktu"],
    true,
    3,
    'skor'
  ),
  numberActivity(
    'dzuhur',
    'Zuhur',
    ['dzuhur', 'zuhur', 'dhuhr', 'zhuhur'],
    ["Dzuhur Berjama'ah/Awal Waktu", "Zuhur Berjama'ah/Awal Waktu"],
    true,
    3,
    'skor'
  ),
  numberActivity(
    'ashar',
    'Ashar',
    ['ashar', 'asar', 'asr'],
    ["Ashar Berjama'ah/Awal Waktu"],
    true,
    3,
    'skor'
  ),
  numberActivity(
    'maghrib',
    'Maghrib',
    ['maghrib', 'magrib'],
    ["Maghrib Berjama'ah/Awal Waktu"],
    true,
    3,
    'skor'
  ),
  numberActivity(
    'isya',
    'Isya',
    ['isya', "isya'", 'isha'],
    ["Isya Berjama'ah/Awal Waktu"],
    true,
    3,
    'skor'
  ),
  numberActivity(
    'rawatib',
    'Rawatib',
    ['rawatib', 'sholat sunnah rawatib', 'salat sunnah rawatib'],
    ['Sholat sunnah rawatib'],
    true,
    null,
    'kali'
  ),
  numberActivity(
    'tilawah',
    'Tilawah',
    ['tilawah', 'baca quran'],
    ['Tilawah Al Quran (halaman)'],
    false,
    100,
    'halaman'
  ),
  booleanActivity(
    'murojaah',
    'Murojaah',
    ['murojaah', 'murajaah'],
    ["Muroja'ah Al Quran (halaman)", "Muroja'ah Al Quran", 'Murojaah']
  ),
  booleanActivity(
    'matsurat_pagi',
    'Al-Matsurat Pagi',
    ['al-matsurat pagi', 'matsurat pagi', 'almatsurat pagi'],
    ['Al-Matsurat Pagi']
  ),
  booleanActivity(
    'matsurat_petang',
    'Al-Matsurat Petang',
    ['al-matsurat petang', 'matsurat petang', 'matsurat sore', 'almatsurat petang'],
    ['Al-Matsurat Petang']
  ),
  booleanActivity(
    'dhuha',
    'Dhuha',
    ['dhuha', 'duha', 'sholat dhuha'],
    ['Sholat Dhuha (pelaksanaan)']
  ),
  booleanActivity(
    'tahajjud',
    'Tahajjud',
    ['tahajjud', 'tahajud', 'sholat tahajjud'],
    ['Sholat Tahajjud (pelaksanaan)']
  ),
  booleanActivity(
    'infaq',
    'Infaq',
    ['infaq', 'infak', 'sedekah'],
    ['Infaq/Ajak Infaq (pelaksanaan)']
  ),
  booleanActivity(
    'puasa_sunnah',
    'Puasa Sunnah',
    ['puasa sunnah', 'shaum sunnah', 'puasa sunah'],
    ['Shaum/Puasa Sunnah']
  ),
  booleanActivity(
    'merapikan_kamar',
    'Merapikan Kamar',
    ['merapikan kamar', 'rapikan kamar', 'kamar rapi'],
    ['Merapikan Kamar (Setiap Hari)']
  ),
];
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export function activity(id: ActivityId): ActivityDefinition {
  const result = ACTIVITIES.find((a) => a.id === id);
  if (!result) throw new DomainError('ACTIVITY_INVALID', 'Aktivitas tidak dikenal.');
  return result;
}
export function validateValue(id: ActivityId, value: number | boolean): TypedCellValue {
  const a = activity(id);
  if (a.kind === 'boolean' && typeof value === 'boolean') return { kind: 'boolean', value };
  if (
    a.kind === 'number' &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= a.min &&
    (a.max === null || value <= a.max) &&
    (!a.integer || Number.isSafeInteger(value))
  )
    return { kind: 'number', value };
  throw new DomainError(
    'VALUE_OUT_OF_RANGE',
    `Nilai ${a.label} tidak sesuai. ${a.kind === 'boolean' ? 'Gunakan sudah/belum.' : `Gunakan angka ${a.min}${a.max === null ? ' atau lebih' : `–${a.max}`}${a.integer ? ' bulat' : ''}.`}`
  );
}
export function sameValue(a: TypedCellValue, b: TypedCellValue): boolean {
  return a.kind === b.kind && (a.kind === 'blank' || (b.kind !== 'blank' && a.value === b.value));
}
export function displayValue(value: TypedCellValue): string {
  return value.kind === 'blank'
    ? 'belum diisi'
    : value.kind === 'boolean'
      ? value.value
        ? 'sudah'
        : 'belum'
      : String(value.value);
}
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
