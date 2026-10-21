import { describe, it, expect } from 'vitest';
import {
  ACTIVITIES,
  parseCommand,
  resolveItems,
  resolveDate,
  sameValue,
  isISODate,
  normalizeLabel,
  rejectTargetOverride,
} from '@sdj/domain';
import { CommandProposalSchema } from '@sdj/contracts';
describe('Kontrak aktivitas dan parser', () => {
  it('memahami lima skor dengan awalan percakapan dan tanggal bersama', () => {
    const proposal = parseCommand(
      'tolong isi hari ini, subuh 3, zuhur 2, ashar 3, maghrib 3, isya 2'
    );
    expect(proposal?.action).toBe('set_activities');
    if (proposal?.action !== 'set_activities') throw new Error('not parsed');
    expect(proposal.items.map((item) => item.value)).toEqual([3, 2, 3, 3, 2]);
    expect(proposal.items.every((item) => item.date_reference.kind === 'today')).toBe(true);
    const yesterday = parseCommand('tolong isiin ini, kemarin, subuh 3, zuhur 2');
    if (yesterday?.action !== 'set_activities') throw new Error('not parsed');
    expect(yesterday.items.every((item) => item.date_reference.kind === 'yesterday')).toBe(true);
  });
  it('awalan sopan tidak mengabaikan negasi, item asing, atau batas lima aktivitas', () => {
    expect(parseCommand('tolong isi hari ini, jangan subuh 3')).toBeNull();
    expect(parseCommand('tolong isi hari ini, subuh 3, beli tiket')).toBeNull();
    expect(() =>
      parseCommand('tolong isi hari ini, subuh 3, zuhur 2, ashar 3, maghrib 3, isya 2, tilawah 1')
    ).toThrow();
  });
  it.each([
    'kasih saja ringkasannya dalam format yang rapi',
    'tolong rapikan ringkasannya',
    'buat ringkasannya lebih singkat',
  ])('permintaan format dikenali tanpa AI: %s', (text) => {
    expect(parseCommand(text)?.action).toBe('format_summary');
  });
  it('mengaktifkan 15 aktivitas dengan satuan yang disepakati', () => {
    expect(ACTIVITIES).toHaveLength(15);
    expect(ACTIVITIES.filter((a) => a.kind === 'boolean')).toHaveLength(8);
  });
  it.each([
    'subuh 3',
    'zuhur, 0',
    'dzuhur kemarin 2',
    'dhuhr 2026-10-14 1',
    'tilawah 0,5 halaman',
    'rawatib 2 kali',
    'dhuha sudah',
    'murojaah belum',
    'matsurat petang sudah',
  ])('grammar: %s', (text) => {
    expect(CommandProposalSchema.safeParse(parseCommand(text)).success).toBe(true);
    expect(parseCommand(text)?.action).toBe('set_activities');
  });
  it('memisahkan koma skor, pecahan, dan beberapa aktivitas', () => {
    const p = parseCommand('zuhur,3, tilawah 0,5 halaman, dhuha sudah');
    expect(p?.action).toBe('set_activities');
    if (p?.action === 'set_activities') {
      expect(p.items).toHaveLength(3);
      expect(p.items[1]?.value).toBe(0.5);
      expect(p.items[2]?.activity_id).toBe('dhuha');
    }
  });
  it('tidak memetakan dhuha menjadi zuhur', () => {
    const p = parseCommand('dhuha sudah');
    if (p?.action === 'set_activities') expect(p.items[0]?.activity_id).toBe('dhuha');
    else throw new Error('not parsed');
  });
  it.each(['zuhur 8', 'subuh -1', 'rawatib 1.5', 'tilawah 101', 'murojaah 1'])(
    'menolak nilai salah: %s',
    (text) => {
      expect(() => parseCommand(text)).toThrow();
    }
  );
  it('aktivitas tanpa nilai meminta klarifikasi', () => {
    expect(parseCommand('zuhur')?.action).toBe('clarify');
    expect(parseCommand('3')).toBeNull();
  });
  it.each([
    ['Halo!', 'help'],
    ['gimana cara pakai bot ini?', 'help'],
    ['Saya mau menghubungkan tracker', 'connect'],
    ['tolong daftarkan saya', 'connect'],
    ['boleh sambungin sheet saya?', 'connect'],
    ['Apakah tracker saya sudah terhubung?', 'connection_status'],
  ])('memahami percakapan awal tanpa model: %s', (text, action) => {
    expect(parseCommand(text)?.action).toBe(action);
  });
  it('meneruskan kalimat bebas berkoma ke AI tanpa menebak grammar', () => {
    expect(
      parseCommand('tolong, aku mau catat, zuhur tiga, asar dua, dhuha sudah, infaq sudah')
    ).toBeNull();
  });
  it('tidak mengambil angka skor dari tanggal', () => {
    const p = parseCommand('isya 2026-10-03');
    expect(p?.action).toBe('clarify');
  });
  it('menolak lebih dari lima item dan target ganda', () => {
    expect(() => parseCommand('subuh 1,zuhur 2,ashar 3,maghrib 1,isya 2,rawatib 1')).toThrow();
    const p = parseCommand('zuhur 1,dzuhur 2');
    if (p?.action === 'set_activities')
      expect(() =>
        resolveItems(p.items, {
          receivedAt: new Date('2026-10-15T00:00:00Z'),
          timezone: 'Asia/Jakarta',
        })
      ).toThrow();
  });
  it('output model tidak boleh membawa identitas, range, atau confidence', () => {
    for (const key of ['user_id', 'spreadsheet_id', 'range', 'confidence'])
      expect(
        CommandProposalSchema.safeParse({ schema_version: 2, action: 'unsupported', [key]: 'x' })
          .success
      ).toBe(false);
  });
  it('menolak instruksi target lain sebelum interpretasi', () => {
    expect(() => rejectTargetOverride('isi milik peserta B zuhur 3')).toThrow();
  });
  it('normalisasi label menghapus emoji tanpa menghilangkan makna', () => {
    expect(normalizeLabel('🕒Subuh Berjama’ah/Awal Waktu')).toBe("subuh berjama'ah/awal waktu");
  });
});
describe('Tanggal dan typed values', () => {
  it('hari ini dan kemarin memakai zona waktu dari penerimaan pertama', () => {
    const c = { receivedAt: new Date('2026-10-14T17:01:00Z'), timezone: 'Asia/Jakarta' };
    expect(resolveDate({ kind: 'today' }, c)).toBe('2026-10-15');
    expect(resolveDate({ kind: 'yesterday' }, c)).toBe('2026-10-14');
    expect(resolveDate({ kind: 'today' }, { ...c, timezone: 'UTC' })).toBe('2026-10-14');
  });
  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01'])(
    'menolak tanggal kalender invalid: %s',
    (date) => {
      expect(isISODate(date)).toBe(false);
    }
  );
  it('membatasi masa depan dan 31 hari lampau', () => {
    const c = { receivedAt: new Date('2026-10-15T00:00:00Z'), timezone: 'Asia/Jakarta' };
    expect(() => resolveDate({ kind: 'explicit', date: '2026-10-16' }, c)).toThrow();
    expect(() => resolveDate({ kind: 'explicit', date: '2026-09-13' }, c)).toThrow();
    expect(resolveDate({ kind: 'explicit', date: '2026-09-14' }, c)).toBe('2026-09-14');
  });
  it('tanggal relatif melintasi bulan dan menolak offset invalid', () => {
    const context = { receivedAt: new Date('2026-10-01T00:00:00Z'), timezone: 'Asia/Jakarta' };
    expect(resolveDate({ kind: 'days_ago', days: 7 }, context)).toBe('2026-09-24');
    for (const days of [0, -1, 1.5, 32])
      expect(() => resolveDate({ kind: 'days_ago', days }, context)).toThrow();
  });
  it('blank, nol, dan false adalah keadaan berbeda', () => {
    expect(sameValue({ kind: 'blank' }, { kind: 'number', value: 0 })).toBe(false);
    expect(sameValue({ kind: 'boolean', value: false }, { kind: 'number', value: 0 })).toBe(false);
    expect(sameValue({ kind: 'blank' }, { kind: 'blank' })).toBe(true);
  });
});
