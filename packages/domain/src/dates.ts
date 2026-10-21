import { DomainError } from './activities.js';
export type DateReference =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'days_ago'; days: number }
  | { kind: 'explicit'; date: string };
export interface DateContext {
  receivedAt: Date;
  timezone: string;
}
export function isISODate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(input + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input;
}
export function localToday(context: DateContext): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: context.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(context.receivedAt);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(date: string, days: number): string {
  if (!isISODate(date)) throw new DomainError('DATE_OUT_OF_POLICY', 'Tanggal tidak valid.');
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function resolveDate(reference: DateReference, context: DateContext): string {
  if (
    reference.kind === 'days_ago' &&
    (!Number.isInteger(reference.days) || reference.days < 1 || reference.days > 31)
  )
    throw new DomainError(
      'DATE_OUT_OF_POLICY',
      'Gunakan tanggal hari ini atau maksimal 31 hari lampau.'
    );
  const today = localToday(context);
  const date =
    reference.kind === 'today'
      ? today
      : reference.kind === 'yesterday'
        ? addDays(today, -1)
        : reference.kind === 'days_ago'
          ? addDays(today, -reference.days)
          : reference.date;
  if (!isISODate(date) || date > today || date < addDays(today, -31))
    throw new DomainError(
      'DATE_OUT_OF_POLICY',
      'Gunakan tanggal hari ini atau maksimal 31 hari lampau.'
    );
  return date;
}
export function serialDate(value: number): string {
  if (!Number.isFinite(value))
    throw new DomainError('DATE_NOT_IN_TRACKER', 'Header tanggal tidak valid.');
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
}
