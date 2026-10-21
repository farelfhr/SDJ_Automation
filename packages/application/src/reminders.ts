import { message } from './messages.js';
export type ReminderSlot = 'morning' | 'afternoon' | 'evening';
export interface ReminderRecipient {
  id: string;
  userId: string;
  localDate: string;
  slot: ReminderSlot;
}
export interface ReminderStore {
  claimDue(now: Date, limit: number): Promise<ReminderRecipient[]>;
  enqueue(recipient: ReminderRecipient, render: (name: string | null) => string): Promise<void>;
}

export function cleanProfileName(value: string | undefined | null): string | null {
  const name = value
    ?.normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}*_~`<>\[\]\\]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? [...name].slice(0, 40).join('') : null;
}

const variants: Record<ReminderSlot, readonly string[]> = {
  morning: [
    'Selamat pagi{person}! Jangan lupa catat Subuh dan salat sunnah yang kamu kerjakan hari ini, ya.',
    'Hai{person}, semoga pagimu lancar! Yuk, perbarui catatan Subuh dan sunnah hari ini setelah kamu kerjakan.',
    'Pagi{person}! Sempatkan mencatat Subuh dan salat sunnah yang kamu kerjakan, ya.',
  ],
  afternoon: [
    'Hai{person}! Setelah selesai Zuhur dan sunnahnya, jangan lupa perbarui catatanmu, ya.',
    'Selamat siang{person}! Yuk, catat Zuhur dan salat sunnah yang sudah kamu kerjakan.',
    'Hai{person}, semoga harimu lancar! Seusai Zuhur dan sunnahnya, sempatkan mengisi SDJ, ya.',
  ],
  evening: [
    'Selamat malam{person}! Menjelang penghujung hari, yuk lengkapi catatan SDJ hari ini.',
    'Hai{person}! Sebelum beristirahat, sempatkan memperbarui catatan SDJ hari ini, ya.',
    'Malam{person}! Yuk, cek kembali dan lengkapi aktivitas yang ingin kamu catat di SDJ hari ini.',
  ],
};
export function renderReminder(recipient: ReminderRecipient, name: string | null): string {
  let hash = 2166136261;
  for (const c of `${recipient.userId}:${recipient.localDate}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const person = cleanProfileName(name);
  const body = variants[recipient.slot][hash % 3]!.replace('{person}', person ? `, ${person}` : '');
  const example =
    recipient.slot === 'morning'
      ? 'subuh 3'
      : recipient.slot === 'afternoon'
        ? 'zuhur 3'
        : 'rekap hari ini';
  return message('🔔 Pengingat SDJ', body, `Kirim “${example}”. Untuk berhenti: “reminder mati”.`);
}
export class ReminderService {
  constructor(private readonly store: ReminderStore) {}
  async tick(now: Date): Promise<number> {
    const recipients = await this.store.claimDue(now, 20);
    for (const recipient of recipients)
      await this.store.enqueue(recipient, (name) => renderReminder(recipient, name));
    return recipients.length;
  }
}
