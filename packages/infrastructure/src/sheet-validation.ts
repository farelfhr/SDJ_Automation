import { z } from 'zod';
import {
  ACTIVITIES,
  DomainError,
  validateValue,
  type ActivityId,
  type TypedCellValue,
} from '@sdj/domain';
import { Condition, type GoogleCell } from './sheet-profile.js';

interface NumericRule {
  accepts: (value: number) => boolean;
  boundaries: number[];
}
export function standardValidation(id: ActivityId, address: string) {
  const definition = ACTIVITIES.find((a) => a.id === id);
  if (!definition) throw new Error('ACTIVITY_MISSING');
  let condition: z.infer<typeof Condition>;
  if (definition.kind === 'boolean') condition = { type: 'BOOLEAN' };
  else if (definition.integer && definition.max !== null && definition.max <= 10)
    condition = {
      type: 'ONE_OF_LIST',
      values: Array.from({ length: definition.max - definition.min + 1 }, (_, i) => ({
        userEnteredValue: String(definition.min + i),
      })),
    };
  else if (definition.integer)
    condition = {
      type: 'CUSTOM_FORMULA',
      values: [
        {
          userEnteredValue: `=AND(ISNUMBER(${address}),${address}>=${definition.min},${address}<=${Number.MAX_SAFE_INTEGER},MOD(${address},1)=0)`,
        },
      ],
    };
  else
    condition = {
      type: 'NUMBER_BETWEEN',
      values: [definition.min, definition.max].map((n) => ({ userEnteredValue: String(n) })),
    };
  return { condition, strict: true, showCustomUi: true };
}
const unsupported = (
  message = 'Aturan angka ini belum dapat dipetakan dengan pasti. Aturan pada sheet tidak diubah.'
): never => {
  throw new DomainError('TRACKER_VALIDATION_UNSUPPORTED', message);
};
export function numericLiteral(value: string): number {
  const source = value.trim();
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(source))
    return unsupported(
      'Batas/pilihan angka harus berupa angka literal; rumus dan pilihan teks tidak ditebak sebagai skor.'
    );
  const number = Number(source);
  if (!Number.isFinite(number)) return unsupported();
  return number;
}
function comparison(operator: string, bound: number): NumericRule {
  const operations: Record<string, (n: number) => boolean> = {
    '>': (n) => n > bound,
    '>=': (n) => n >= bound,
    '<': (n) => n < bound,
    '<=': (n) => n <= bound,
    '=': (n) => n === bound,
    '<>': (n) => n !== bound,
  };
  const accepts = operations[operator];
  if (!accepts) return unsupported();
  return { accepts, boundaries: [bound] };
}
function splitArguments(value: string): string[] {
  const result: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (depth < 0) return unsupported();
    if ((char === ',' || char === ';') && depth === 0) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return unsupported();
  result.push(value.slice(start));
  return result;
}
function numericFormula(source: string, cell: string, depth = 0): NumericRule {
  if (depth > 6 || source.length > 500) return unsupported();
  const value = source.replace(/^=/, '').replace(/[\s$]/g, '').toUpperCase();
  if (value === `ISNUMBER(${cell})`) return { accepts: () => true, boundaries: [] };
  if (
    value === `INT(${cell})=${cell}` ||
    value === `MOD(${cell},1)=0` ||
    value === `MOD(${cell};1)=0`
  )
    return { accepts: Number.isInteger, boundaries: [] };
  const group = value.match(/^(AND|OR)\((.*)\)$/);
  if (group) {
    const parts = splitArguments(group[2]!).map((v) => numericFormula(v, cell, depth + 1));
    if (parts.length < 2 || parts.length > 12) return unsupported();
    return {
      accepts: (n) =>
        group[1] === 'AND' ? parts.every((p) => p.accepts(n)) : parts.some((p) => p.accepts(n)),
      boundaries: parts.flatMap((p) => p.boundaries),
    };
  }
  const match = value.match(/^([A-Z]+[1-9]\d*)(>=|<=|<>|>|<|=)(-?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (match && match[1] === cell) return comparison(match[2]!, numericLiteral(match[3]!));
  return unsupported(
    'Rumus validasi belum dapat dipahami secara pasti. Hanya aturan angka sederhana pada sel yang sama yang dapat disesuaikan otomatis.'
  );
}
function compile(
  condition: z.infer<typeof Condition> | undefined,
  cell: string,
  rangeChoices?: number[]
): NumericRule {
  if (!condition) return { accepts: () => true, boundaries: [] };
  const values = condition.values?.map((v) => v.userEnteredValue ?? '') ?? [];
  if (condition.type === 'ONE_OF_LIST' || condition.type === 'ONE_OF_RANGE') {
    const allowed = condition.type === 'ONE_OF_RANGE' ? rangeChoices : values.map(numericLiteral);
    if (!allowed?.length)
      return unsupported('Daftar pilihan angka kosong atau belum dapat dibaca.');
    return { accepts: (n) => allowed.includes(n), boundaries: allowed };
  }
  if (condition.type === 'CUSTOM_FORMULA') {
    if (values.length !== 1) return unsupported();
    return numericFormula(values[0]!, cell);
  }
  if (condition.type === 'NUMBER_IS_VALID' && values.length === 0)
    return { accepts: () => true, boundaries: [] };
  const operators: Record<string, string> = {
    NUMBER_GREATER: '>',
    NUMBER_GREATER_THAN_EQ: '>=',
    NUMBER_LESS: '<',
    NUMBER_LESS_THAN_EQ: '<=',
    NUMBER_EQ: '=',
    NUMBER_NOT_EQ: '<>',
  };
  if (operators[condition.type]) {
    if (values.length !== 1)
      return unsupported('Aturan perbandingan angka harus memiliki satu batas angka yang jelas.');
    return comparison(operators[condition.type]!, numericLiteral(values[0]!));
  }
  if (condition.type === 'NUMBER_BETWEEN' || condition.type === 'NUMBER_NOT_BETWEEN') {
    if (values.length !== 2)
      return unsupported('Aturan rentang angka harus memiliki dua batas angka.');
    const min = numericLiteral(values[0]!),
      max = numericLiteral(values[1]!);
    if (min > max) return unsupported('Batas minimum validasi melebihi batas maksimum.');
    return {
      accepts: (n) =>
        condition.type === 'NUMBER_BETWEEN' ? n >= min && n <= max : n < min || n > max,
      boundaries: [min, max],
    };
  }
  return unsupported();
}
export function validateCell(
  cell: GoogleCell,
  id: ActivityId,
  address: string,
  value?: TypedCellValue,
  rangeChoices?: number[]
): void {
  const definition = ACTIVITIES.find((a) => a.id === id);
  if (!definition) throw new Error('ACTIVITY_MISSING');
  const condition = cell.dataValidation?.condition;
  try {
    if (definition.kind === 'boolean') {
      if (condition?.type !== 'BOOLEAN' || (condition.values?.length ?? 0) > 0)
        throw new DomainError(
          'TRACKER_SCHEMA_CHANGED',
          'Aktivitas ini memerlukan checkbox TRUE/FALSE standar. Nilai checkbox khusus belum dipetakan otomatis.'
        );
      if (value && value.kind !== 'blank') validateValue(id, value.value);
      return;
    }
    const rule = compile(condition, address, rangeChoices);
    const max = definition.max ?? Number.MAX_SAFE_INTEGER;
    const boundaries = [
      ...new Set(
        [definition.min, max, ...rule.boundaries].filter((n) => n >= definition.min && n <= max)
      ),
    ].sort((a, b) => a - b);
    const probes = boundaries.flatMap((n, i) => [
      n,
      Math.floor(n),
      Math.ceil(n),
      n - 1,
      n + 1,
      ...(boundaries[i + 1] !== undefined ? [n + (boundaries[i + 1]! - n) / 2] : []),
    ]);
    const compatible = probes.some(
      (n) =>
        n >= definition.min &&
        n <= max &&
        (!definition.integer || Number.isSafeInteger(n)) &&
        rule.accepts(n)
    );
    if (!compatible)
      throw new DomainError(
        'TRACKER_VALIDATION_INCOMPATIBLE',
        'Aturan sheet tidak menyediakan nilai yang sesuai dengan jenis aktivitas SDJ ini.'
      );
    if (value && value.kind !== 'blank') {
      validateValue(id, value.value);
      if (value.kind !== 'number' || !rule.accepts(value.value))
        throw new DomainError('VALUE_OUT_OF_RANGE', 'Nilai di luar aturan validasi tracker.');
    }
  } catch (error) {
    if (error instanceof DomainError)
      throw new DomainError(
        error.code,
        `${definition.label} di ${address} [${condition?.type ?? 'tanpa aturan'}]: ${error.message}`
      );
    throw error;
  }
}
