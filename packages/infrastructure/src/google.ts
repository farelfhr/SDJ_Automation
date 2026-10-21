import { z } from 'zod';
import {
  ACTIVITIES,
  DomainError,
  sameValue,
  validateValue,
  type ActorContext,
  type ActivityId,
  type ResolvedItem,
  type TypedCellValue,
} from '@sdj/domain';
import {
  WriteFailure,
  type Tracker,
  type TrackerGateway,
  type Mutation,
  type TargetSnapshot,
  type TrackerValidation,
  type TrackerRepairProgress,
} from '@sdj/application';
import { Database } from './db.js';
import { CryptoBox } from './crypto.js';
import {
  Workbook,
  Condition,
  gridFields,
  cellAt,
  columnName,
  quote,
  blocked,
  typedCell,
  referenceLayout,
  findActivityColumn,
  adaptedLayout,
  layoutFingerprint,
  choiceRange,
  type SheetData,
  type WorkbookData,
  type SheetLayout,
} from './sheet-profile.js';
import { validateCell, numericLiteral } from './sheet-validation.js';
import { digest } from './sheet-normalization.js';
import { repairTrackerStep, repairFields } from './tracker-repair.js';
export interface TokenProvider {
  accessToken(actor: ActorContext, connectionId: string): Promise<string>;
}
const TokenRow = z.object({
  id: z.string(),
  refresh_token_ciphertext: z.instanceof(Buffer).nullable(),
  version: z.coerce.number(),
  status: z.string(),
});
const TokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});
export class GoogleTokens implements TokenProvider {
  private readonly cache = new Map<string, { token: string; until: number; version: number }>();
  constructor(
    private readonly db: Database,
    private readonly box: CryptoBox,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly request: typeof fetch = fetch
  ) {}
  async accessToken(actor: ActorContext, connectionId: string): Promise<string> {
    const cached = this.cache.get(`${actor.userId}:${connectionId}`);
    const connection = await this.db.tenant(actor, async (client) =>
      TokenRow.parse(
        (
          await client.query(
            'SELECT id,refresh_token_ciphertext,version,status FROM sdj.google_connections WHERE id=$1',
            [connectionId]
          )
        ).rows[0]
      )
    );
    if (!['active', 'pending'].includes(connection.status) || !connection.refresh_token_ciphertext)
      throw new DomainError(
        'TRACKER_REAUTH_REQUIRED',
        'Hubungkan ulang akun Google untuk melanjutkan.'
      );
    if (cached && cached.until > Date.now() && cached.version === connection.version)
      return cached.token;
    const locked = await this.db.lock('google:' + connectionId, async () => {
      const fresh = await this.db.tenant(actor, async (client) =>
        TokenRow.parse(
          (
            await client.query(
              'SELECT id,refresh_token_ciphertext,version,status FROM sdj.google_connections WHERE id=$1',
              [connectionId]
            )
          ).rows[0]
        )
      );
      if (!fresh.refresh_token_ciphertext || !['active', 'pending'].includes(fresh.status))
        throw new DomainError('TRACKER_REAUTH_REQUIRED', 'Hubungkan ulang akun Google.');
      const token = this.box.open(
        fresh.refresh_token_ciphertext,
        `google:refresh:${actor.userId}:${connectionId}`,
        z.string()
      );
      const response = await this.request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        if (response.status === 400 || response.status === 401)
          await this.db.tenant(actor, async (client) => {
            await client.query(
              "UPDATE sdj.google_connections SET status='reauth_required',version=version+1 WHERE id=$1 AND status='active'",
              [connectionId]
            );
            await client.query(
              "UPDATE sdj.tracker_connections SET status='reauth_required',version=version+1 WHERE google_connection_id=$1 AND status='active'",
              [connectionId]
            );
          });
        throw new DomainError(
          'TRACKER_REAUTH_REQUIRED',
          'Akses Google tidak dapat diperbarui. Hubungkan ulang jika izin dicabut.'
        );
      }
      const result = TokenResponse.parse(await response.json());
      const updated = await this.db.tenant(actor, async (client) => {
        const r = await client.query(
          "UPDATE sdj.google_connections SET refresh_token_ciphertext=coalesce($3,refresh_token_ciphertext),version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND status IN ('active','pending') RETURNING version",
          [
            connectionId,
            fresh.version,
            result.refresh_token
              ? this.box.seal(
                  result.refresh_token,
                  `google:refresh:${actor.userId}:${connectionId}`
                )
              : null,
          ]
        );
        return r.rows[0] as { version: string } | undefined;
      });
      if (!updated)
        throw new DomainError('TRACKER_REAUTH_REQUIRED', 'Koneksi Google berubah saat refresh.');
      this.cache.set(`${actor.userId}:${connectionId}`, {
        token: result.access_token,
        until: Date.now() + Math.max(0, (result.expires_in ?? 300) - 60) * 1000,
        version: Number(updated.version),
      });
      return result.access_token;
    });
    if (locked === null)
      throw new DomainError(
        'GOOGLE_REFRESH_BUSY',
        'Koneksi Google sedang diperbarui. Coba sebentar lagi.'
      );
    return locked;
  }
}
export class GoogleSheetsAdapter implements TrackerGateway {
  constructor(
    private readonly tokens: TokenProvider,
    private readonly liveEnabled: boolean,
    private readonly request: typeof fetch = fetch
  ) {}
  private async get(
    actor: ActorContext,
    connectionId: string,
    url: string,
    deadline?: number
  ): Promise<unknown> {
    if (!this.liveEnabled)
      throw new DomainError('GOOGLE_NOT_CONFIGURED', 'Integrasi Google Sheets belum diaktifkan.');
    const token = await this.tokens.accessToken(actor, connectionId);
    const remaining = (deadline ?? Date.now() + 8000) - Date.now();
    if (remaining <= 0)
      throw new DomainError(
        'TRACKER_ANALYSIS_TIMEOUT',
        'Pembacaan tracker melewati batas waktu. Coba validasi kembali.'
      );
    const signal = AbortSignal.timeout(Math.min(8000, remaining));
    let response: Response;
    try {
      response = await this.request(url, { headers: { authorization: 'Bearer ' + token }, signal });
    } catch (error) {
      if (signal.aborted)
        throw new DomainError(
          'TRACKER_ANALYSIS_TIMEOUT',
          'Pembacaan tracker melewati batas waktu. Coba validasi kembali.'
        );
      throw error;
    }
    if (!response.ok)
      throw new DomainError(
        response.status === 401
          ? 'TRACKER_REAUTH_REQUIRED'
          : response.status === 403
            ? 'TRACKER_READ_ONLY'
            : response.status === 429
              ? 'TRACKER_REPAIR_RATE_LIMITED'
              : 'GOOGLE_READ_FAILED',
        'Google Sheets tidak dapat dibaca. Periksa izin dan koneksi.'
      );
    return response.json();
  }
  private async readRanges(
    actor: ActorContext,
    connectionId: string,
    spreadsheetId: string,
    sheetId: number,
    ranges: string[],
    fields = gridFields,
    deadline?: number
  ): Promise<SheetData> {
    const params = new URLSearchParams({ includeGridData: 'true', fields });
    for (const range of ranges) params.append('ranges', range);
    const workbook = Workbook.parse(
      await this.get(
        actor,
        connectionId,
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params}`,
        deadline
      )
    );
    const sheet = workbook.sheets.find((s) => s.properties.sheetId === sheetId);
    if (!sheet) throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Tab tracker tidak ditemukan.');
    return sheet;
  }
  private async structure(
    actor: ActorContext,
    connectionId: string,
    spreadsheetId: string,
    sheetId: number,
    deadline = Date.now() + 20000
  ): Promise<{
    deadline: number;
    sheet: SheetData;
    rows: Record<ActivityId, number>;
    dates: Map<string, number>;
    fingerprint: string;
    layout: SheetLayout;
    metadata: WorkbookData;
  }> {
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const metadata = Workbook.parse(
      await this.get(
        actor,
        connectionId,
        base +
          '?fields=properties(timeZone,locale),sheets(properties,merges,protectedRanges,developerMetadata),namedRanges(name,range)',
        deadline
      )
    );
    const sheet = metadata.sheets.find((s) => s.properties.sheetId === sheetId);
    if (!sheet) throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Tab tracker tidak ditemukan.');
    const columns = Math.min(sheet.properties.gridProperties.columnCount, 2000),
      rowCount = sheet.properties.gridProperties.rowCount;
    if (columns < 2 || rowCount < 16)
      throw new DomainError(
        'TRACKER_SCHEMA_CHANGED',
        'Tab belum memuat ruang untuk aktivitas dan tanggal tracker lengkap.'
      );
    const ranges = [`${quote(sheet.properties.title)}!A1:A${Math.min(100, rowCount)}`];
    if (columns >= 10 && rowCount >= 7)
      ranges.push(`${quote(sheet.properties.title)}!J7:${columnName(columns - 1)}7`);
    const content = await this.readRanges(
      actor,
      connectionId,
      spreadsheetId,
      sheetId,
      ranges,
      gridFields,
      deadline
    );
    let layout = referenceLayout(content, rowCount, columns);
    if (!layout) {
      // Label-only strips avoid reading numeric daily activity values while discovering layout.
      const labels = await this.readRanges(
        actor,
        connectionId,
        spreadsheetId,
        sheetId,
        [
          `${quote(sheet.properties.title)}!A1:${columnName(Math.min(12, columns) - 1)}${Math.min(100, rowCount)}`,
        ],
        'sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue(stringValue),effectiveValue(stringValue)))))',
        deadline
      );
      const discovered = findActivityColumn(labels, rowCount, columns);
      const headerRows = Math.min(
        Math.min(...Object.values(discovered.rows)),
        24,
        Math.floor(48000 / columns)
      );
      if (headerRows < 1)
        throw new DomainError(
          'DATE_NOT_IN_TRACKER',
          'Header tanggal harus berada di atas aktivitas tracker.'
        );
      const headers = await this.readRanges(
        actor,
        connectionId,
        spreadsheetId,
        sheetId,
        [`${quote(sheet.properties.title)}!A1:${columnName(columns - 1)}${headerRows}`],
        'sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,effectiveFormat(numberFormat)))))',
        deadline
      );
      layout = adaptedLayout(headers, discovered, columns);
    }
    return {
      deadline,
      sheet,
      rows: layout.rows,
      dates: layout.dates,
      layout,
      metadata,
      fingerprint: layoutFingerprint(sheet, metadata.properties?.timeZone ?? null, layout),
    };
  }
  async validate(
    actor: ActorContext,
    connectionId: string,
    spreadsheetId: string,
    sheetId: number
  ): Promise<TrackerValidation> {
    const runId = digest({
      userId: actor.userId,
      connectionId,
      spreadsheetId,
      sheetId,
      version: 2,
    });
    for (let step = 0; step < 100; step++) {
      const result = await this.repairStep(actor, connectionId, spreadsheetId, sheetId, runId);
      if (!('repairing' in result)) return result;
      if (result.retrying)
        throw new DomainError(
          'TRACKER_REPAIR_UNVERIFIED',
          'Perbaikan belum terverifikasi. Proses dapat dilanjutkan dengan validasi kembali.'
        );
    }
    throw new DomainError(
      'TRACKER_ANALYSIS_TIMEOUT',
      'Perbaikan memerlukan kelanjutan bertahap melalui halaman penghubungan.'
    );
  }
  private readonly repairLocks = new Set<string>();
  async repairStep(
    actor: ActorContext,
    connectionId: string,
    spreadsheetId: string,
    sheetId: number,
    runId: string,
    expectedFingerprint?: string
  ): Promise<TrackerValidation | TrackerRepairProgress> {
    const lock = `${actor.userId}:${connectionId}:${spreadsheetId}:${sheetId}`;
    if (this.repairLocks.has(lock))
      return {
        repairing: true,
        fingerprint: '',
        retrying: true,
        progress: { repairedValidationCells: 0, resetInputCells: 0, convertedInputCells: 0 },
      };
    this.repairLocks.add(lock);
    let fingerprint = '';
    const deadline = Date.now() + 20000;
    try {
      const file = z
        .object({
          mimeType: z.string(),
          capabilities: z.object({ canEdit: z.boolean().optional() }).optional(),
        })
        .parse(
          await this.get(
            actor,
            connectionId,
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=mimeType,capabilities(canEdit)`,
            deadline
          )
        );
      if (file.mimeType !== 'application/vnd.google-apps.spreadsheet')
        throw new DomainError('TRACKER_NOT_NATIVE', 'Pilih file Google Sheets native.');
      if (!file.capabilities?.canEdit)
        throw new DomainError('TRACKER_READ_ONLY', 'Akun Google perlu izin editor.');
      const structure = await this.structure(actor, connectionId, spreadsheetId, sheetId, deadline);
      fingerprint = structure.fingerprint;
      if (expectedFingerprint && expectedFingerprint !== fingerprint)
        return {
          repairing: true,
          fingerprint,
          progress: { repairedValidationCells: 0, resetInputCells: 0, convertedInputCells: 0 },
        };
      return await repairTrackerStep(
        {
          structure: () => this.structure(actor, connectionId, spreadsheetId, sheetId, deadline),
          read: (ranges, targetSheetId) =>
            this.readRanges(
              actor,
              connectionId,
              spreadsheetId,
              targetSheetId,
              ranges,
              repairFields,
              deadline
            ),
          post: (requests) =>
            this.postRepair(actor, connectionId, spreadsheetId, requests, deadline),
        },
        structure,
        runId
      );
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof DomainError &&
          [
            'GOOGLE_READ_FAILED',
            'TRACKER_ANALYSIS_TIMEOUT',
            'TRACKER_REPAIR_UNVERIFIED',
            'TRACKER_REPAIR_RETRY',
            'TRACKER_REPAIR_RATE_LIMITED',
          ].includes(error.code))
      )
        return {
          repairing: true,
          fingerprint,
          retrying: true,
          ...(error instanceof DomainError && error.code === 'TRACKER_REPAIR_RATE_LIMITED'
            ? { retryAfterMs: 61000 }
            : {}),
          progress: { repairedValidationCells: 0, resetInputCells: 0, convertedInputCells: 0 },
        };
      throw error;
    } finally {
      this.repairLocks.delete(lock);
    }
  }
  async inspect(
    actor: ActorContext,
    tracker: Tracker,
    items: readonly (Pick<ResolvedItem, 'activityId' | 'localDate'> & {
      afterValue?: TypedCellValue;
    })[]
  ): Promise<TargetSnapshot[]> {
    const structure = await this.structure(
      actor,
      tracker.googleConnectionId,
      tracker.spreadsheetId,
      tracker.sheetId
    );
    if (structure.fingerprint !== tracker.fingerprint)
      throw new DomainError(
        'TRACKER_SCHEMA_CHANGED',
        'Struktur tracker berubah. Validasi ulang melalui “daftar”.'
      );
    return this.inspectWithStructure(actor, tracker, items, structure);
  }
  private async inspectWithStructure(
    actor: ActorContext,
    tracker: Tracker,
    items: readonly (Pick<ResolvedItem, 'activityId' | 'localDate'> & {
      afterValue?: TypedCellValue;
    })[],
    structure: Awaited<ReturnType<GoogleSheetsAdapter['structure']>>
  ): Promise<TargetSnapshot[]> {
    const targets = items.map((i) => {
      const column = structure.dates.get(i.localDate);
      if (column === undefined)
        throw new DomainError(
          'DATE_NOT_IN_TRACKER',
          `Tanggal ${i.localDate} tidak ada pada header tracker.`
        );
      return { ...i, row: structure.rows[i.activityId], column };
    });
    const params = new URLSearchParams({
      includeGridData: 'true',
      fields:
        'sheets(properties,merges,protectedRanges,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,dataValidation,note))))',
    });
    if (targets.length > 5 && items.every((i) => i.afterValue === undefined)) {
      const rows = targets.map((t) => t.row),
        columns = targets.map((t) => t.column);
      params.append(
        'ranges',
        `${quote(structure.sheet.properties.title)}!${columnName(Math.min(...columns))}${Math.min(...rows) + 1}:${columnName(Math.max(...columns))}${Math.max(...rows) + 1}`
      );
    } else {
      for (const t of targets)
        params.append(
          'ranges',
          `${quote(structure.sheet.properties.title)}!${columnName(t.column)}${t.row + 1}`
        );
    }
    const response = Workbook.parse(
      await this.get(
        actor,
        tracker.googleConnectionId,
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(tracker.spreadsheetId)}?${params}`,
        structure.deadline
      )
    );
    const sheet = response.sheets.find((s) => s.properties.sheetId === tracker.sheetId);
    if (!sheet) throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Tab tracker tidak ditemukan.');
    const choiceCache = new Map<string, Promise<number[]>>();
    const choices = async (cell: z.infer<typeof Condition>): Promise<number[] | undefined> => {
      if (cell.type !== 'ONE_OF_RANGE') return undefined;
      if (cell.values?.length !== 1 || !cell.values[0]?.userEnteredValue)
        throw new DomainError(
          'TRACKER_VALIDATION_UNSUPPORTED',
          'Aturan pilihan rentang memerlukan satu rentang yang jelas.'
        );
      const range = choiceRange(
        cell.values[0].userEnteredValue,
        structure.metadata,
        structure.sheet
      );
      if (!choiceCache.has(range.a1)) {
        if (choiceCache.size >= 8)
          throw new DomainError(
            'TRACKER_VALIDATION_UNSUPPORTED',
            'Terlalu banyak rentang pilihan berbeda untuk satu pembacaan tracker.'
          );
        choiceCache.set(
          range.a1,
          (async () => {
            const data = await this.readRanges(
              actor,
              tracker.googleConnectionId,
              tracker.spreadsheetId,
              range.sheet.properties.sheetId,
              [range.a1],
              'sheets(properties,data(startRow,startColumn,rowData(values(effectiveValue,userEnteredValue))))',
              structure.deadline
            );
            const values: number[] = [];
            for (let row = range.startRow; row < range.endRow; row++)
              for (let column = range.startColumn; column < range.endColumn; column++) {
                const cell = cellAt(data, row, column),
                  value = cell.effectiveValue ?? cell.userEnteredValue;
                if (!value || Object.keys(value).length === 0) continue;
                if (value.numberValue !== undefined) values.push(value.numberValue);
                else if (value.stringValue !== undefined && value.stringValue.trim() !== '')
                  values.push(numericLiteral(value.stringValue));
                else
                  throw new DomainError(
                    'TRACKER_VALIDATION_UNSUPPORTED',
                    'Rentang pilihan berisi nilai yang bukan angka.'
                  );
              }
            return values;
          })()
        );
      }
      return choiceCache.get(range.a1)!;
    };
    const snapshots: TargetSnapshot[] = [];
    for (const t of targets) {
      const c = cellAt(sheet, t.row, t.column);
      const address = columnName(t.column) + (t.row + 1);
      const writable =
        !blocked(structure.sheet, t.row, t.column) && !blocked(sheet, t.row, t.column);
      try {
        const allowed = c.dataValidation ? await choices(c.dataValidation.condition) : undefined;
        validateCell(c, t.activityId, address, t.afterValue, allowed);
      } catch (error) {
        if (
          error instanceof DomainError &&
          !error.message.startsWith(
            `${ACTIVITIES.find((a) => a.id === t.activityId)!.label} di ${address} [`
          )
        )
          throw new DomainError(
            error.code,
            `${ACTIVITIES.find((a) => a.id === t.activityId)!.label} di ${address} [${c.dataValidation?.condition.type}]: ${error.message}`
          );
        throw error;
      }
      snapshots.push({
        spreadsheetId: tracker.spreadsheetId,
        sheetId: tracker.sheetId,
        row: t.row,
        column: t.column,
        activityId: t.activityId,
        localDate: t.localDate,
        fingerprint: structure.fingerprint,
        value: typedCell(c),
        formula: !!c.userEnteredValue?.formulaValue,
        writable,
      });
    }
    return snapshots;
  }
  private async postRepair(
    actor: ActorContext,
    connectionId: string,
    spreadsheetId: string,
    requests: readonly unknown[],
    deadline: number
  ): Promise<void> {
    const body = JSON.stringify({ requests });
    if (Buffer.byteLength(body) > 1_000_000)
      throw new DomainError(
        'TRACKER_REPAIR_REQUEST_TOO_LARGE',
        'Permintaan perbaikan melebihi batas batch.'
      );
    const token = await this.tokens.accessToken(actor, connectionId);
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new DomainError('TRACKER_ANALYSIS_TIMEOUT', 'Perbaikan akan dilanjutkan otomatis.');
    let response: Response;
    try {
      response = await this.request(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(Math.min(8000, remaining)),
        }
      );
    } catch {
      throw new DomainError('TRACKER_REPAIR_UNVERIFIED', 'Hasil perubahan sedang diperiksa ulang.');
    }
    if (!response.ok)
      throw new DomainError(
        response.status === 401
          ? 'TRACKER_REAUTH_REQUIRED'
          : response.status === 403
            ? 'TRACKER_READ_ONLY'
            : response.status === 429
              ? 'TRACKER_REPAIR_RATE_LIMITED'
              : response.status >= 500 || response.status === 400
                ? 'TRACKER_REPAIR_RETRY'
                : 'TRACKER_REPAIR_REJECTED',
        'Google belum menerima perubahan. Periksa akses bila masalah berlanjut.'
      );
  }
  async write(
    actor: ActorContext,
    tracker: Tracker,
    mutations: readonly Mutation[]
  ): Promise<void> {
    if (!this.liveEnabled) throw new WriteFailure(true, 'GOOGLE_NOT_CONFIGURED');
    // Validate all cells again. The external API does not offer compare-and-swap against human edits.
    const current = await this.inspect(
      actor,
      tracker,
      mutations.map((m) => ({
        activityId: m.target.activityId,
        localDate: m.target.localDate,
        afterValue: m.after,
      }))
    );
    for (const [index, m] of mutations.entries()) {
      const c = current[index];
      if (
        !c ||
        c.formula ||
        !c.writable ||
        c.row !== m.target.row ||
        c.column !== m.target.column ||
        !sameValue(c.value, m.before)
      )
        throw new WriteFailure(true, 'PRECONDITION_CHANGED');
      if (m.after.kind !== 'blank') validateValue(m.target.activityId, m.after.value);
    }
    const token = await this.tokens.accessToken(actor, tracker.googleConnectionId);
    const requests = mutations.map((m) => ({
      updateCells: {
        range: {
          sheetId: tracker.sheetId,
          startRowIndex: m.target.row,
          endRowIndex: m.target.row + 1,
          startColumnIndex: m.target.column,
          endColumnIndex: m.target.column + 1,
        },
        rows: [
          {
            values: [
              m.after.kind === 'blank'
                ? {}
                : {
                    userEnteredValue:
                      m.after.kind === 'number'
                        ? { numberValue: m.after.value }
                        : { boolValue: m.after.value },
                  },
            ],
          },
        ],
        fields: 'userEnteredValue',
      },
    }));
    let response: Response;
    try {
      response = await this.request(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(tracker.spreadsheetId)}:batchUpdate`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({ requests }),
          signal: AbortSignal.timeout(8000),
        }
      );
    } catch {
      throw new WriteFailure(false, 'GOOGLE_WRITE_TIMEOUT');
    }
    if (!response.ok)
      throw new WriteFailure(
        [400, 401, 403, 404, 422, 429].includes(response.status),
        'GOOGLE_WRITE_REJECTED'
      );
  }
}
