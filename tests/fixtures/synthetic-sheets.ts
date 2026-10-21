import { z } from 'zod';
import { ACTIVITIES } from '@sdj/domain';
import { GoogleSheetsAdapter } from '@sdj/infrastructure';
import type { Tracker } from '@sdj/application';
import { columnName } from '../../packages/infrastructure/src/sheet-profile.js';
import { standardValidation } from '../../packages/infrastructure/src/sheet-validation.js';

type Cell = Record<string, unknown>;
interface SyntheticSheet {
  properties: {
    sheetId: number;
    title: string;
    gridProperties: { rowCount: number; columnCount: number };
    hidden?: boolean;
  };
  data: { startRow: number; startColumn: number; rowData: { values: Cell[] }[] }[];
  protectedRanges: unknown[];
  merges?: unknown[];
  developerMetadata?: { metadataKey: string; metadataValue?: string }[];
}
const rangeSchema = z.object({
  sheetId: z.number(),
  startRowIndex: z.number(),
  endRowIndex: z.number(),
  startColumnIndex: z.number(),
  endColumnIndex: z.number(),
});
const requestSchema = z.object({
  addSheet: z
    .object({
      properties: z.object({
        sheetId: z.number(),
        title: z.string(),
        hidden: z.boolean(),
        gridProperties: z.object({ rowCount: z.number(), columnCount: z.number() }),
      }),
    })
    .optional(),
  createDeveloperMetadata: z
    .object({
      developerMetadata: z.object({
        metadataKey: z.string(),
        metadataValue: z.string(),
        location: z.object({ sheetId: z.number() }),
      }),
    })
    .optional(),
  appendDimension: z
    .object({ sheetId: z.number(), dimension: z.literal('ROWS'), length: z.number() })
    .optional(),
  updateCells: z
    .object({
      range: rangeSchema,
      rows: z.array(z.object({ values: z.array(z.record(z.unknown())) })),
      fields: z.string(),
    })
    .optional(),
});
type Request = z.infer<typeof requestSchema>;
export type Phase = 'create' | 'allocate' | 'backup' | 'input' | 'receipt' | 'manifest';
export function setup(days = 1) {
  const actor = {
    userId: crypto.randomUUID(),
    identityId: crypto.randomUUID(),
    sourceMessageId: crypto.randomUUID(),
  };
  const date = '2026-10-15',
    columns = Math.max(11, days + 9);
  const cells: Cell[][] = Array.from({ length: 40 }, () =>
    Array.from({ length: columns }, () => ({}))
  );
  for (const [i, a] of ACTIVITIES.entries()) {
    cells[i + 8]![0] = { userEnteredValue: { stringValue: a.sourceLabels[0] } };
    for (let col = 9; col < days + 9; col++)
      cells[i + 8]![col] = {
        dataValidation: standardValidation(a.id, `${columnName(col)}${i + 9}`),
      };
  }
  for (let col = 9; col < days + 9; col++)
    cells[6]![col] = {
      effectiveValue: { numberValue: Date.parse(date) / 86400000 + 25569 + col - 9 },
    };
  const sheet: SyntheticSheet = {
    properties: {
      sheetId: 7,
      title: "Synthetic's SDJ",
      gridProperties: { rowCount: 40, columnCount: columns },
    },
    data: [{ startRow: 0, startColumn: 0, rowData: cells.map((values) => ({ values })) }],
    protectedRanges: [],
  };
  const state = {
    native: true,
    rateLimitNext: false,
    canEdit: true,
    status: 200,
    writeError: false,
    locale: 'id_ID',
    requests: [] as unknown[],
    readUrls: [] as string[],
    sheets: [sheet],
    namedRanges: [] as {
      name: string;
      range: {
        sheetId: number;
        startRowIndex?: number;
        endRowIndex: number;
        startColumnIndex?: number;
        endColumnIndex: number;
      };
    }[],
    timeoutAfter: undefined as Phase | undefined,
    failBefore: undefined as Phase | undefined,
    ignorePhase: undefined as Phase | undefined,
    onAfterPost: undefined as ((phase: Phase) => void) | undefined,
    onRead: undefined as ((url: URL) => void) | undefined,
    phases: [] as Phase[],
  };
  const find = (id: number) => {
    const result = state.sheets.find((s) => s.properties.sheetId === id);
    if (!result) throw new Error('UNKNOWN_SYNTHETIC_SHEET');
    return result;
  };
  const phaseFor = (requests: Request[]): Phase =>
    requests.some((r) => r.addSheet)
      ? 'create'
      : requests.some((r) => r.appendDimension)
        ? 'allocate'
        : requests.some((r) => r.updateCells?.range.sheetId === 7)
          ? 'input'
          : requests.some((r) => r.updateCells?.range.startColumnIndex === 5)
            ? 'receipt'
            : requests.some((r) => (r.updateCells?.range.startRowIndex ?? 0) > 0)
              ? 'backup'
              : 'manifest';
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (state.rateLimitNext) {
      state.rateLimitNext = false;
      return Response.json({}, { status: 429 });
    }
    if (url.pathname.includes('/drive/v3/files/'))
      return Response.json({
        mimeType: state.native
          ? 'application/vnd.google-apps.spreadsheet'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        capabilities: { canEdit: state.canEdit },
      });
    if (init?.method === 'POST') {
      const json: unknown = JSON.parse(String(init.body));
      const batch = z.object({ requests: z.array(requestSchema) }).parse(json);
      const phase = phaseFor(batch.requests);
      state.requests.push(json);
      state.phases.push(phase);
      if (state.failBefore === phase) {
        state.failBefore = undefined;
        throw new TypeError('SYNTHETIC_TIMEOUT_BEFORE_APPLY');
      }
      if (state.writeError) throw new TypeError('SYNTHETIC_TRANSPORT');
      if (state.status !== 200) return Response.json({}, { status: state.status });
      if (state.ignorePhase !== phase)
        for (const r of batch.requests) {
          if (r.addSheet) {
            const properties = r.addSheet.properties;
            if (state.sheets.some((s) => s.properties.sheetId === properties.sheetId))
              return Response.json({}, { status: 400 });
            state.sheets.push({
              properties,
              protectedRanges: [],
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: Array.from({ length: properties.gridProperties.rowCount }, () => ({
                    values: Array.from(
                      { length: properties.gridProperties.columnCount },
                      () => ({})
                    ),
                  })),
                },
              ],
            });
          }
          if (r.createDeveloperMetadata) {
            const m = r.createDeveloperMetadata.developerMetadata,
              target = find(m.location.sheetId);
            (target.developerMetadata ??= []).push({
              metadataKey: m.metadataKey,
              metadataValue: m.metadataValue,
            });
          }
          if (r.appendDimension) {
            const target = find(r.appendDimension.sheetId);
            target.properties.gridProperties.rowCount += r.appendDimension.length;
            for (let i = 0; i < r.appendDimension.length; i++)
              target.data[0]!.rowData.push({
                values: Array.from(
                  { length: target.properties.gridProperties.columnCount },
                  () => ({})
                ),
              });
          }
          if (r.updateCells) {
            const update = r.updateCells,
              target = find(update.range.sheetId),
              fields = update.fields.split(',');
            for (let row = update.range.startRowIndex; row < update.range.endRowIndex; row++)
              for (
                let col = update.range.startColumnIndex;
                col < update.range.endColumnIndex;
                col++
              ) {
                const source =
                  update.rows[row - update.range.startRowIndex]?.values[
                    col - update.range.startColumnIndex
                  ] ?? {};
                const current = target.data[0]!.rowData[row]!.values[col] ?? {};
                for (const field of fields) {
                  if (source[field] === undefined) delete current[field];
                  else current[field] = structuredClone(source[field]);
                  if (field === 'userEnteredValue') delete current.effectiveValue;
                }
                target.data[0]!.rowData[row]!.values[col] = current;
              }
          }
        }
      state.onAfterPost?.(phase);
      if (state.timeoutAfter === phase) {
        state.timeoutAfter = undefined;
        throw new TypeError('SYNTHETIC_TIMEOUT_AFTER_APPLY');
      }
      return Response.json({});
    }
    state.readUrls.push(String(input));
    state.onRead?.(url);
    const ranges = url.searchParams.getAll('ranges');
    if (!ranges.length)
      return Response.json({
        properties: { timeZone: 'Asia/Jakarta', locale: state.locale },
        namedRanges: state.namedRanges,
        sheets: state.sheets.map(({ data: _data, ...s }) => s),
      });
    const columnIndex = (value: string) =>
      [...value].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const selected = new Map<number, SyntheticSheet>();
    for (const range of ranges) {
      const match = /^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
      if (!match) throw new Error('SYNTHETIC_RANGE');
      const title = match[1]?.replaceAll("''", "'") ?? match[2],
        source = state.sheets.find((s) => s.properties.title === title)!;
      const startRow = Number(match[4]) - 1,
        endRow = Number(match[6] ?? match[4]),
        startColumn = columnIndex(match[3]!),
        endColumn = columnIndex(match[5] ?? match[3]!) + 1;
      const target = selected.get(source.properties.sheetId) ?? { ...source, data: [] };
      target.data.push({
        startRow,
        startColumn,
        rowData: source.data[0]!.rowData.slice(startRow, endRow).map((r) => ({
          values: r.values.slice(startColumn, endColumn),
        })),
      });
      selected.set(source.properties.sheetId, target);
    }
    return Response.json({ sheets: [...selected.values()] });
  };
  const makeAdapter = () =>
    new GoogleSheetsAdapter(
      {
        accessToken: async (a) => {
          if (a.userId !== actor.userId) throw new Error('TENANT_MISMATCH');
          return 'synthetic-only';
        },
      },
      true,
      request
    );
  const adapter = makeAdapter();
  const tracker = async (): Promise<Tracker> => {
    const v = await adapter.validate(actor, 'synthetic-connection', 'synthetic-file', 7);
    return {
      id: crypto.randomUUID(),
      userId: actor.userId,
      googleConnectionId: 'synthetic-connection',
      spreadsheetId: 'synthetic-file',
      sheetId: 7,
      sheetTitle: v.sheetTitle,
      fingerprint: v.fingerprint,
      version: 1,
      status: 'active',
    };
  };
  return { actor, date, cells, sheet, state, adapter, makeAdapter, tracker };
}
