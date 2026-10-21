import { z } from 'zod';
import { ACTIVITIES, DomainError, type ActivityId } from '@sdj/domain';
import type { TrackerValidation, TrackerRepairProgress } from '@sdj/application';
import {
  blocked,
  cellAt,
  columnName,
  quote,
  type SheetData,
  type WorkbookData,
  type SheetLayout,
} from './sheet-profile.js';
import {
  digest,
  planCell,
  rawValue,
  repairRecordSchema,
  sourceMatches,
  targetMatches,
  type RepairRecord,
} from './sheet-normalization.js';

const MAX_BYTES = 1_000_000;
const KEY = 'sdj.repair.run.v1';
export const repairFields =
  'sheets(properties,merges,protectedRanges,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,dataValidation,note))))';
const counters = z
  .object({
    repairedValidationCells: z.number().int().nonnegative(),
    resetInputCells: z.number().int().nonnegative(),
    convertedInputCells: z.number().int().nonnegative(),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    runId: z.string(),
    sourceSheetId: z.number().int(),
    fingerprint: z.string(),
    nextRow: z.number().int().positive(),
    stats: counters,
    pending: z
      .object({
        start: z.number().int().positive(),
        end: z.number().int().positive(),
        batchId: z.string(),
        count: z.number().int().positive().max(500),
      })
      .strict()
      .nullable(),
  })
  .strict();
type Manifest = z.infer<typeof manifestSchema>;
export interface RepairStructure {
  sheet: SheetData;
  metadata: WorkbookData;
  rows: Record<ActivityId, number>;
  dates: Map<string, number>;
  layout: SheetLayout;
  fingerprint: string;
}
export interface RepairIO {
  structure(): Promise<RepairStructure>;
  read(ranges: string[], sheetId: number): Promise<SheetData>;
  post(requests: readonly unknown[]): Promise<void>;
}
function authorizedRecord(
  record: RepairRecord,
  structure: RepairStructure,
  runId: string
): boolean {
  const definition = ACTIVITIES.find((a) => a.id === record.activityId);
  if (
    !definition ||
    record.runId !== runId ||
    record.sheetId !== structure.sheet.properties.sheetId ||
    record.fingerprint !== structure.fingerprint ||
    structure.rows[definition.id] !== record.row ||
    ![...structure.dates.values()].includes(record.column) ||
    record.address !== `${columnName(record.column)}${record.row + 1}`
  )
    return false;
  const cell = {
    ...(record.before.value ? { userEnteredValue: record.before.value } : {}),
    ...(record.before.effective ? { effectiveValue: record.before.effective } : {}),
    ...(record.before.rule ? { dataValidation: record.before.rule } : {}),
    note: record.before.note,
  };
  const expected = planCell(
    cell,
    definition.id,
    record.row,
    record.column,
    record.address,
    structure.metadata.properties?.locale ?? 'en_US',
    runId,
    structure.fingerprint,
    record.sheetId
  );
  return expected !== null && digest(expected) === digest(record);
}
function headerRequest(sheetId: number, manifest: Manifest) {
  const json = JSON.stringify(manifest);
  return {
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: json } },
            { userEnteredValue: { stringValue: digest(manifest) } },
          ],
        },
      ],
      fields: 'userEnteredValue',
    },
  };
}
function manifestFrom(sheet: SheetData): Manifest {
  try {
    const json = cellAt(sheet, 0, 0).userEnteredValue?.stringValue;
    const checksum = cellAt(sheet, 0, 1).userEnteredValue?.stringValue;
    const manifest = manifestSchema.parse(JSON.parse(json ?? ''));
    if (digest(manifest) !== checksum) throw new Error('CHECKSUM');
    return manifest;
  } catch {
    throw new DomainError(
      'TRACKER_BACKUP_INVALID',
      'Catatan proses pemulihan belum dapat diverifikasi. Isi tracker belum dipaksakan berubah.'
    );
  }
}
function chunkText(text: string): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 40000, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    result.push(text.slice(start, end));
    start = end;
  }
  return result;
}
function encodedRows(records: readonly RepairRecord[]) {
  return records.flatMap((record) => {
    const json = JSON.stringify(record),
      parts = chunkText(json),
      checksum = digest(record);
    return parts.map((part, index) => [
      record.id,
      String(index),
      String(parts.length),
      checksum,
      part,
      'prepared',
    ]);
  });
}
function decodeRows(sheet: SheetData, pending: NonNullable<Manifest['pending']>): RepairRecord[] {
  const groups = new Map<string, { parts: string[]; count: number; checksum: string }>();
  for (let row = pending.start; row < pending.end; row++) {
    const values = Array.from(
      { length: 5 },
      (_, col) => cellAt(sheet, row, col).userEnteredValue?.stringValue
    );
    const [id, part, count, checksum, content] = values;
    if (
      !id ||
      !checksum ||
      content === undefined ||
      !/^\d+$/.test(part ?? '') ||
      !/^[1-9]\d*$/.test(count ?? '')
    )
      throw new Error('BACKUP_INCOMPLETE');
    const group = groups.get(id) ?? { parts: [], count: Number(count), checksum };
    if (
      group.count !== Number(count) ||
      group.checksum !== checksum ||
      Number(part) >= group.count ||
      group.parts[Number(part)] !== undefined
    )
      throw new Error('BACKUP_PART_INVALID');
    group.parts[Number(part)] = content;
    groups.set(id, group);
  }
  const records = [...groups].map(([id, group]) => {
    if (group.parts.filter((p) => p !== undefined).length !== group.count)
      throw new Error('BACKUP_INCOMPLETE');
    const record = repairRecordSchema.parse(JSON.parse(group.parts.join('')));
    if (record.id !== id || digest(record) !== group.checksum) throw new Error('BACKUP_CHECKSUM');
    return record;
  });
  if (records.length !== pending.count || digest(records.map((r) => r.id)) !== pending.batchId)
    throw new Error('BACKUP_BATCH');
  return records;
}
function valueRequest(record: RepairRecord) {
  const range = {
    sheetId: record.sheetId,
    startRowIndex: record.row,
    endRowIndex: record.row + 1,
    startColumnIndex: record.column,
    endColumnIndex: record.column + 1,
  };
  return {
    updateCells: {
      range,
      rows: [
        {
          values: [
            { userEnteredValue: rawValue(record.after) ?? undefined, dataValidation: record.rule },
          ],
        },
      ],
      fields: record.valueChanged ? 'userEnteredValue,dataValidation' : 'dataValidation',
    },
  };
}
async function postSized(io: RepairIO, requests: readonly unknown[]) {
  let batch: unknown[] = [];
  for (const request of requests) {
    if (Buffer.byteLength(JSON.stringify({ requests: [request] })) > MAX_BYTES)
      throw new DomainError(
        'TRACKER_REPAIR_REQUEST_TOO_LARGE',
        'Satu perubahan melampaui batas permintaan Google. Perubahan tersebut belum dikirim.'
      );
    if (
      batch.length &&
      Buffer.byteLength(JSON.stringify({ requests: [...batch, request] })) > MAX_BYTES
    ) {
      await io.post(batch);
      batch = [];
    }
    batch.push(request);
  }
  if (batch.length) await io.post(batch);
}
function selectBatch(records: readonly RepairRecord[]): RepairRecord[] {
  const selected: RepairRecord[] = [];
  let backupBytes = 0,
    inputBytes = 0;
  for (const record of records) {
    const rows = encodedRows([record]);
    const backupSize = Buffer.byteLength(JSON.stringify(rows)) + rows.length * 350;
    const inputSize = Buffer.byteLength(JSON.stringify(valueRequest(record))) + 1;
    if (selected.length && (backupBytes + backupSize > 850000 || inputBytes + inputSize > 850000))
      break;
    selected.push(record);
    backupBytes += backupSize;
    inputBytes += inputSize;
    if (selected.length === 500) break;
  }
  return selected;
}
function progress(structure: RepairStructure, manifest?: Manifest): TrackerRepairProgress {
  return {
    repairing: true,
    fingerprint: structure.fingerprint,
    progress: manifest?.stats ?? {
      repairedValidationCells: 0,
      resetInputCells: 0,
      convertedInputCells: 0,
    },
  };
}
function final(structure: RepairStructure, manifest?: Manifest): TrackerValidation {
  const stats = manifest?.stats;
  return {
    sheetTitle: structure.sheet.properties.title,
    fingerprint: structure.fingerprint,
    bindings: structure.rows,
    normalizedLabels: structure.layout.normalizedLabels,
    configuration: {
      mode: structure.layout.mode,
      activityCount: ACTIVITIES.length,
      dateCount: structure.dates.size,
      dateFrom: [...structure.dates.keys()].sort()[0]!,
      dateTo: [...structure.dates.keys()].sort().at(-1)!,
      ...(stats?.repairedValidationCells
        ? { repairedValidationCells: stats.repairedValidationCells }
        : {}),
      ...(stats?.resetInputCells ? { resetInputCells: stats.resetInputCells } : {}),
      ...(stats?.convertedInputCells ? { convertedInputCells: stats.convertedInputCells } : {}),
    },
  };
}
function inputRanges(structure: RepairStructure): string[] {
  const columns = [...structure.dates.values()];
  const first = columnName(Math.min(...columns)),
    last = columnName(Math.max(...columns));
  return ACTIVITIES.map(
    (a) =>
      `${quote(structure.sheet.properties.title)}!${first}${structure.rows[a.id] + 1}:${last}${structure.rows[a.id] + 1}`
  );
}
function planInputs(structure: RepairStructure, cells: SheetData, runId: string): RepairRecord[] {
  const records: RepairRecord[] = [];
  // Check all structural constraints before the first backup or input write.
  for (const definition of ACTIVITIES)
    for (const column of structure.dates.values()) {
      const row = structure.rows[definition.id],
        address = `${columnName(column)}${row + 1}`;
      if (blocked(cells, row, column) || blocked(structure.sheet, row, column))
        throw new DomainError(
          'TRACKER_SCHEMA_CHANGED',
          `${definition.label} di ${address}: sel input merged atau terlindungi sehingga belum dapat diedit.`
        );
      const record = planCell(
        cellAt(cells, row, column),
        definition.id,
        row,
        column,
        address,
        structure.metadata.properties?.locale ?? 'en_US',
        runId,
        structure.fingerprint,
        structure.sheet.properties.sheetId
      );
      if (record) records.push(record);
    }
  return records;
}
async function backup(
  io: RepairIO,
  structure: RepairStructure,
  runId: string
): Promise<{ sheet: SheetData; manifest: Manifest }> {
  const existing = structure.metadata.sheets.find((s) =>
    s.developerMetadata?.some((m) => m.metadataKey === KEY && m.metadataValue === runId)
  );
  if (existing) {
    const data = await io.read(
      [`${quote(existing.properties.title)}!A1:F1`],
      existing.properties.sheetId
    );
    const manifest = manifestFrom(data);
    if (
      manifest.runId !== runId ||
      manifest.sourceSheetId !== structure.sheet.properties.sheetId ||
      !existing.properties.hidden
    )
      throw new DomainError('TRACKER_BACKUP_INVALID', 'Identitas tab cadangan tidak sesuai.');
    return { sheet: existing, manifest };
  }
  let id = 100000000 + Number.parseInt(digest(runId).slice(0, 7), 16);
  while (structure.metadata.sheets.some((s) => s.properties.sheetId === id)) id++;
  let title = `_SDJ_Backup_${runId.slice(0, 16)}`;
  if (structure.metadata.sheets.some((s) => s.properties.title === title)) title += `_${id}`;
  const manifest: Manifest = {
    version: 1,
    runId,
    sourceSheetId: structure.sheet.properties.sheetId,
    fingerprint: structure.fingerprint,
    nextRow: 1,
    pending: null,
    stats: { repairedValidationCells: 0, resetInputCells: 0, convertedInputCells: 0 },
  };
  await io.post([
    {
      addSheet: {
        properties: {
          sheetId: id,
          title,
          hidden: true,
          gridProperties: { rowCount: 1000, columnCount: 6 },
        },
      },
    },
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: KEY,
          metadataValue: runId,
          visibility: 'DOCUMENT',
          location: { sheetId: id },
        },
      },
    },
    headerRequest(id, manifest),
  ]);
  const fresh = await io.structure();
  const result = fresh.metadata.sheets.find(
    (s) =>
      s.properties.sheetId === id &&
      s.properties.hidden &&
      s.developerMetadata?.some((m) => m.metadataKey === KEY && m.metadataValue === runId)
  );
  if (!result)
    throw new DomainError('TRACKER_REPAIR_UNVERIFIED', 'Tab cadangan belum terverifikasi.');
  const persisted = manifestFrom(await io.read([`${quote(title)}!A1:F1`], id));
  if (digest(persisted) !== digest(manifest))
    throw new DomainError(
      'TRACKER_REPAIR_UNVERIFIED',
      'Catatan proses cadangan belum terverifikasi.'
    );
  return { sheet: result, manifest };
}
async function savePrepared(
  io: RepairIO,
  sheet: SheetData,
  manifest: Manifest,
  records: RepairRecord[]
): Promise<void> {
  const rows = encodedRows(records),
    start = manifest.nextRow;
  const pending = {
    start,
    end: start + rows.length,
    batchId: digest(records.map((r) => r.id)),
    count: records.length,
  };
  manifest.pending = pending;
  if (pending.end > sheet.properties.gridProperties.rowCount)
    await io.post([
      {
        appendDimension: {
          sheetId: sheet.properties.sheetId,
          dimension: 'ROWS',
          length: pending.end - sheet.properties.gridProperties.rowCount + 100,
        },
      },
    ]);
  // Grow first: interrupted allocation must not leave a manifest outside the grid.
  // No input is written until every persisted backup part verifies.
  await io.post([headerRequest(sheet.properties.sheetId, manifest)]);
  const requests = rows.map((values, i) => ({
    updateCells: {
      range: {
        sheetId: sheet.properties.sheetId,
        startRowIndex: start + i,
        endRowIndex: start + i + 1,
        startColumnIndex: 0,
        endColumnIndex: 6,
      },
      rows: [{ values: values.map((value) => ({ userEnteredValue: { stringValue: value } })) }],
      fields: 'userEnteredValue',
    },
  }));
  await postSized(io, requests);
}
async function finish(
  io: RepairIO,
  sheet: SheetData,
  manifest: Manifest,
  records: RepairRecord[],
  verified: Set<string>
) {
  const pending = manifest.pending!;
  const rows = encodedRows(records);
  const next = manifestSchema.parse({ ...manifest, nextRow: pending.end, pending: null });
  for (const record of records)
    if (verified.has(record.id)) {
      if (record.ruleChanged) next.stats.repairedValidationCells++;
      if (record.reason === 'clear') next.stats.resetInputCells++;
      if (record.reason === 'convert') next.stats.convertedInputCells++;
    }
  const statusRequests = rows.map((row, i) => ({
    updateCells: {
      range: {
        sheetId: sheet.properties.sheetId,
        startRowIndex: pending.start + i,
        endRowIndex: pending.start + i + 1,
        startColumnIndex: 5,
        endColumnIndex: 6,
      },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: verified.has(row[0]!) ? 'verified' : 'conflict' } },
          ],
        },
      ],
      fields: 'userEnteredValue',
    },
  }));
  // At most 500 records: this status-only batch is bounded; manifest and receipts commit together.
  const requests = [...statusRequests, headerRequest(sheet.properties.sheetId, next)];
  if (Buffer.byteLength(JSON.stringify({ requests })) > MAX_BYTES)
    throw new DomainError(
      'TRACKER_REPAIR_REQUEST_TOO_LARGE',
      'Catatan hasil perbaikan melebihi batas batch.'
    );
  await io.post(requests);
  return next;
}
export async function repairTrackerStep(
  io: RepairIO,
  structure: RepairStructure,
  runId: string
): Promise<TrackerValidation | TrackerRepairProgress> {
  const cells = await io.read(inputRanges(structure), structure.sheet.properties.sheetId);
  const all = planInputs(structure, cells, runId);
  const existing = structure.metadata.sheets.some((s) =>
    s.developerMetadata?.some((m) => m.metadataKey === KEY && m.metadataValue === runId)
  );
  if (!all.length && !existing) return final(structure);
  const state = await backup(io, structure, runId);
  const { sheet, manifest } = state;
  if (!manifest.pending && !all.length) return final(structure, manifest);
  if (!manifest.pending) {
    manifest.fingerprint = structure.fingerprint;
    await savePrepared(io, sheet, manifest, selectBatch(all));
  }
  let records: RepairRecord[];
  const pending = manifest.pending!;
  const persisted = await io.read(
    [`${quote(sheet.properties.title)}!A${pending.start + 1}:F${pending.end}`],
    sheet.properties.sheetId
  );
  try {
    records = decodeRows(persisted, pending);
  } catch {
    const reconstruct = all.slice(0, pending.count);
    if (
      manifest.fingerprint === structure.fingerprint &&
      digest(reconstruct.map((r) => r.id)) === pending.batchId
    ) {
      await savePrepared(io, sheet, manifest, reconstruct);
      const recovered = await io.read(
        [`${quote(sheet.properties.title)}!A${pending.start + 1}:F${pending.end}`],
        sheet.properties.sheetId
      );
      try {
        decodeRows(recovered, pending);
      } catch {
        throw new DomainError(
          'TRACKER_REPAIR_UNVERIFIED',
          'Cadangan belum terverifikasi; input tidak diubah. Sistem akan memeriksa ulang.'
        );
      }
      return progress(structure, manifest);
    }
    const abandoned = {
      ...manifest,
      nextRow: pending.end,
      pending: null,
      fingerprint: structure.fingerprint,
    };
    await io.post([headerRequest(sheet.properties.sheetId, abandoned)]);
    return progress(structure, abandoned);
  }
  const fresh = await io.structure();
  if (
    fresh.fingerprint !== structure.fingerprint ||
    records.some(
      (r) =>
        r.fingerprint !== fresh.fingerprint ||
        r.locale !== (fresh.metadata.properties?.locale ?? 'en_US')
    )
  ) {
    const next = await finish(io, sheet, manifest, records, new Set());
    return progress(fresh, next);
  }
  if (records.some((r) => !authorizedRecord(r, fresh, runId)))
    throw new DomainError(
      'TRACKER_BACKUP_INVALID',
      'Rencana dalam cadangan tidak sesuai dengan sel input dan aturan SDJ.'
    );
  const current = await io.read(inputRanges(fresh), fresh.sheet.properties.sheetId);
  planInputs(fresh, current, runId); // Recheck every protection/merge before writing a prepared batch.
  const applicable = records.filter(
    (r) =>
      sourceMatches(cellAt(current, r.row, r.column), r) &&
      !targetMatches(cellAt(current, r.row, r.column), r)
  );
  if (applicable.length) await postSized(io, applicable.map(valueRequest));
  const after = await io.read(inputRanges(fresh), fresh.sheet.properties.sheetId);
  const verified = new Set<string>();
  for (const r of records) {
    const cell = cellAt(after, r.row, r.column);
    if (targetMatches(cell, r)) verified.add(r.id);
    else if (sourceMatches(cell, r))
      throw new DomainError(
        'TRACKER_REPAIR_UNVERIFIED',
        'Perubahan input belum terverifikasi; sistem akan memeriksa ulang otomatis.'
      );
    // Human edits supersede the old plan. Unresolved input is replanned on the next step.
  }
  const next = await finish(io, sheet, manifest, records, verified);
  return progress(fresh, next);
}
