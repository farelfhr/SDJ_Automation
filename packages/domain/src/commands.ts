import { type ActivityId, type TypedCellValue, DomainError, validateValue } from './activities.js';
import { type DateReference, type DateContext, resolveDate } from './dates.js';
export interface ProposalItem {
  activity_id: ActivityId;
  date_reference: DateReference;
  value: number | boolean;
}
export interface DraftItem {
  activity_id: ActivityId | null;
  date_reference: DateReference | null;
  value: number | boolean | null;
}
export type CommandProposal =
  | {
      schema_version: 2;
      action: 'set_activities';
      items: ProposalItem[];
      continues_pending?: boolean | undefined;
    }
  | {
      schema_version: 2;
      action: 'daily_summary' | 'monthly_summary';
      date_reference: DateReference;
    }
  | {
      schema_version: 2;
      action: 'clarify';
      items: DraftItem[];
      missing: ('activity' | 'date' | 'value')[];
      continues_pending?: boolean | undefined;
    }
  | {
      schema_version: 2;
      action:
        | 'help'
        | 'connection_status'
        | 'undo_last'
        | 'connect'
        | 'disconnect'
        | 'delete_account'
        | 'confirm_pending'
        | 'cancel_pending'
        | 'reminder_on'
        | 'reminder_off'
        | 'reminder_status'
        | 'refresh_profile'
        | 'format_summary'
        | 'unsupported';
    };
export interface InterpretationContext {
  localDate: string;
  pending?: {
    proposal: CommandProposal;
    mode: 'slots' | 'date' | 'disconnect' | 'delete_account';
    localDate: string;
  };
}
export interface ActorContext {
  userId: string;
  identityId: string;
  sourceMessageId: string;
}
export interface ResolvedItem {
  activityId: ActivityId;
  localDate: string;
  afterValue: TypedCellValue;
}
export function resolveItems(items: readonly ProposalItem[], context: DateContext): ResolvedItem[] {
  if (items.length < 1 || items.length > 5)
    throw new DomainError('ITEM_LIMIT', 'Satu pesan dapat mencatat 1–5 aktivitas.');
  const seen = new Set<string>();
  return items.map((item) => {
    const localDate = resolveDate(item.date_reference, context);
    const key = `${item.activity_id}:${localDate}`;
    if (seen.has(key))
      throw new DomainError('DUPLICATE_TARGET', 'Aktivitas dan tanggal yang sama muncul dua kali.');
    seen.add(key);
    return {
      activityId: item.activity_id,
      localDate,
      afterValue: validateValue(item.activity_id, item.value),
    };
  });
}
export function rejectTargetOverride(text: string): void {
  if (
    /https?:\/\/|\b(?:user_id|tracker_id|spreadsheet_id|api_key|service_role)\b|(?:milik|punya)\s+(?:peserta|orang|user)|(?:isi|ubah|baca)\s+(?:tracker|sheet)\s+(?:orang|peserta)|abaikan\s+(?:semua\s+)?(?:aturan|instruksi)/i.test(
      text
    )
  )
    throw new DomainError(
      'IDENTITY_SCOPE_INVALID',
      'Instruksi tidak boleh memilih identitas atau tracker lain.'
    );
}
