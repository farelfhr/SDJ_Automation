import { createHash } from 'node:crypto';
import { z } from 'zod';
import { activity, validateValue, type ActivityId, type TypedCellValue } from '@sdj/domain';
import { ExtendedValue, Condition, type GoogleCell } from './sheet-profile.js';
import { standardValidation } from './sheet-validation.js';

export const typedValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blank') }).strict(),
  z.object({ kind: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
]);
export const ruleSchema = z.object({
  condition: Condition,
  strict: z.boolean().optional(),
  showCustomUi: z.boolean().optional(),
  inputMessage: z.string().optional(),
});
export const snapshotSchema = z
  .object({
    value: ExtendedValue.nullable(),
    effective: ExtendedValue.nullable(),
    rule: ruleSchema.nullable(),
    note: z.string(),
  })
  .strict();
export function snapshot(cell: GoogleCell): z.infer<typeof snapshotSchema> {
  return snapshotSchema.parse({
    value:
      cell.userEnteredValue && Object.keys(cell.userEnteredValue).length
        ? cell.userEnteredValue
        : null,
    effective: cell.effectiveValue ?? null,
    rule: cell.dataValidation ?? null,
    note: cell.note ?? '',
  });
}
export function digest(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, v]) => [key, canonical(v)])
      );
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function rawValue(value: TypedCellValue): z.infer<typeof ExtendedValue> | null {
  return value.kind === 'blank'
    ? null
    : value.kind === 'number'
      ? { numberValue: value.value }
      : { boolValue: value.value };
}
function literal(source: string, locale: string): number | null {
  let decimal = '.';
  try {
    decimal =
      new Intl.NumberFormat(locale.replaceAll('_', '-'))
        .formatToParts(1.5)
        .find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    /* Missing/invalid locale uses Google's en_US default. */
  }
  const text = source.trim(),
    separator = decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^[+-]?(?:\\d+(?:${separator}\\d*)?|${separator}\\d+)$`).test(text)) return null;
  const result = Number(text.replace(decimal, '.'));
  return Number.isFinite(result) ? result : null;
}
export function normalizedValue(cell: GoogleCell, id: ActivityId, locale: string): TypedCellValue {
  const definition = activity(id);
  const source = cell.userEnteredValue?.formulaValue ? cell.effectiveValue : cell.userEnteredValue;
  if (!source || Object.keys(source).length === 0) return { kind: 'blank' };
  let value: number | boolean | null = null;
  if (definition.kind === 'number') {
    value =
      source.numberValue ??
      (source.stringValue !== undefined ? literal(source.stringValue, locale) : null);
  } else {
    const choices =
      cell.dataValidation?.condition.type === 'BOOLEAN'
        ? cell.dataValidation.condition.values
        : undefined;
    const token =
      source.stringValue ??
      (source.numberValue !== undefined
        ? String(source.numberValue)
        : source.boolValue !== undefined
          ? String(source.boolValue).toUpperCase()
          : undefined);
    if (
      choices?.length === 2 &&
      choices[0]?.userEnteredValue !== choices[1]?.userEnteredValue &&
      token !== undefined &&
      token === choices[0]?.userEnteredValue
    )
      value = true;
    else if (
      choices?.length === 2 &&
      choices[0]?.userEnteredValue !== choices[1]?.userEnteredValue &&
      token !== undefined &&
      token === choices[1]?.userEnteredValue
    )
      value = false;
    else if (source.boolValue !== undefined) value = source.boolValue;
    else if (source.stringValue !== undefined && /^(true|false)$/i.test(source.stringValue.trim()))
      value = source.stringValue.trim().toLowerCase() === 'true';
    else {
      const number =
        source.numberValue ??
        (source.stringValue !== undefined ? literal(source.stringValue, locale) : null);
      if (number === 0 || number === 1) value = number === 1;
    }
  }
  if (value === null) return { kind: 'blank' };
  try {
    return validateValue(id, value);
  } catch {
    return { kind: 'blank' };
  }
}
function comparableRule(rule: GoogleCell['dataValidation']) {
  if (!rule) return null;
  return {
    type: rule.condition.type,
    values: (rule.condition.values ?? []).map((v) =>
      rule.condition.type === 'CUSTOM_FORMULA'
        ? (v.userEnteredValue ?? '').replace(/[\s$]/g, '').toUpperCase()
        : (v.userEnteredValue ?? '')
    ),
    strict: rule.strict ?? false,
    dropdown: rule.condition.type === 'ONE_OF_LIST' ? (rule.showCustomUi ?? false) : true,
  };
}
export function canonicalRuleMatches(cell: GoogleCell, id: ActivityId, address: string): boolean {
  return (
    digest(comparableRule(cell.dataValidation)) ===
    digest(comparableRule(standardValidation(id, address)))
  );
}
export const repairRecordSchema = z
  .object({
    version: z.literal(1),
    runId: z.string(),
    fingerprint: z.string(),
    locale: z.string(),
    sheetId: z.number().int(),
    id: z.string(),
    activityId: z.string(),
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    address: z.string(),
    before: snapshotSchema,
    after: typedValueSchema,
    rule: ruleSchema,
    reason: z.enum(['rule', 'convert', 'clear']),
    ruleChanged: z.boolean(),
    valueChanged: z.boolean(),
  })
  .strict();
export type RepairRecord = z.infer<typeof repairRecordSchema>;
export function planCell(
  cell: GoogleCell,
  id: ActivityId,
  row: number,
  column: number,
  address: string,
  locale: string,
  runId: string,
  fingerprint: string,
  sheetId: number
): RepairRecord | null {
  const after = normalizedValue(cell, id, locale),
    before = snapshot(cell);
  const valueChanged = digest(before.value) !== digest(rawValue(after));
  const ruleChanged = !canonicalRuleMatches(cell, id, address);
  if (!valueChanged && !ruleChanged) return null;
  const record = {
    version: 1 as const,
    runId,
    fingerprint,
    locale,
    sheetId,
    activityId: id,
    row,
    column,
    address,
    before,
    after,
    rule: standardValidation(id, address),
    reason: valueChanged
      ? after.kind === 'blank'
        ? ('clear' as const)
        : ('convert' as const)
      : ('rule' as const),
    ruleChanged,
    valueChanged,
  };
  return { ...record, id: digest(record) };
}
export function sourceMatches(cell: GoogleCell, record: RepairRecord): boolean {
  const current = snapshot(cell);
  return (
    digest({ value: current.value, rule: current.rule, note: current.note }) ===
    digest({ value: record.before.value, rule: record.before.rule, note: record.before.note })
  );
}
export function targetMatches(cell: GoogleCell, record: RepairRecord): boolean {
  if (digest(snapshot(cell).value) !== digest(rawValue(record.after))) return false;
  return digest(comparableRule(cell.dataValidation)) === digest(comparableRule(record.rule));
}
