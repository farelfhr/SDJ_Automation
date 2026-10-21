import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ACTIVITIES } from '@sdj/domain';
import { setup } from '../fixtures/synthetic-sheets.js';
import {
  repairRecordSchema,
  digest,
} from '../../packages/infrastructure/src/sheet-normalization.js';
import { standardValidation } from '../../packages/infrastructure/src/sheet-validation.js';
const raw = (cell: Record<string, unknown> | undefined) => cell?.userEnteredValue;
function records(s: ReturnType<typeof setup>) {
  const groups = new Map<string, string[]>();
  for (const sheet of s.state.sheets.filter((x) => x.properties.hidden))
    for (const row of sheet.data[0]!.rowData.slice(1)) {
      const text = (col: number) =>
        z.object({ stringValue: z.string() }).parse(raw(row.values[col])).stringValue;
      if (!raw(row.values[0])) continue;
      const id = text(0),
        chunks = groups.get(id) ?? [];
      chunks[Number(text(1))] = text(4);
      groups.set(id, chunks);
    }
  return [...groups.values()].map((chunks) =>
    repairRecordSchema.parse(JSON.parse(chunks.join('')))
  );
}
async function step(s: ReturnType<typeof setup>, run = 'synthetic-run-v1') {
  return s.adapter.repairStep(s.actor, 'synthetic-connection', 'synthetic-file', 7, run);
}

describe('Perbaikan seluruh tracker melalui Google API sintetis', () => {
  it('menunggu reset kuota tanpa membuat perubahan atau meminta edit spreadsheet', async () => {
    const s = setup();
    s.state.rateLimitNext = true;
    expect(await step(s)).toMatchObject({ repairing: true, retrying: true, retryAfterMs: 61000 });
    expect('repairing' in (await step(s))).toBe(false);
    expect(s.state.requests).toHaveLength(0);
  });
  it.each([0, 1, 2, 'TRUE', 'FALSE', 'asing'])(
    'memperbaiki Al-Matsurat Petang L18 berisi %s tanpa edit manual',
    async (value) => {
      const s = setup(3);
      s.cells[17]![11] = {
        userEnteredValue:
          typeof value === 'number' ? { numberValue: value } : { stringValue: value },
        note: 'Catatan pribadi',
      };
      s.cells[14]![10] = {
        userEnteredValue: { numberValue: 2.5 },
        dataValidation: standardValidation('tilawah', 'K15'),
      };
      s.cells[17]![8] = { userEnteredValue: { formulaValue: '=SUM(J18:L18)' } };
      const original = structuredClone(s.cells);
      const first = await step(s);
      expect(first).toMatchObject({ repairing: true });
      const final = await step(s);
      expect('repairing' in final).toBe(false);
      const expected =
        value === 0 || value === 'FALSE'
          ? { boolValue: false }
          : value === 1 || value === 'TRUE'
            ? { boolValue: true }
            : undefined;
      expect(raw(s.cells[17]![11])).toEqual(expected);
      expect(s.cells[17]![11]!.note).toBe('Catatan pribadi');
      expect(s.cells[14]![10]).toEqual(original[14]![10]);
      expect(s.cells[17]![8]).toEqual(original[17]![8]);
      expect(records(s)[0]!.before.value).toEqual(original[17]![11]!.userEnteredValue);
      expect(s.state.sheets[1]!.properties.hidden).toBe(true);
      const writes = s.state.requests.length;
      await step(s);
      expect(s.state.requests).toHaveLength(writes);
    }
  );
  it('menormalkan kesalahan campuran dan mencadangkan rumus hanya di wilayah input', async () => {
    const s = setup(3);
    s.cells[8]![9] = {
      userEnteredValue: { numberValue: 99 },
      dataValidation: {
        condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] },
      },
    };
    s.cells[13]![9] = { userEnteredValue: { stringValue: '2' } };
    s.cells[14]![9] = { userEnteredValue: { boolValue: false } };
    s.cells[14]![10] = { userEnteredValue: { stringValue: '2,5' } };
    s.cells[14]![11] = {
      userEnteredValue: { formulaValue: '=1+1' },
      effectiveValue: { numberValue: 2 },
    };
    s.cells[17]![11] = { userEnteredValue: { stringValue: '1' } };
    s.cells[17]![9] = {
      userEnteredValue: { stringValue: 'ya' },
      dataValidation: {
        condition: {
          type: 'BOOLEAN',
          values: [{ userEnteredValue: 'ya' }, { userEnteredValue: 'tidak' }],
        },
      },
    };
    const v = await s.adapter.validate(s.actor, 'synthetic-connection', 'synthetic-file', 7);
    expect(v.configuration).toMatchObject({ resetInputCells: 2, convertedInputCells: 5 });
    expect(raw(s.cells[8]![9])).toBeUndefined();
    expect(raw(s.cells[14]![9])).toBeUndefined();
    expect(raw(s.cells[14]![10])).toEqual({ numberValue: 2.5 });
    expect(raw(s.cells[14]![11])).toEqual({ numberValue: 2 });
    expect(records(s).find((r) => r.address === 'L15')!.before.value).toEqual({
      formulaValue: '=1+1',
    });
  });
  it('mempertahankan 0, false dan blank yang sudah sesuai tanpa membuat tab tambahan', async () => {
    const s = setup();
    s.cells[8]![9]!.userEnteredValue = { numberValue: 0 };
    s.cells[17]![9]!.userEnteredValue = { boolValue: false };
    const before = structuredClone(s.cells);
    const result = await step(s);
    expect('repairing' in result).toBe(false);
    expect(s.cells).toEqual(before);
    expect(s.state.requests).toHaveLength(0);
  });
  it.each(['protected', 'merged'])(
    'menolak %s sebelum backup dan perubahan nilai',
    async (kind) => {
      const s = setup();
      s.cells[8]![9]!.userEnteredValue = { stringValue: 'invalid' };
      const range = {
        sheetId: 7,
        startRowIndex: 17,
        endRowIndex: 18,
        startColumnIndex: 9,
        endColumnIndex: 10,
      };
      if (kind === 'protected')
        s.sheet.protectedRanges.push({ range, requestingUserCanEdit: false });
      else s.sheet.merges = [range];
      await expect(step(s)).rejects.toMatchObject({ code: 'TRACKER_SCHEMA_CHANGED' });
      expect(s.state.requests).toHaveLength(0);
    }
  );
  it.each(['create', 'manifest', 'backup', 'input', 'receipt'] as const)(
    'merekomendasikan kelanjutan sesudah timeout fase %s tanpa duplikasi input',
    async (phase) => {
      const s = setup();
      s.cells[17]![9]!.userEnteredValue = { numberValue: 1 };
      s.state.timeoutAfter = phase;
      let result = await step(s);
      for (let i = 0; i < 8 && 'repairing' in result; i++) result = await step(s);
      expect('repairing' in result).toBe(false);
      expect(raw(s.cells[17]![9])).toEqual({ boolValue: true });
      expect(s.state.phases.filter((p) => p === 'input')).toHaveLength(1);
      expect(records(s)).toHaveLength(1);
      if (!('repairing' in result)) expect(result.configuration?.convertedInputCells).toBe(1);
    }
  );
  it('tidak mengubah input bila cadangan belum terbukti tersimpan', async () => {
    const s = setup();
    s.cells[17]![9]!.userEnteredValue = { numberValue: 1 };
    s.state.ignorePhase = 'backup';
    expect(await step(s)).toMatchObject({ repairing: true });
    expect(raw(s.cells[17]![9])).toEqual({ numberValue: 1 });
    expect(s.state.phases).not.toContain('input');
    s.state.ignorePhase = undefined;
    for (let i = 0; i < 3; i++) await step(s);
    expect(raw(s.cells[17]![9])).toEqual({ boolValue: true });
  });
  it('tidak mengaku selesai bila Google belum menerapkan perubahan input', async () => {
    const s = setup();
    s.cells[17]![9]!.userEnteredValue = { numberValue: 1 };
    s.state.ignorePhase = 'input';
    expect(await step(s)).toMatchObject({ repairing: true, retrying: true });
    expect(raw(s.cells[17]![9])).toEqual({ numberValue: 1 });
    s.state.ignorePhase = undefined;
    await step(s);
    expect('repairing' in (await step(s))).toBe(false);
    expect(raw(s.cells[17]![9])).toEqual({ boolValue: true });
  });
  it.each(['before', 'after'] as const)(
    'melanjutkan alokasi ruang cadangan yang terputus %s penerapan',
    async (when) => {
      const s = setup(3);
      for (const col of [9, 10, 11]) s.cells[17]![col]!.userEnteredValue = { numberValue: 1 };
      s.state.onAfterPost = (phase) => {
        if (phase !== 'create') return;
        const backup = s.state.sheets[1]!;
        backup.properties.gridProperties.rowCount = 2;
        backup.data[0]!.rowData.splice(2);
        s.state.onAfterPost = undefined;
      };
      if (when === 'before') s.state.failBefore = 'allocate';
      else s.state.timeoutAfter = 'allocate';
      expect(await step(s)).toMatchObject({ repairing: true, retrying: true });
      let result = await step(s);
      for (let i = 0; i < 4 && 'repairing' in result; i++) result = await step(s);
      expect('repairing' in result).toBe(false);
      expect(s.state.phases.filter((p) => p === 'input')).toHaveLength(1);
      expect(records(s)).toHaveLength(3);
    }
  );
  it('menghitung ulang struktur yang berubah tanpa menulis rencana lama', async () => {
    const s = setup();
    s.cells[17]![9]!.userEnteredValue = { numberValue: 1 };
    s.state.onAfterPost = (phase) => {
      if (phase === 'backup') {
        s.sheet.properties.title = 'Tracker renamed';
        s.state.onAfterPost = undefined;
      }
    };
    expect(await step(s)).toMatchObject({ repairing: true });
    expect(s.state.phases).not.toContain('input');
    await step(s);
    expect('repairing' in (await step(s))).toBe(false);
    expect(raw(s.cells[17]![9])).toEqual({ boolValue: true });
  });
  it('menghitung ulang konversi bila locale berubah sesudah backup', async () => {
    const s = setup();
    s.cells[14]![9]!.userEnteredValue = { stringValue: '2,5' };
    s.state.onAfterPost = (phase) => {
      if (phase === 'backup') {
        s.state.locale = 'en_US';
        s.state.onAfterPost = undefined;
      }
    };
    expect(await step(s)).toMatchObject({ repairing: true });
    expect(s.state.phases).not.toContain('input');
    await step(s);
    const result = await step(s);
    expect('repairing' in result).toBe(false);
    expect(raw(s.cells[14]![9])).toBeUndefined();
    if (!('repairing' in result)) expect(result.configuration?.resetInputCells).toBe(1);
  });
  it('mempertahankan edit bersamaan lalu menghitung ulang dari nilai terbaru', async () => {
    const s = setup();
    s.cells[14]![9]!.userEnteredValue = { boolValue: false };
    s.state.onAfterPost = (phase) => {
      if (phase === 'backup') {
        s.cells[14]![9]!.userEnteredValue = { numberValue: 7 };
        s.state.onAfterPost = undefined;
      }
    };
    await step(s);
    const final = await step(s);
    expect('repairing' in final).toBe(false);
    expect(raw(s.cells[14]![9])).toEqual({ numberValue: 7 });
    expect(s.state.phases).not.toContain('input');
  });
  it('menolak rencana cadangan yang dimanipulasi untuk menulis di luar kalender', async () => {
    const s = setup();
    s.cells[17]![9]!.userEnteredValue = { numberValue: 1 };
    s.state.timeoutAfter = 'backup';
    await step(s);
    const backup = s.state.sheets[1]!,
      row = backup.data[0]!.rowData[1]!;
    const r = records(s)[0]!;
    r.row = 0;
    r.address = 'A1';
    row.values[4] = { userEnteredValue: { stringValue: JSON.stringify(r) } };
    row.values[3] = { userEnteredValue: { stringValue: digest(r) } };
    await expect(step(s)).rejects.toMatchObject({ code: 'TRACKER_BACKUP_INVALID' });
    expect(s.state.phases).not.toContain('input');
  });
  it('memecah cadangan panjang tanpa kehilangan catatan dan formula asal', async () => {
    const s = setup();
    const note = '🕌'.repeat(25000);
    s.cells[17]![9] = { userEnteredValue: { stringValue: 'tidak diketahui' }, note };
    await step(s);
    expect(records(s)[0]!.before.note).toBe(note);
    expect(s.cells[17]![9]!.note).toBe(note);
    for (const sheet of s.state.sheets.filter((x) => x.properties.hidden))
      for (const row of sheet.data[0]!.rowData.slice(1)) {
        if (raw(row.values[4]))
          expect(
            z.object({ stringValue: z.string() }).parse(raw(row.values[4])).stringValue.length
          ).toBeLessThanOrEqual(40000);
      }
    for (const body of s.state.requests)
      expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(1_000_000);
  });
  it('memproses 701 tanggal dalam batch maksimum 500 dan memulihkan refresh melalui instance baru', async () => {
    const s = setup(701);
    for (let col = 9; col < 710; col++)
      for (const [index, definition] of ACTIVITIES.entries()) {
        if (definition.id === 'matsurat_petang')
          s.cells[index + 8]![col]!.userEnteredValue = { numberValue: 1 };
      }
    const first = await step(s);
    expect(first).toMatchObject({ repairing: true, progress: { convertedInputCells: 500 } });
    expect(
      await s
        .makeAdapter()
        .repairStep(s.actor, 'synthetic-connection', 'synthetic-file', 7, 'synthetic-run-v1')
    ).toMatchObject({
      repairing: true,
      progress: { convertedInputCells: 701 },
    });
    const final = await step(s);
    expect('repairing' in final).toBe(false);
    expect(records(s)).toHaveLength(701);
    expect(s.state.phases.filter((x) => x === 'input')).toHaveLength(2);
    for (const body of s.state.requests) {
      expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(1_000_000);
      const requests = z
        .object({
          requests: z.array(
            z.object({
              updateCells: z
                .object({ range: z.object({ sheetId: z.number() }) })
                .passthrough()
                .optional(),
            })
          ),
        })
        .parse(body).requests;
      expect(requests.filter((r) => r.updateCells?.range.sheetId === 7).length).toBeLessThanOrEqual(
        500
      );
    }
  });
});
