import { ACTIVITIES, DomainError, validateValue } from './activities.js';
import { type DateReference, isISODate } from './dates.js';
import { type CommandProposal, type DraftItem, type ProposalItem } from './commands.js';
const commands: Record<string, CommandProposal['action']> = {
  'reminder aktif': 'reminder_on',
  'aktifkan reminder': 'reminder_on',
  'ingatkan saya': 'reminder_on',
  'reminder mati': 'reminder_off',
  'matikan reminder': 'reminder_off',
  'stop reminder': 'reminder_off',
  'berhenti mengingatkan': 'reminder_off',
  'status reminder': 'reminder_status',
  reminder: 'reminder_status',
  'perbarui profil': 'refresh_profile',
  bantuan: 'help',
  help: 'help',
  status: 'connection_status',
  batal: 'undo_last',
  undo: 'undo_last',
  daftar: 'connect',
  'putus koneksi': 'disconnect',
  'putuskan koneksi': 'disconnect',
  'hapus akun': 'delete_account',
  ya: 'confirm_pending',
  konfirmasi: 'confirm_pending',
  setuju: 'confirm_pending',
  'tidak jadi': 'cancel_pending',
  'jangan jadi': 'cancel_pending',
};
export function parseCommand(input: string): CommandProposal | null {
  const text = input
    .toLowerCase()
    .trim()
    .replace(/[\r\n]+/g, '; ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
  if (isIncrementRequest(text)) return { schema_version: 2, action: 'unsupported' };
  if (
    /^(?:tolong )?hapus (?:data )?akun(?:ku| saya)?(?: dari (?:aplikasi|bot)(?: ini)?)?$/.test(text)
  )
    return { schema_version: 2, action: 'delete_account' };
  const system = commands[text];
  if (
    system &&
    system !== 'set_activities' &&
    system !== 'daily_summary' &&
    system !== 'monthly_summary' &&
    system !== 'clarify'
  )
    return { schema_version: 2, action: system };
  const conversationalControls: readonly [RegExp, 'help' | 'connect' | 'connection_status'][] = [
    [
      /^(?:halo|hai|ass?alamualaikum|apa (?:yang )?bisa (?:kamu|anda) (?:bantu|lakukan)|(?:tolong )?(?:bagaimana|gimana) cara (?:pakai|menggunakan)(?: (?:bot|aplikasi)(?: ini)?)?)[.!?]*$/,
      'help',
    ],
    [
      /^(?:(?:saya|aku) (?:mau|ingin) |(?:tolong|bantu) )?(?:hubungkan|sambungkan|menghubungkan|menyambungkan)(?: (?:akun|google|sheet|sheets|tracker|saya|aku|ke|dengan|ini))+[.!?]*$/,
      'connect',
    ],
    [
      /^(?:(?:saya|aku) (?:mau|ingin) )?(?:daftar|mulai)(?: (?:dong|ya|pakai bot|menggunakan bot))?[.!?]*$/,
      'connect',
    ],
    [
      /^(?:tolong |bantu |boleh )?(?:daftarkan saya|sambungin (?:sheet|tracker|google)(?: saya)?)[.!?]*$/,
      'connect',
    ],
    [
      /^(?:apakah )?(?:tracker|akun|sheet)(?: saya| aku)? (?:sudah|udah) (?:terhubung|tersambung)(?: belum)?[.!?]*$/,
      'connection_status',
    ],
  ];
  for (const [pattern, action] of conversationalControls)
    if (pattern.test(text)) return { schema_version: 2, action };
  if (
    /^(?:(?:tolong|bantu|mohon)\s+)?(?:rapikan|rapihin|ringkaskan|singkatkan)\s+(?:ringkasan|ringkasannya|rekap|rekapnya|hasil|hasilnya|laporan|laporannya)(?:\s+(?:saya|tadi|itu))?[.!?]*$/.test(
      text
    )
  )
    return { schema_version: 2, action: 'format_summary' };
  if (
    /^(?:(?:tolong|bantu|kasih|berikan|buat|bikin|tampilkan|rapikan|rapihin|ubah|susun)(?:kan)?\s+)(?:(?:saja|dong|ya)\s+)?(?:(?:ringkasan|ringkasannya|rekap|rekapnya|hasil|hasilnya|laporan|laporannya)(?:\s+(?:saya|tadi|itu))?\s+)?(?:(?:dalam|dengan|jadi|ke|yang|agar|supaya|lebih|format|tampilan|bentuk)\s+)*(?:ringkas|rapi|rapih|singkat|poin(?:-poin)?|bullet)(?:\s+(?:saja|dong|ya|banget))?[.!?]*$/.test(
      text
    )
  )
    return { schema_version: 2, action: 'format_summary' };
  if (/^(?:rekap|ringkasan|progres|progress)(?: saya)? bulan ini[.!?]*$/.test(text))
    return { schema_version: 2, action: 'monthly_summary', date_reference: { kind: 'today' } };
  const datePattern =
    '(?:hari ini|kemarin|seminggu lalu|(?:\\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh) hari lalu|\\d{4}-\\d{2}-\\d{2})';
  const summary = text.match(
    new RegExp(
      '^(?:(?:boleh|tolong|bantu|bisa) )?(?:(?:lihat|cek|tampilkan) )?(?:rekap|ringkasan|status|catatanku|catatan(?: saya|ku)?|isian(?: saya)?)(?: (' +
        datePattern +
        '))?$'
    )
  );
  if (summary)
    return { schema_version: 2, action: 'daily_summary', date_reference: dateRef(summary[1]) };
  // Decimal commas are normalized before item delimiters; a comma after an alias is grammar punctuation.
  let source = text.replace(
    /^(?:(?:tolong|bantu|mohon)\s+)?(?:isiin|isi(?:kan)?|catatin|catetin|catat(?:kan)?|update|perbarui|masukkan)\b(?:\s+(?:ini|saya|aku|dong|ya|untuk))*\s*[,;:]?\s*/,
    ''
  );
  const leadingDate = source.match(new RegExp('^(' + datePattern + ')(?:\\s*[,;:]\\s*|\\s+)'));
  if (leadingDate) source = source.slice(leadingDate[0].length);
  source = source.replace(
    /\b(nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)(?: (setengah))?\b/g,
    (_match, word: string, half: string | undefined) =>
      String(
        [
          'nol',
          'satu',
          'dua',
          'tiga',
          'empat',
          'lima',
          'enam',
          'tujuh',
          'delapan',
          'sembilan',
          'sepuluh',
        ].indexOf(word) + (half ? 0.5 : 0)
      )
  );
  source = source.replace(/\bsetengah\b/g, '0.5');
  source = source.replace(/(\d),(\d)/g, '$1.$2');
  for (const a of ACTIVITIES)
    for (const alias of a.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      source = source.replace(
        new RegExp(
          escaped +
            ',(?=\\s*(?:-?\\d|sudah\\b|belum\\b|ya\\b|tidak\\b|true\\b|false\\b|selesai\\b))',
          'g'
        ),
        alias + ' '
      );
    }
  source = source.replace(
    /(?:^|[,;])\s*(?:aku|saya) (?:sudah |udah )?baca (?:quran|al-quran|al quran)\b/g,
    (match) =>
      (match.trimStart().startsWith(',') ? ',' : match.trimStart().startsWith(';') ? ';' : '') +
      'tilawah'
  );
  for (const definition of ACTIVITIES.filter((a) => a.kind === 'boolean')) {
    for (const alias of definition.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      source = source.replace(
        new RegExp(
          '(^|[,;]\\s*)(?:aku |saya )?(?:udah|sudah) ' + escaped + '(?: juga)?(?=$|[,;])',
          'g'
        ),
        '$1' + alias + ' sudah'
      );
    }
  }
  const parts = source.split(/\s*(?:,|;|\bdan\b)\s*/).filter(Boolean);
  const candidates: DraftItem[] = [];
  for (const part of parts) {
    const matched = ACTIVITIES.flatMap((a) => a.aliases.map((alias) => ({ a, alias })))
      .sort((a, b) => b.alias.length - a.alias.length)
      .find(({ alias }) => part === alias || part.startsWith(alias + ' '));
    if (!matched) return null;
    let rest = part.slice(matched.alias.length).trim();
    const dateMatch = rest.match(new RegExp('\\b(' + datePattern + ')\\b'));
    const reference = dateRef(dateMatch?.[0] ?? leadingDate?.[1]);
    if (dateMatch) rest = rest.replace(dateMatch[0], '').trim();
    rest = rest.replace(/\s+(halaman|hlm|kali|skor)$/, '').trim();
    let value: number | boolean | null = null;
    if (rest === '') value = null;
    else if (/^-?\d+(?:\.\d+)?$/.test(rest)) value = Number(rest);
    else if (matched.a.kind === 'boolean' && /^(sudah|ya|true|selesai)$/.test(rest)) value = true;
    else if (matched.a.kind === 'boolean' && /^(belum|tidak|false)$/.test(rest)) value = false;
    else return null;
    if (value !== null) validateValue(matched.a.id, value);
    candidates.push({ activity_id: matched.a.id, date_reference: reference, value });
  }
  if (candidates.length > 5)
    throw new DomainError('ITEM_LIMIT', 'Satu pesan dapat mencatat maksimal lima aktivitas.');
  if (candidates.some((i) => i.value === null))
    return { schema_version: 2, action: 'clarify', items: candidates, missing: ['value'] };
  const items: ProposalItem[] = [];
  for (const item of candidates)
    if (item.activity_id !== null && item.date_reference !== null && item.value !== null)
      items.push({
        activity_id: item.activity_id,
        date_reference: item.date_reference,
        value: item.value,
      });
  return items.length ? { schema_version: 2, action: 'set_activities', items } : null;
}
function dateRef(text: string | undefined): DateReference {
  if (!text || text === 'hari ini') return { kind: 'today' };
  if (text === 'kemarin') return { kind: 'yesterday' };
  if (text === 'seminggu lalu') return { kind: 'days_ago', days: 7 };
  const relative = text.match(
    /^(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh) hari lalu$/
  );
  if (relative) {
    const word = relative[1]!;
    const days = /^\d+$/.test(word)
      ? Number(word)
      : [
          'nol',
          'satu',
          'dua',
          'tiga',
          'empat',
          'lima',
          'enam',
          'tujuh',
          'delapan',
          'sembilan',
          'sepuluh',
        ].indexOf(word);
    if (days < 1 || days > 31)
      throw new DomainError('DATE_OUT_OF_POLICY', 'Gunakan tanggal dalam 31 hari terakhir.');
    return { kind: 'days_ago', days };
  }
  if (!isISODate(text)) throw new DomainError('DATE_OUT_OF_POLICY', 'Tanggal tidak valid.');
  return { kind: 'explicit', date: text };
}

export function isIncrementRequest(text: string): boolean {
  return /^(?:(?:tolong|bantu)\s+)?(?:tambah(?:kan|in)?|kurangi|kurangin)\s+(?:-?\d+(?:[.,]\d+)?|satu|dua|tiga|empat|lima|setengah)(?:\s+(?:lagi|halaman|kali|skor))*\s+(?:ke|dari|untuk|pada)\s+/i.test(
    text.trim()
  );
}
