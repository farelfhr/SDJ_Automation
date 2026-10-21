import { isDeepStrictEqual } from 'node:util';
import {
  resolveItems,
  resolveDate,
  type CommandProposal,
  type InterpretationContext,
} from '@sdj/domain';

/** Compare executable intent, accepting equivalent date expressions from a model. */
export function equivalentIntent(
  actual: CommandProposal,
  expected: CommandProposal,
  context?: InterpretationContext
): boolean {
  if (isDeepStrictEqual(actual, expected)) return true;
  if (!context || actual.action !== expected.action) return false;
  const localDate =
    'continues_pending' in expected && expected.continues_pending
      ? (context.pending?.localDate ?? context.localDate)
      : context.localDate;
  const dateContext = {
    receivedAt: new Date(`${localDate}T12:00:00+07:00`),
    timezone: 'Asia/Jakarta',
  };
  try {
    if (actual.action === 'set_activities' && expected.action === 'set_activities') {
      if (!!actual.continues_pending !== !!expected.continues_pending) return false;
      const a = resolveItems(actual.items, dateContext),
        e = resolveItems(expected.items, dateContext);
      if (expected.continues_pending) return isDeepStrictEqual(actual.items, expected.items);
      const key = (i: (typeof a)[number]) => `${i.activityId}:${i.localDate}`;
      return isDeepStrictEqual(
        a.sort((x, y) => key(x).localeCompare(key(y))),
        e.sort((x, y) => key(x).localeCompare(key(y)))
      );
    }
    if (
      (actual.action === 'daily_summary' || actual.action === 'monthly_summary') &&
      (expected.action === 'daily_summary' || expected.action === 'monthly_summary')
    ) {
      const a = resolveDate(actual.date_reference, dateContext),
        e = resolveDate(expected.date_reference, dateContext);
      return actual.action === 'monthly_summary' ? a.slice(0, 7) === e.slice(0, 7) : a === e;
    }
  } catch {
    return false;
  }
  return false;
}
