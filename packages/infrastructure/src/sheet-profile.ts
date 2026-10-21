import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ACTIVITIES,
  DomainError,
  isISODate,
  normalizeLabel,
  serialDate,
  type ActivityId,
  type TypedCellValue,
} from '@sdj/domain';

export const ExtendedValue = z.object({
  numberValue: z.number().optional(),
  boolValue: z.boolean().optional(),
  stringValue: z.string().optional(),
  formulaValue: z.string().optional(),
  errorValue: z.unknown().optional(),
});
export const Condition = z.object({
  type: z.string(),
  values: z.array(z.object({ userEnteredValue: z.string().optional() })).optional(),
});
const Cell = z.object({
  note: z.string().optional(),
  userEnteredValue: ExtendedValue.optional(),
  effectiveValue: ExtendedValue.optional(),
  effectiveFormat: z
    .object({ numberFormat: z.object({ type: z.string().optional() }).optional() })
    .optional(),
  dataValidation: z
    .object({
      condition: Condition,
      strict: z.boolean().optional(),
      showCustomUi: z.boolean().optional(),
      inputMessage: z.string().optional(),
    })
    .optional(),
});
export type GoogleCell = z.infer<typeof Cell>;
export const GridRange = z.object({
  sheetId: z.number().int().nonnegative().optional(),
  startRowIndex: z.number().int().nonnegative().optional(),
  endRowIndex: z.number().int().nonnegative().optional(),
  startColumnIndex: z.number().int().nonnegative().optional(),
  endColumnIndex: z.number().int().nonnegative().optional(),
});
const Sheet = z.object({
  properties: z.object({
    sheetId: z.number(),
    title: z.string(),
    hidden: z.boolean().optional(),
    gridProperties: z.object({ rowCount: z.number(), columnCount: z.number() }),
  }),
  merges: z.array(GridRange).optional(),
  developerMetadata: z
    .array(z.object({ metadataKey: z.string(), metadataValue: z.string().optional() }))
    .optional(),
  protectedRanges: z
    .array(
      z.object({
        range: GridRange.optional(),
        warningOnly: z.boolean().optional(),
        requestingUserCanEdit: z.boolean().optional(),
        unprotectedRanges: z.array(GridRange).optional(),
      })
    )
    .optional(),
  data: z
    .array(
      z.object({
        startRow: z.number().optional(),
        startColumn: z.number().optional(),
        rowData: z.array(z.object({ values: z.array(Cell).optional() })).optional(),
      })
    )
    .optional(),
});
export const Workbook = z.object({
  properties: z
    .object({ timeZone: z.string().optional(), locale: z.string().optional() })
    .optional(),
  sheets: z.array(Sheet),
  namedRanges: z.array(z.object({ name: z.string(), range: GridRange })).optional(),
});
export type SheetData = z.infer<typeof Sheet>;
export type WorkbookData = z.infer<typeof Workbook>;
export const gridFields =
  'sheets(properties,merges,protectedRanges,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,dataValidation))))';

export function columnName(index: number): string {
  let n = index + 1,
    result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export function quote(title: string): string {
  return "'" + title.replaceAll("'", "''") + "'";
}
export function cellAt(sheet: SheetData, row: number, column: number): GoogleCell {
  for (const grid of sheet.data ?? []) {
    const rr = row - (grid.startRow ?? 0),
      cc = column - (grid.startColumn ?? 0);
    if (rr < 0 || cc < 0) continue;
    const values = grid.rowData?.[rr]?.values;
    if (values && cc < values.length) return values[cc] ?? {};
  }
  return {};
}
function inRange(range: z.infer<typeof GridRange>, row: number, column: number): boolean {
  return (
    row >= (range.startRowIndex ?? 0) &&
    row < (range.endRowIndex ?? Infinity) &&
    column >= (range.startColumnIndex ?? 0) &&
    column < (range.endColumnIndex ?? Infinity)
  );
}
export function blocked(sheet: SheetData, row: number, column: number): boolean {
  return (
    (sheet.merges?.some((r) => inRange(r, row, column)) ?? false) ||
    (sheet.protectedRanges?.some(
      (p) =>
        p.range &&
        inRange(p.range, row, column) &&
        !p.warningOnly &&
        !p.requestingUserCanEdit &&
        !p.unprotectedRanges?.some((r) => inRange(r, row, column))
    ) ??
      false)
  );
}
export function typedCell(cell: GoogleCell): TypedCellValue {
  const value = cell.userEnteredValue?.formulaValue ? cell.effectiveValue : cell.userEnteredValue;
  if (!value || Object.keys(value).length === 0) return { kind: 'blank' };
  if (value.numberValue !== undefined) return { kind: 'number', value: value.numberValue };
  if (value.boolValue !== undefined) return { kind: 'boolean', value: value.boolValue };
  throw new DomainError(
    'TRACKER_VALUE_TYPE_INVALID',
    'Sel tracker berisi tipe nilai yang tidak didukung. Periksa template.'
  );
}
function text(cell: GoogleCell): string {
  return cell.effectiveValue?.stringValue ?? cell.userEnteredValue?.stringValue ?? '';
}
function labelKey(value: string): string {
  return normalizeLabel(value)
    .replace(/\b(?:sholat|shalat|salat)\b/g, 'salat')
    .replace(/[^a-z0-9]/g, '');
}
export interface SheetLayout {
  mode: 'reference' | 'adapted';
  labelColumn: number;
  headerRow: number;
  rows: Record<ActivityId, number>;
  dates: Map<string, number>;
  labels: unknown[];
  normalizedLabels: Record<ActivityId, string>;
}
function dateValue(cell: GoogleCell, allowText: boolean): string | null {
  const number = cell.effectiveValue?.numberValue ?? cell.userEnteredValue?.numberValue;
  // Date serials are explicit full dates, never day-of-month numbers or scores.
  const dateFormat = ['DATE', 'DATE_TIME'].includes(cell.effectiveFormat?.numberFormat?.type ?? '');
  if (
    number !== undefined &&
    Number.isFinite(number) &&
    number >= 20000 &&
    number <= 100000 &&
    (!allowText || dateFormat)
  )
    return serialDate(number);
  const value = text(cell).trim();
  return allowText && isISODate(value) ? value : null;
}
function dateRow(
  sheet: SheetData,
  row: number,
  startColumn: number,
  columnCount: number,
  allowText: boolean
): Map<string, number> {
  const dates = new Map<string, number>();
  for (let col = startColumn; col < columnCount; col++) {
    const date = dateValue(cellAt(sheet, row, col), allowText);
    if (!date) continue;
    if (dates.has(date))
      throw new DomainError(
        'TRACKER_SCHEMA_CHANGED',
        `Header tanggal duplikat pada baris ${row + 1}. Pilih tab dengan satu kalender tracker.`
      );
    dates.set(date, col);
  }
  return dates;
}
export function referenceLayout(
  sheet: SheetData,
  rowCount: number,
  columnCount: number
): SheetLayout | null {
  const rows: Partial<Record<ActivityId, number>> = {},
    labels: unknown[] = [];
  for (const definition of ACTIVITIES) {
    const matches: number[] = [];
    for (let row = 0; row < Math.min(100, rowCount); row++) {
      const label = normalizeLabel(text(cellAt(sheet, row, 0)));
      if (definition.sourceLabels.some((v) => normalizeLabel(v) === label)) matches.push(row);
    }
    if (matches.length !== 1) return null;
    const row = matches[0]!;
    rows[definition.id] = row;
    labels.push([definition.id, row, normalizeLabel(text(cellAt(sheet, row, 0)))]);
  }
  const dates = dateRow(sheet, 6, 9, columnCount, false);
  if (!dates.size) return null;
  return {
    mode: 'reference',
    labelColumn: 0,
    headerRow: 6,
    rows: rows as Record<ActivityId, number>,
    dates,
    labels,
    normalizedLabels: Object.fromEntries(
      ACTIVITIES.map((a) => [a.id, normalizeLabel(text(cellAt(sheet, rows[a.id]!, 0)))])
    ) as Record<ActivityId, string>,
  };
}
export function findActivityColumn(
  sheet: SheetData,
  rowCount: number,
  columnCount: number
): Pick<SheetLayout, 'labelColumn' | 'rows' | 'labels' | 'normalizedLabels'> {
  const candidates: { column: number; matches: Map<ActivityId, number[]> }[] = [];
  for (let column = 0; column < Math.min(12, columnCount); column++) {
    const matches = new Map<ActivityId, number[]>();
    for (const definition of ACTIVITIES) {
      const approved = new Set(
        [...definition.sourceLabels, ...definition.aliases, definition.label].map(labelKey)
      );
      const found: number[] = [];
      for (let row = 0; row < Math.min(100, rowCount); row++)
        if (approved.has(labelKey(text(cellAt(sheet, row, column))))) found.push(row);
      if (found.length) matches.set(definition.id, found);
    }
    candidates.push({ column, matches });
  }
  const complete = candidates.filter((c) =>
    ACTIVITIES.every((a) => c.matches.get(a.id)?.length === 1)
  );
  if (complete.length > 1)
    throw new DomainError(
      'TRACKER_LAYOUT_AMBIGUOUS',
      'Ditemukan lebih dari satu kolom aktivitas yang lengkap. Pilih tab dengan satu tracker agar pemetaan tidak tertukar.'
    );
  const selected = complete[0];
  if (!selected) {
    const best = candidates.sort((a, b) => b.matches.size - a.matches.size)[0];
    const problem = ACTIVITIES.find((a) => best?.matches.get(a.id)?.length !== 1);
    throw new DomainError(
      'TRACKER_SCHEMA_CHANGED',
      `Aktivitas ${problem?.label ?? 'SDJ'} belum ditemukan tepat satu kali. Pilih tab tracker lengkap; nama yang ambigu tidak dipetakan otomatis.`
    );
  }
  const rows = Object.fromEntries(
    ACTIVITIES.map((a) => [a.id, selected.matches.get(a.id)![0]!])
  ) as Record<ActivityId, number>;
  const labels = ACTIVITIES.map((a) => [
    a.id,
    rows[a.id],
    selected.column,
    labelKey(text(cellAt(sheet, rows[a.id], selected.column))),
  ]);
  const normalizedLabels = Object.fromEntries(
    ACTIVITIES.map((a) => [a.id, normalizeLabel(text(cellAt(sheet, rows[a.id], selected.column)))])
  ) as Record<ActivityId, string>;
  return { labelColumn: selected.column, rows, labels, normalizedLabels };
}
export function adaptedLayout(
  sheet: SheetData,
  labels: ReturnType<typeof findActivityColumn>,
  columnCount: number
): SheetLayout {
  const firstActivity = Math.min(...Object.values(labels.rows));
  const candidates: { row: number; dates: Map<string, number> }[] = [];
  for (let row = 0; row < firstActivity; row++) {
    const dates = dateRow(sheet, row, labels.labelColumn + 1, columnCount, true);
    if (dates.size >= 2) candidates.push({ row, dates });
  }
  if (candidates.length > 1)
    throw new DomainError(
      'TRACKER_LAYOUT_AMBIGUOUS',
      'Ditemukan beberapa baris tanggal. Pilih tab dengan satu kalender; sistem belum dapat memilihnya secara pasti.'
    );
  if (!candidates[0])
    throw new DomainError(
      'DATE_NOT_IN_TRACKER',
      'Header tanggal belum dapat dikenali. Gunakan tanggal lengkap pada satu baris di atas aktivitas; angka 1-31 saja tidak cukup.'
    );
  return { mode: 'adapted', ...labels, headerRow: candidates[0].row, dates: candidates[0].dates };
}
export function layoutFingerprint(
  sheet: SheetData,
  timezone: string | null,
  layout: SheetLayout
): string {
  // Preserve the exact v1 digest for existing trackers and mutation journals.
  const base = {
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    timezone,
    labels: layout.labels,
    dates: [...layout.dates],
  };
  const value =
    layout.mode === 'reference'
      ? base
      : {
          version: 'sdj-adaptive-v1',
          ...base,
          headerRow: layout.headerRow,
          labelColumn: layout.labelColumn,
        };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface ChoiceRange {
  sheet: SheetData;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  a1: string;
}
export function choiceRange(
  reference: string,
  workbook: WorkbookData,
  currentSheet: SheetData
): ChoiceRange {
  const raw = reference.trim().replace(/^=/, '');
  const named = workbook.namedRanges?.find((n) => n.name === raw)?.range;
  let sheet: SheetData | undefined,
    startRow: number | undefined,
    endRow: number | undefined,
    startColumn: number | undefined,
    endColumn: number | undefined;
  if (named) {
    sheet = workbook.sheets.find((s) => s.properties.sheetId === named.sheetId);
    ({
      startRowIndex: startRow,
      endRowIndex: endRow,
      startColumnIndex: startColumn,
      endColumnIndex: endColumn,
    } = named);
    startRow ??= 0;
    startColumn ??= 0;
  } else {
    const match = raw.match(
      /^(?:(?:'((?:[^']|'')+)'|([^'!]+))!)?\$?([A-Z]+)\$?([1-9]\d*):\$?([A-Z]+)\$?([1-9]\d*)$/i
    );
    if (!match)
      throw new DomainError(
        'TRACKER_VALIDATION_UNSUPPORTED',
        'Daftar pilihan harus memakai rentang A1 terbatas atau named range pada file yang sama.'
      );
    const title = match[1]?.replaceAll("''", "'") ?? match[2] ?? currentSheet.properties.title;
    sheet = workbook.sheets.find((s) => s.properties.title === title);
    const col = (v: string) =>
      [...v.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    startColumn = col(match[3]!);
    endColumn = col(match[5]!) + 1;
    startRow = Number(match[4]) - 1;
    endRow = Number(match[6]);
  }
  if (
    !sheet ||
    startRow === undefined ||
    endRow === undefined ||
    startColumn === undefined ||
    endColumn === undefined ||
    startRow < 0 ||
    startColumn < 0 ||
    endRow <= startRow ||
    endColumn <= startColumn ||
    endRow > sheet.properties.gridProperties.rowCount ||
    endColumn > sheet.properties.gridProperties.columnCount ||
    (endRow - startRow) * (endColumn - startColumn) > 100
  )
    throw new DomainError(
      'TRACKER_VALIDATION_UNSUPPORTED',
      'Rentang pilihan tidak valid atau melebihi 100 sel. Pilih rentang angka yang terbatas pada file yang sama.'
    );
  return {
    sheet,
    startRow,
    endRow,
    startColumn,
    endColumn,
    a1: `${quote(sheet.properties.title)}!${columnName(startColumn)}${startRow + 1}:${columnName(endColumn - 1)}${endRow}`,
  };
}
