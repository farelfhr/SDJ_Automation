import { describe, it, expect, vi } from 'vitest';
import { CommandService } from '@sdj/application';
import {
  FakeClock,
  MemoryStore,
  FakeTrackerGateway,
  FakeInterpreter,
  FakeOnboarding,
  syntheticEvent,
} from '@sdj/testing';
function setup() {
  const clock = new FakeClock(),
    store = new MemoryStore(clock),
    sheets = new FakeTrackerGateway(),
    ai = new FakeInterpreter();
  const service = new CommandService(store, sheets, ai, new FakeOnboarding(), clock);
  return { clock, store, sheets, ai, service };
}
async function participant(s: ReturnType<typeof setup>, sender: string) {
  const event = syntheticEvent('bantuan', sender, s.clock);
  const { actor } = await s.store.ingest(event, s.clock.now());
  const tracker = s.store.activate(actor);
  await s.service.process(actor);
  return { actor, tracker };
}
async function send(s: ReturnType<typeof setup>, text: string, sender = 'a') {
  const event = syntheticEvent(text, sender, s.clock);
  const r = await s.store.ingest(event, s.clock.now());
  await s.service.process(r.actor);
  return { ...r, event };
}
describe('Vertical slice dua peserta', () => {
  it('peserta dengan izin provider lama mengonfirmasi tambahan OpenRouter sebelum pesan diteruskan', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    s.store.users.get(a.actor.userId)!.providerPolicyVersion = 'free-providers-v1';
    vi.spyOn(s.ai, 'interpret').mockImplementation(async () => {
      s.ai.calls++;
      return {
        schema_version: 2,
        action: 'set_activities',
        items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
      };
    });
    await send(s, 'bantu catat subuhku tiga ya');
    expect(s.ai.calls).toBe(0);
    expect(s.sheets.writeCalls).toBe(0);
    expect(s.store.responses(a.actor).at(-1)).toContain('layanan AI eksternal');
    await send(s, 'setuju');
    expect((await s.store.user(a.actor)).providerPolicyVersion).toBe('free-providers-v2');
    expect(s.ai.calls).toBe(1);
    expect(s.sheets.writeCalls).toBe(1);
  });
  it('pesan beberapa baris, status harian, dan putuskan koneksi tetap bekerja saat semua AI gagal', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    const ai = vi.spyOn(s.ai, 'interpret').mockRejectedValue(new Error('AI unavailable'));
    await send(s, 'subuh 3\nmaghrib 2\ntilawah 4 halaman');
    expect(s.sheets.writeCalls).toBe(1);
    await send(s, 'lihat status hari ini');
    expect(s.store.responses(a.actor).at(-1)).toContain('Subuh');
    await send(s, 'putuskan koneksi');
    expect((await s.store.pending(a.actor))?.mode).toBe('disconnect');
    expect((await s.store.user(a.actor)).status).toBe('active');
    expect(ai).not.toHaveBeenCalled();
  });
  it('nomor baru dapat mendaftar tetapi belum boleh mencatat sebelum aktivasi Google', async () => {
    const s = setup();
    const { actor } = await send(s, 'subuh 3', 'new-synthetic-participant');
    expect(s.sheets.writeCalls).toBe(0);
    expect((await s.store.user(actor)).status).toBe('pending');
    await send(s, 'daftar', 'new-synthetic-participant');
    expect(s.store.responses(actor).at(-1)).toContain('http://localhost/connect');
    expect(s.ai.calls).toBe(0);
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('kalimat pencatatan pada laporan pengguna tetap berjalan ketika AI tidak tersedia', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    const interpret = vi.spyOn(s.ai, 'interpret').mockRejectedValue(new Error('AI must not run'));
    await send(s, 'tolong isi hari ini, subuh 3, zuhur 2, ashar 3, maghrib 3, isya 2');
    expect(interpret).not.toHaveBeenCalled();
    expect(s.sheets.writeCalls).toBe(1);
    expect([...s.sheets.cells.values()].map((v) => (v.kind === 'number' ? v.value : null))).toEqual(
      [3, 2, 3, 3, 2]
    );
    expect(s.store.responses(a.actor).at(-1)).toContain('Catatanmu tersimpan');
  });
  it('merapikan rekap memakai periode terakhir sendiri tanpa AI dan data dibaca ulang', async () => {
    const s = setup(),
      a = await participant(s, 'a'),
      b = await participant(s, 'b');
    await send(s, 'rekap bulan ini');
    const inspect = vi.spyOn(s.sheets, 'inspect');
    vi.spyOn(s.ai, 'interpret').mockRejectedValue(new Error('AI must not run'));
    await send(s, 'kasih saja ringkasannya dalam format yang rapi', 'b');
    expect(s.store.responses(b.actor).at(-1)).toContain('Belum ada rekap');
    s.sheets.cells.set(s.sheets.key(a.tracker, 'subuh', '2026-10-15'), {
      kind: 'number',
      value: 3,
    });
    await send(s, 'kasih saja ringkasannya dalam format yang rapi');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(s.store.responses(a.actor).at(-1)).toContain('*Salat*');
    expect(s.store.responses(a.actor).at(-1)).toContain('Subuh: total 3 skor');
    expect(s.sheets.writeCalls).toBe(0);
    s.clock.advance(1800001);
    await send(s, 'kasih saja ringkasannya dalam format yang rapi');
    expect(s.store.responses(a.actor).at(-1)).toContain('Belum ada rekap');
  });
  it('tanggal kosong dari interpretasi bisa dijawab tanpa model dan tidak ditulis sebelum lengkap', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    vi.spyOn(s.ai, 'interpret')
      .mockResolvedValueOnce({
        schema_version: 2,
        action: 'clarify',
        items: [
          { activity_id: 'subuh', value: 3, date_reference: null },
          { activity_id: 'dzuhur', value: 2, date_reference: null },
        ],
        missing: ['date'],
      })
      .mockRejectedValue(new Error('AI must not run'));
    await send(s, 'bantu catat subuhku tiga sama zuhurku dua ya');
    expect(s.sheets.writeCalls).toBe(0);
    await send(s, 'hari ini');
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 2,
    });
  });
  it('retry setelah izin tersimpan tetap melanjutkan instruksi awal tepat satu kali', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    s.store.users.get(a.actor.userId)!.aiAllowed = false;
    await send(s, 'Tolong catat subuhku tiga ya');
    vi.spyOn(s.ai, 'interpret')
      .mockRejectedValueOnce(new Error('synthetic worker interruption'))
      .mockResolvedValue({
        schema_version: 2,
        action: 'set_activities',
        items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
      });
    const { actor } = await s.store.ingest(syntheticEvent('setuju', 'a', s.clock), s.clock.now());
    await expect(s.service.process(actor)).rejects.toThrow('synthetic worker interruption');
    expect((await s.store.user(actor)).aiAllowed).toBe(true);
    await s.service.process(actor);
    await s.service.process(actor);
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'subuh', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('tracker aktif tanpa izin AI meminta persetujuan di chat dan melanjutkan instruksi awal', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    s.store.users.get(a.actor.userId)!.aiAllowed = false;
    const interpret = vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
    });
    await send(s, 'Tolong catat subuhku tiga ya');
    expect(s.store.responses(a.actor).at(-1)).toContain(
      'Boleh aku bantu memahami bahasa sehari-hari?'
    );
    expect(interpret).not.toHaveBeenCalled();
    await send(s, 'iya saya setuju');
    expect((await s.store.user(a.actor)).aiAllowed).toBe(true);
    expect(interpret).toHaveBeenCalledWith(
      'Tolong catat subuhku tiga ya',
      expect.anything(),
      expect.any(String),
      { localDate: '2026-10-15' }
    );
    expect((await s.store.tracker(a.actor))?.id).toBe(a.tracker.id);
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'subuh', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('persetujuan AI terisolasi, dapat ditolak, dan kedaluwarsa tanpa menghubungkan ulang', async () => {
    const s = setup(),
      a = await participant(s, 'a'),
      b = await participant(s, 'b');
    s.store.users.get(a.actor.userId)!.aiAllowed = false;
    s.store.users.get(b.actor.userId)!.aiAllowed = false;
    await send(s, 'Tolong lihat progress saya bulan ini');
    await send(s, 'setuju', 'b');
    expect((await s.store.user(a.actor)).aiAllowed).toBe(false);
    expect((await s.store.user(b.actor)).aiAllowed).toBe(false);
    await send(s, 'tidak setuju');
    expect(s.store.responses(a.actor).at(-1)).toContain('Tracker tetap terhubung');
    await send(s, 'Tolong lihat progress saya bulan ini');
    s.clock.advance(600001);
    await send(s, 'setuju');
    expect((await s.store.user(a.actor)).aiAllowed).toBe(false);
    expect(s.ai.calls).toBe(0);
    await send(s, 'subuh, 3');
    expect(s.sheets.writeCalls).toBe(1);
  });
  it('persetujuan melewati tengah malam menjaga tanggal instruksi awal', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    s.store.users.get(a.actor.userId)!.aiAllowed = false;
    s.clock.advance((7 * 60 + 59) * 60000);
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
    });
    await send(s, 'Catat subuh hari ini tiga dong');
    s.clock.advance(120000);
    await send(s, 'setuju');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'subuh', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'subuh', '2026-10-16'))).toBeUndefined();
  });
  it('progres bulanan membaca semua hari sampai hari ini dan membedakan kosong/nol/false', async () => {
    const s = setup(),
      a = await participant(s, 'a'),
      b = await participant(s, 'b');
    s.sheets.cells.set(s.sheets.key(a.tracker, 'subuh', '2026-10-01'), {
      kind: 'number',
      value: 3,
    });
    s.sheets.cells.set(s.sheets.key(a.tracker, 'subuh', '2026-10-02'), {
      kind: 'number',
      value: 0,
    });
    s.sheets.cells.set(s.sheets.key(a.tracker, 'tilawah', '2026-10-01'), {
      kind: 'number',
      value: 2.5,
    });
    s.sheets.cells.set(s.sheets.key(a.tracker, 'dhuha', '2026-10-01'), {
      kind: 'boolean',
      value: true,
    });
    s.sheets.cells.set(s.sheets.key(a.tracker, 'dhuha', '2026-10-02'), {
      kind: 'boolean',
      value: false,
    });
    s.sheets.cells.set(s.sheets.key(a.tracker, 'subuh', '2026-10-16'), {
      kind: 'number',
      value: 3,
    });
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'monthly_summary',
      date_reference: { kind: 'today' },
    });
    await send(s, 'bisa kamu cek progress saya bulan ini?');
    const response = s.store.responses(a.actor).at(-1);
    expect(response).toContain('*Progres 2026-10*');
    expect(response).toContain('Periode: 2026-10-01 s.d. 2026-10-15');
    expect(response).toContain('Subuh: total 3 skor, rata-rata 1,5/3; 2/15 hari terisi');
    expect(response).toContain('Tilawah: 2,5 halaman; 1/15 hari terisi');
    expect(response).toContain('Dhuha: 1/15 hari dicentang');
    expect(s.sheets.writeCalls).toBe(0);
    expect(s.store.responses(b.actor)).toHaveLength(1);
  });
  it('percakapan awal berjalan sebelum consent dan bahasa bebas tidak mengirim data tanpa consent', async () => {
    const s = setup();
    const { actor } = await send(s, 'Saya mau menghubungkan tracker');
    expect(s.store.responses(actor).at(-1)).toContain('http://localhost/connect');
    await send(s, 'Tolong catat zuhurku tiga dong');
    expect(s.ai.calls).toBe(0);
    expect(s.store.responses(actor).at(-1)).toContain('persetujuan pemrosesan AI');
  });
  it('klarifikasi gabungan menanyakan slot yang kurang lalu menulis seluruh batch bersama', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    await send(s, 'zuhur 3,tilawah,dhuha');
    expect(s.sheets.writeCalls).toBe(0);
    expect(s.store.responses(a.actor).at(-1)).toContain(
      'Tilawah ingin dicatat berapa halaman?\nDhuha sudah dilakukan atau belum?'
    );
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      continues_pending: true,
      items: [
        { activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 3 },
        { activity_id: 'tilawah', date_reference: { kind: 'today' }, value: 2.5 },
        { activity_id: 'dhuha', date_reference: { kind: 'today' }, value: true },
      ],
    });
    await send(s, 'tilawah dua setengah halaman, dhuha udah');
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('tanggal pesan tertunda dapat dijawab dengan nama bulan', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    const event = { ...syntheticEvent('zuhur 3', 'a', s.clock), sent_at: '2026-10-15T08:00:00Z' };
    const { actor } = await s.store.ingest(event, s.clock.now());
    await s.service.process(actor);
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      continues_pending: true,
      items: [
        {
          activity_id: 'dzuhur',
          date_reference: { kind: 'explicit', date: '2026-10-14' },
          value: 3,
        },
      ],
    });
    await send(s, 'tanggal 14 Oktober 2026 ya');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-14'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('instruksi bebas mencatat gabungan, rekap, dan undo melalui use case yang sama', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    vi.spyOn(s.ai, 'interpret')
      .mockResolvedValueOnce({
        schema_version: 2,
        action: 'set_activities',
        items: [
          { activity_id: 'tilawah', date_reference: { kind: 'days_ago', days: 2 }, value: 2.5 },
          { activity_id: 'dhuha', date_reference: { kind: 'days_ago', days: 2 }, value: true },
        ],
      })
      .mockResolvedValueOnce({ schema_version: 2, action: 'undo_last' });
    await send(
      s,
      'Dua hari lalu aku baca Quran dua setengah halaman, sudah dhuha juga. Catetin ya'
    );
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'tilawah', '2026-10-13'))).toEqual({
      kind: 'number',
      value: 2.5,
    });
    await send(s, 'Boleh lihat catatan dua hari lalu?');
    expect(s.store.responses(a.actor).at(-1)).toContain('13 Oktober 2026');
    await send(s, 'Kembalikan pencatatan yang barusan dong');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'tilawah', '2026-10-13'))).toEqual({
      kind: 'blank',
    });
  });
  it('jawaban percakapan melengkapi pending dan mempertahankan tanggal sebelum tengah malam', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    s.clock.advance((7 * 60 + 59) * 60000);
    await send(s, 'zuhur');
    s.clock.advance(120000);
    const interpret = vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      continues_pending: true,
      items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 3 }],
    });
    await send(s, 'yang zuhur itu tiga aja ya');
    expect(interpret.mock.calls[0]?.[3]).toMatchObject({
      localDate: '2026-10-16',
      pending: { localDate: '2026-10-15' },
    });
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-16'))).toBeUndefined();
  });
  it('model tidak boleh mengarang pending peserta lain atau mengganti slot yang sudah jelas', async () => {
    const s = setup();
    await participant(s, 'a');
    await participant(s, 'b');
    await send(s, 'zuhur 3,tilawah');
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      continues_pending: true,
      items: [
        { activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 2 },
        { activity_id: 'tilawah', date_reference: { kind: 'today' }, value: 1 },
      ],
    });
    await send(s, 'tilawahnya satu halaman aja', 'b');
    await send(s, 'tilawahnya satu halaman aja');
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('permintaan hapus akun bahasa bebas meminta konfirmasi dan penolakan tidak menghapus', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    vi.spyOn(s.ai, 'interpret')
      .mockResolvedValueOnce({ schema_version: 2, action: 'delete_account' })
      .mockResolvedValueOnce({ schema_version: 2, action: 'confirm_pending' });
    await send(s, 'Tolong hapus data akunku dari aplikasi ini');
    expect((await s.store.user(a.actor)).status).toBe('active');
    await send(s, 'jangan, saya belum setuju untuk lanjutkan');
    expect((await s.store.user(a.actor)).status).toBe('active');
    await send(s, 'tidak jadi');
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('persetujuan bahasa bebas hanya berlaku setelah permintaan konfirmasi peserta itu sendiri', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    vi.spyOn(s.ai, 'interpret')
      .mockResolvedValueOnce({ schema_version: 2, action: 'confirm_pending' })
      .mockResolvedValueOnce({ schema_version: 2, action: 'disconnect' })
      .mockResolvedValueOnce({ schema_version: 2, action: 'confirm_pending' });
    await send(s, 'iya lanjutkan saja');
    expect((await s.store.user(a.actor)).status).toBe('active');
    await send(s, 'Lepaskan saja sambungan Google saya');
    await send(s, 'iya saya setuju, silakan lanjutkan');
    expect((await s.store.user(a.actor)).status).toBe('pending');
  });
  it('mencatat, rekap, koreksi, dedupe, lalu undo seluruh pesan', async () => {
    const s = setup();
    const a = await participant(s, 'a'),
      b = await participant(s, 'b');
    const first = await send(s, 'zuhur 3,tilawah 0,5 halaman,dhuha sudah');
    expect(s.sheets.writeCalls).toBe(1);
    await send(s, 'zuhur 2');
    expect(s.sheets.writeCalls).toBe(2);
    await send(s, 'rekap hari ini');
    expect(s.store.responses(a.actor).at(-1)).toContain('Zuhur: *2/3*');
    expect(s.store.responses(a.actor).at(-1)).toContain('Tilawah: *0,5 halaman*');
    expect(s.sheets.cells.get(s.sheets.key(b.tracker, 'dzuhur', '2026-10-15'))).toBeUndefined();
    const duplicate = await s.store.ingest(first.event, s.clock.now());
    expect(duplicate.duplicate).toBe(true);
    await s.service.process(first.actor);
    expect(s.sheets.writeCalls).toBe(2);
    await send(s, 'batal');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
    expect(s.ai.calls).toBe(0);
  });
  it('undo gabungan merestorasi blank dan false tanpa menyamakan nol', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    s.sheets.cells.set(s.sheets.key(a.tracker, 'dhuha', '2026-10-15'), {
      kind: 'boolean',
      value: false,
    });
    await send(s, 'zuhur 0,dhuha sudah');
    await send(s, 'batal');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'blank',
    });
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dhuha', '2026-10-15'))).toEqual({
      kind: 'boolean',
      value: false,
    });
    await send(s, 'batal');
    expect(s.sheets.writeCalls).toBe(2);
  });
  it('tidak menulis seluruh batch jika salah satu item invalid', async () => {
    const s = setup();
    await participant(s, 'a');
    await send(s, 'zuhur 3,tilawah 101');
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('mengisolasi klarifikasi peserta dan membekukan tanggal', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    await participant(s, 'b');
    await send(s, 'zuhur');
    await send(s, '3', 'b');
    expect(s.sheets.writeCalls).toBe(0);
    await send(s, '3');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('timeout setelah write menahan tracker sampai readback, tanpa replay', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    s.sheets.mode = 'timeout_after_write';
    await send(s, 'zuhur 3');
    expect(s.store.responses(a.actor).at(-1)).toContain('belum dapat dipastikan');
    await send(s, 'isya 2');
    expect(s.sheets.writeCalls).toBe(1);
    const group = [...s.store.groups.values()][0];
    expect(group).toBeDefined();
    s.sheets.mode = 'normal';
    if (group) await s.service.reconcile(a.actor, group.id);
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.store.groups.get(group?.id ?? '')?.status).toBe('verified');
  });
  it('undo menolak seluruh kelompok ketika satu sel diedit manual', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    await send(s, 'zuhur 3,rawatib 2');
    s.sheets.cells.set(s.sheets.key(a.tracker, 'rawatib', '2026-10-15'), {
      kind: 'number',
      value: 4,
    });
    await send(s, 'batal');
    expect(s.sheets.writeCalls).toBe(1);
  });
  it('formula tidak ditimpa dan pengulangan nilai menjadi no-op', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    s.sheets.formulas.add(s.sheets.key(a.tracker, 'dzuhur', '2026-10-15'));
    await send(s, 'zuhur 3');
    expect(s.sheets.writeCalls).toBe(0);
    s.sheets.formulas.clear();
    await send(s, 'zuhur 0');
    await send(s, 'zuhur 0');
    expect(s.sheets.writeCalls).toBe(1);
    expect(s.store.responses(a.actor).at(-1)).toContain('Catatanmu sudah sesuai');
  });
  it('ID sama dengan body berbeda dikarantina', async () => {
    const s = setup();
    const r = await send(s, 'bantuan');
    const other = await s.store.ingest({ ...r.event, text: 'zuhur 3' }, s.clock.now());
    expect(other.collision).toBe(true);
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('pesan tertunda meminta tanggal sebelum penulisan', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    const event = { ...syntheticEvent('zuhur 3', 'a', s.clock), sent_at: '2026-10-15T08:00:00Z' };
    const r = await s.store.ingest(event, s.clock.now());
    await s.service.process(r.actor);
    expect(s.sheets.writeCalls).toBe(0);
    await send(s, '2026-10-14');
    expect(s.sheets.cells.get(s.sheets.key(a.tracker, 'dzuhur', '2026-10-14'))).toEqual({
      kind: 'number',
      value: 3,
    });
  });
  it('TTL undo ditolak', async () => {
    const s = setup();
    await participant(s, 'a');
    await send(s, 'zuhur 3');
    s.clock.advance(600001);
    await send(s, 'batal');
    expect(s.sheets.writeCalls).toBe(1);
  });
  it('readback terus gagal berakhir needs_review dengan barrier tetap aktif', async () => {
    const s = setup(),
      a = await participant(s, 'a');
    s.sheets.mode = 'timeout_after_write';
    await send(s, 'zuhur 3');
    const group = [...s.store.groups.values()][0]!;
    s.clock.advance(900001);
    s.sheets.mode = 'read_error';
    await s.service.reconcile(a.actor, group.id);
    expect(s.store.groups.get(group.id)?.status).toBe('needs_review');
    await send(s, 'isya 3');
    expect(s.sheets.writeCalls).toBe(1);
  });
});

describe('Percakapan ramah dan pengaturan pengingat', () => {
  it('izin tidak berulang, perintah langsung mempertahankan permintaan awal lalu dilanjutkan sekali', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    s.store.users.get(a.actor.userId)!.aiAllowed = false;
    vi.spyOn(s.ai, 'interpret').mockResolvedValue({
      schema_version: 2,
      action: 'set_activities',
      items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
    });
    await send(s, 'tolong catat subuhku tiga ya');
    const first = await s.store.pending(a.actor);
    await send(s, 'tolong bantu pencatatanku');
    expect(s.store.responses(a.actor).at(-1)).toContain('Menunggu izinmu');
    expect(await s.store.pending(a.actor)).toEqual(first);
    await send(s, 'zuhur,2');
    expect(s.sheets.writeCalls).toBe(1);
    expect(await s.store.pending(a.actor)).toEqual(first);
    await send(s, 'setuju');
    expect(s.sheets.writeCalls).toBe(2);
    expect(s.ai.interpret).toHaveBeenCalledTimes(1);
    expect(await s.store.pending(a.actor)).toBeNull();
    expect(s.store.responses(a.actor).join(' ')).not.toMatch(/Gemini|NVIDIA|OpenRouter/);
  });
  it('reminder dan profil memakai parser tanpa model dan terisolasi per peserta', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    const b = await participant(s, 'b');
    await send(s, 'reminder mati');
    expect((await s.store.user(a.actor)).remindersEnabled).toBe(false);
    expect((await s.store.user(b.actor)).remindersEnabled).not.toBe(false);
    await send(s, 'status reminder');
    expect(s.store.responses(a.actor).at(-1)).toContain('07.00, 13.00, dan 20.00 WIB');
    await send(s, 'ingatkan saya');
    expect((await s.store.user(a.actor)).remindersEnabled).toBe(true);
    await send(s, 'perbarui profil');
    expect(s.store.responses(a.actor).at(-1)).toContain('Perbarui nama Google');
    expect(s.ai.calls).toBe(0);
    expect(s.sheets.writeCalls).toBe(0);
  });
  it('angka dalam kata dan jawaban singkat tidak memakai AI', async () => {
    const s = setup();
    const a = await participant(s, 'a');
    await send(s, 'zuhur tiga');
    await send(s, 'tilawah');
    await send(s, '2,5');
    expect(s.ai.calls).toBe(0);
    expect(s.sheets.writeCalls).toBe(2);
    expect(s.store.responses(a.actor).at(-1)).toContain('2,5 halaman');
  });
});

it('klarifikasi langsung mempertahankan permintaan AI awal tanpa memperpanjang izin', async () => {
  const s = setup();
  const a = await participant(s, 'a');
  s.store.users.get(a.actor.userId)!.aiAllowed = false;
  vi.spyOn(s.ai, 'interpret').mockResolvedValue({
    schema_version: 2,
    action: 'set_activities',
    items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 2 }],
  });
  await send(s, 'subuhku tadi dua ya tolong');
  const initial = await s.store.pending(a.actor);
  await send(s, 'zuhur');
  expect((await s.store.pending(a.actor))?.mode).toBe('slots');
  await send(s, '3');
  const restored = await s.store.pending(a.actor);
  expect(restored?.mode).toBe('ai_consent');
  expect(restored?.expiresAt).toBe(initial?.expiresAt);
  expect(restored?.deferred_request).toEqual(initial?.deferred_request);
  await send(s, 'setuju');
  expect(s.sheets.writeCalls).toBe(2);
  expect(s.ai.interpret).toHaveBeenCalledTimes(1);
});
