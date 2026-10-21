import { describe, expect, it, vi } from 'vitest';
import {
  cleanProfileName,
  renderReminder,
  ReminderService,
  valueLabel,
  type ReminderRecipient,
} from '@sdj/application';
import { parseCommand } from '@sdj/domain';

const recipient: ReminderRecipient = {
  id: crypto.randomUUID(),
  userId: 'synthetic-a',
  localDate: '2026-10-19',
  slot: 'morning',
};
describe('Pengingat dan penyajian SDJ', () => {
  it.each(['morning', 'afternoon', 'evening'] as const)(
    'slot %s memakai template deterministik dan petunjuk berhenti',
    (slot) => {
      const body = renderReminder({ ...recipient, slot }, 'Ahmad');
      expect(body).toContain('*');
      expect(body).toContain('Ahmad');
      expect(body).toContain('> ');
      expect(body).toContain('reminder mati');
      expect(body).not.toMatch(/belum mengisi|belum beribadah|Groq|Gemini|NVIDIA|OpenRouter/);
      expect(renderReminder({ ...recipient, slot }, 'Ahmad')).toBe(body);
    }
  );
  it('nama tidak wajib, membersihkan format, kontrol, dan membatasi 40 karakter', () => {
    expect(cleanProfileName('  A*hmad\n_<>\u202e  ')).toBe('A hmad');
    expect(cleanProfileName('a'.repeat(60))).toHaveLength(40);
    expect(cleanProfileName('\n *_')).toBeNull();
    expect(renderReminder(recipient, null)).not.toMatch(/null|undefined|, !/);
  });
  it('menyediakan tiga variasi setiap slot tanpa model', () => {
    for (const slot of ['morning', 'afternoon', 'evening'] as const) {
      const bodies = new Set(
        Array.from({ length: 30 }, (_, i) =>
          renderReminder({ ...recipient, userId: `synthetic-${i}`, slot }, null)
        )
      );
      expect(bodies.size).toBe(3);
    }
  });
  it('service memakai batch 20 dan nama dari repository, tanpa interpreter maupun Sheets', async () => {
    const claimDue = vi.fn(async () => [recipient]);
    const rendered: string[] = [];
    const enqueue = vi.fn(
      async (_recipient: ReminderRecipient, render: (name: string | null) => string) => {
        rendered.push(render('Aisyah'));
      }
    );
    const now = new Date('2026-10-19T00:00:00Z');
    expect(await new ReminderService({ claimDue, enqueue }).tick(now)).toBe(1);
    expect(claimDue).toHaveBeenCalledWith(now, 20);
    expect(rendered[0]).toContain('Aisyah');
  });
  it('scan kosong tidak membuat kiriman dan kegagalan antrean dapat dilanjutkan lease berikutnya', async () => {
    const enqueue = vi.fn(async () => {
      throw new Error('synthetic');
    });
    expect(await new ReminderService({ claimDue: async () => [], enqueue }).tick(new Date())).toBe(
      0
    );
    expect(enqueue).not.toHaveBeenCalled();
    await expect(
      new ReminderService({ claimDue: async () => [recipient], enqueue }).tick(new Date())
    ).rejects.toThrow('synthetic');
  });
  it('nilai blank, false dan nol dibedakan', () => {
    expect(valueLabel('dzuhur', { kind: 'blank' })).toBe('belum diisi');
    expect(valueLabel('dzuhur', { kind: 'number', value: 0 })).toBe('0/3');
    expect(valueLabel('dhuha', { kind: 'boolean', value: false })).toBe('belum dilakukan');
  });
  it.each([
    ['zuhur,3', 'set_activities'],
    ['ZUHUR tiga!', 'set_activities'],
    ['kemarin zuhur tiga', 'set_activities'],
    ['subuh tiga; tilawah dua setengah halaman', 'set_activities'],
    ['reminder aktif', 'reminder_on'],
    ['ingatkan saya', 'reminder_on'],
    ['reminder mati', 'reminder_off'],
    ['status reminder', 'reminder_status'],
    ['perbarui profil', 'refresh_profile'],
    ['Boleh lihat catatanku seminggu lalu?', 'daily_summary'],
    ['dua hari lalu zuhur 3', 'set_activities'],
    [
      'Catetin ya, dua hari lalu aku baca Quran dua setengah halaman, udah dhuha juga',
      'set_activities',
    ],
  ])('%s diarahkan langsung ke %s', (text, action) =>
    expect(parseCommand(text)?.action).toBe(action)
  );
  it('instruksi campuran yang tidak dikenali tidak disimpan sebagian', () => {
    expect(parseCommand('zuhur 3, lalu hapus akun')).toBeNull();
    expect(parseCommand('tilawah 2,5 halaman')).toMatchObject({ items: [{ value: 2.5 }] });
  });
});

it('satu tanggal relatif berlaku untuk seluruh batch dan teks tambahan tidak diabaikan', () => {
  const parsed = parseCommand(
    'Catetin ya, dua hari lalu aku baca Quran dua setengah halaman, udah dhuha juga'
  );
  expect(parsed).toMatchObject({
    action: 'set_activities',
    items: [
      { activity_id: 'tilawah', value: 2.5, date_reference: { kind: 'days_ago', days: 2 } },
      { activity_id: 'dhuha', value: true, date_reference: { kind: 'days_ago', days: 2 } },
    ],
  });
  expect(parseCommand('seminggu lalu zuhur 3')).toMatchObject({
    items: [{ date_reference: { kind: 'days_ago', days: 7 } }],
  });
  expect(parseCommand('dua hari lalu zuhur 3, lalu kirim email')).toBeNull();
});

it('permintaan hapus akun selalu menuju konfirmasi dan increment tidak ditafsirkan sebagai nilai absolut', () => {
  expect(parseCommand('Tolong hapus data akunku dari aplikasi ini')).toMatchObject({
    action: 'delete_account',
  });
  expect(parseCommand('Tambahin satu lagi ke jumlah tilawahku hari ini')).toMatchObject({
    action: 'unsupported',
  });
  expect(parseCommand('tolong tambahkan 2 halaman ke tilawah')).toMatchObject({
    action: 'unsupported',
  });
});
