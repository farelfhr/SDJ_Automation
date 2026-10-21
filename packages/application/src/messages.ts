import { ACTIVITIES, activity, type ActivityId, type TypedCellValue } from '@sdj/domain';

export const AI_POLICY_VERSION = 'free-providers-v2';
export const HELP = `👋 *Hai, aku asisten SDJ!*

Aku bantu mencatat dan melihat 15 aktivitas SDJ, maksimal 5 aktivitas per pesan.

- *Catat:* zuhur 3, tilawah 2,5 halaman
- *Lihat:* rekap hari ini / progres bulan ini
- *Koreksi:* kirim aktivitas dan nilai penggantinya
- *Batalkan:* batal (dalam 10 menit)
- *Pengingat:* status reminder / reminder mati / reminder aktif
- *Nama Google:* perbarui profil

Skor salat *0–3*, rawatib dalam *kali*, tilawah dalam *halaman*.

> Baru mulai? Kirim “daftar” untuk menghubungkan tracker.`;

export function message(title: string, body: string, hint?: string): string {
  return `*${title}*\n\n${body}${hint ? `\n\n> ${hint}` : ''}`;
}

export function friendlyText(text: string): string {
  return text
    .replace(/\bAnda\b/g, 'kamu')
    .replace(/\bSaya\b/g, 'Aku')
    .replace(/\bsaya\b/g, 'aku')
    .replace(/terverifikasi/g, 'sudah diperiksa');
}

/** Normalize legacy notices at the presentation boundary; never alter stored domain values. */
export function presentNotice(text: string): string {
  const friendly = friendlyText(text);
  return friendly.includes('*') ? friendly : message('Catatan SDJ', friendly);
}

export function consentMessage(privacyUrl: string): string {
  return message(
    '✨ Boleh aku bantu memahami bahasa sehari-hari?',
    'Dengan izinmu, pesan dan konteks percakapan yang diperlukan dapat diproses oleh layanan AI eksternal. Informasi pribadi yang kamu ketik dapat ikut diproses.\n\n- Balas *setuju* untuk mengaktifkan dan melanjutkan permintaan tadi.\n- Balas *tidak* untuk memakai perintah singkat.',
    `Detail pemrosesan: ${privacyUrl}`
  );
}

export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(
    new Date(`${date}T12:00:00+07:00`)
  );
}

export function activityLabel(id: ActivityId): string {
  return (
    (
      {
        subuh: 'Subuh',
        dzuhur: 'Zuhur',
        ashar: 'Asar',
        maghrib: 'Magrib',
        isya: 'Isya',
      } as Partial<Record<ActivityId, string>>
    )[id] ?? activity(id).label
  );
}

export function valueLabel(id: ActivityId, value: TypedCellValue): string {
  if (value.kind === 'blank') return 'belum diisi';
  if (value.kind === 'boolean') return value.value ? 'sudah dilakukan' : 'belum dilakukan';
  const definition = activity(id);
  const n = value.value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return definition.unit === 'skor' ? `${n}/3` : `${n} ${definition.unit}`;
}

export function activityLines(
  items: readonly { activityId: ActivityId; localDate: string; value: TypedCellValue }[]
): string {
  const dates = [...new Set(items.map((i) => i.localDate))];
  return dates
    .map(
      (date) =>
        `*${dateLabel(date)}*\n` +
        items
          .filter((i) => i.localDate === date)
          .map((i) => `- ${activityLabel(i.activityId)}: *${valueLabel(i.activityId, i.value)}*`)
          .join('\n')
    )
    .join('\n\n');
}

export const REMINDER_SCHEDULE = '07.00, 13.00, dan 20.00 WIB';

export function dailyRecap(
  date: string,
  items: readonly { activityId: ActivityId; value: TypedCellValue }[]
): string {
  const groups = [
    { title: 'Salat', definitions: ACTIVITIES.slice(0, 5) },
    { title: 'Rawatib & tilawah', definitions: ACTIVITIES.slice(5, 7) },
    { title: 'Kebiasaan', definitions: ACTIVITIES.slice(7) },
  ];
  return message(
    '📋 Rekap harian',
    `*${dateLabel(date)}*\n\n` +
      groups
        .map(
          (group) =>
            `*${group.title}*\n` +
            group.definitions
              .map((definition) => {
                const item = items.find((i) => i.activityId === definition.id);
                return `- ${activityLabel(definition.id)}: *${valueLabel(definition.id, item?.value ?? { kind: 'blank' })}*`;
              })
              .join('\n')
        )
        .join('\n\n')
  );
}
export function reminderStatus(enabled: boolean): string {
  return message(
    '🔔 Pengingat SDJ',
    `Status: *${enabled ? 'aktif' : 'nonaktif'}*\nJadwal: *${REMINDER_SCHEDULE}*\n\nPengingat dikirim meskipun catatan hari ini sudah terisi.`,
    `Kirim “reminder ${enabled ? 'mati' : 'aktif'}” untuk ${enabled ? 'menghentikan' : 'mengaktifkan'} pengingat.`
  );
}
