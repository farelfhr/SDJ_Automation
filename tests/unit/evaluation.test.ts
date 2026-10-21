import { describe, expect, it } from 'vitest';
import { equivalentIntent } from '@sdj/testing';
import type { CommandProposal } from '@sdj/domain';
const context = { localDate: '2026-10-19' };
const expected: CommandProposal = {
  schema_version: 2,
  action: 'set_activities',
  items: [{ activity_id: 'tilawah', date_reference: { kind: 'days_ago', days: 2 }, value: 2.5 }],
};
describe('Evaluasi berdasarkan efek domain', () => {
  it('tanggal eksplisit dan relatif yang sama dianggap setara', () =>
    expect(
      equivalentIntent(
        {
          ...expected,
          items: [
            { ...expected.items[0]!, date_reference: { kind: 'explicit', date: '2026-10-17' } },
          ],
        },
        expected,
        context
      )
    ).toBe(true));
  it('tanggal atau nilai berbeda tetap gagal', () => {
    expect(
      equivalentIntent(
        { ...expected, items: [{ ...expected.items[0]!, date_reference: { kind: 'today' } }] },
        expected,
        context
      )
    ).toBe(false);
    expect(
      equivalentIntent(
        { ...expected, items: [{ ...expected.items[0]!, value: 3 }] },
        expected,
        context
      )
    ).toBe(false);
  });
  it('kelanjutan percakapan tidak boleh dihilangkan', () =>
    expect(equivalentIntent({ ...expected, continues_pending: true }, expected, context)).toBe(
      false
    ));
  it('rekap tanggal relatif dan eksplisit memakai hari yang sama', () =>
    expect(
      equivalentIntent(
        {
          schema_version: 2,
          action: 'daily_summary',
          date_reference: { kind: 'explicit', date: '2026-10-18' },
        },
        { schema_version: 2, action: 'daily_summary', date_reference: { kind: 'yesterday' } },
        context
      )
    ).toBe(true));
});

it('tanggal slot pending yang sudah diketahui tetap harus mempertahankan kontrak asal', () => {
  const pending = { ...expected, continues_pending: true };
  const actual = {
    ...pending,
    items: [
      { ...pending.items[0]!, date_reference: { kind: 'explicit' as const, date: '2026-10-17' } },
    ],
  };
  expect(
    equivalentIntent(actual, pending, {
      ...context,
      pending: {
        mode: 'slots',
        localDate: '2026-10-19',
        proposal: {
          schema_version: 2,
          action: 'clarify',
          items: [
            { activity_id: 'tilawah', date_reference: { kind: 'days_ago', days: 2 }, value: null },
          ],
          missing: ['value'],
        },
      },
    })
  ).toBe(false);
});
