import { describe, it, expect } from 'vitest';
import { ACTIVITIES } from '@sdj/domain';
import type { Mutation } from '@sdj/application';
import { standardValidation } from '../../packages/infrastructure/src/sheet-validation.js';
import { columnName } from '../../packages/infrastructure/src/sheet-profile.js';
import { setup } from '../fixtures/synthetic-sheets.js';

describe('Google Sheets adapter dengan respons API sintetis', () => {
  it('mempertahankan fingerprint referensi lama dan memberi ringkasan konfigurasi', async () => {
    const s = setup();
    const v = await s.adapter.validate(s.actor, 'synthetic-connection', 'synthetic-file', 7);
    expect(v.fingerprint).toBe('a2cfe4b52fa2df8caed3569e2ea909a62ae4f2e478bd235950990777778c97fa');
    expect(v.configuration).toEqual({
      mode: 'reference',
      activityCount: 15,
      dateCount: 1,
      dateFrom: s.date,
      dateTo: s.date,
    });
    expect(s.state.requests).toHaveLength(0);
  });
  it('menyesuaikan kolom label, urutan aktivitas, dan baris tanggal ISO tanpa mengubah sheet', async () => {
    const s = setup();
    for (const row of s.cells) row.fill({});
    for (const [i, a] of ACTIVITIES.entries()) {
      s.cells[24 - i]![1] = { userEnteredValue: { stringValue: a.label } };
      for (const c of [3, 4])
        s.cells[24 - i]![c] = {
          dataValidation: standardValidation(a.id, `${columnName(c)}${25 - i}`),
        };
    }
    s.cells[4]![3] = { userEnteredValue: { stringValue: s.date } };
    s.cells[4]![4] = { userEnteredValue: { stringValue: '2026-10-16' } };
    const v = await s.adapter.validate(s.actor, 'synthetic-connection', 'synthetic-file', 7);
    expect(v.configuration).toEqual({
      mode: 'adapted',
      activityCount: 15,
      dateCount: 2,
      dateFrom: s.date,
      dateTo: '2026-10-16',
    });
    expect(v.bindings.dzuhur).toBe(23);
    const t = await s.tracker();
    const target = (
      await s.adapter.inspect(s.actor, t, [
        { activityId: 'dzuhur', localDate: s.date, afterValue: { kind: 'number', value: 3 } },
      ])
    )[0]!;
    expect(target).toMatchObject({ row: 23, column: 3, value: { kind: 'blank' } });
    expect(s.state.requests).toHaveLength(0);
    await s.adapter.write(s.actor, t, [
      {
        id: crypto.randomUUID(),
        target,
        before: target.value,
        after: { kind: 'number', value: 3 },
        status: 'prepared',
      },
    ]);
    expect(s.state.requests).toHaveLength(1);
    expect(s.state.requests[0]).toMatchObject({
      requests: [
        {
          updateCells: {
            range: { startRowIndex: 23, startColumnIndex: 3 },
            rows: [{ values: [{ userEnteredValue: { numberValue: 3 } }] }],
          },
        },
      ],
    });
  });
  it('menolak dua kolom aktivitas yang sama lengkap ketika autoconfig dibutuhkan', async () => {
    const s = setup();
    for (const row of s.cells) row.fill({});
    for (const [i, a] of ACTIVITIES.entries())
      for (const column of [1, 2])
        s.cells[i + 8]![column] = { userEnteredValue: { stringValue: a.label } };
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_LAYOUT_AMBIGUOUS' });
    expect(s.state.requests).toHaveLength(0);
  });
  it('membedakan tanggal native dari angka besar berformat mata uang saat mencari kalender', async () => {
    const s = setup();
    s.cells[6]![9] = {};
    for (const [i, a] of ACTIVITIES.entries())
      for (const column of [3, 4])
        s.cells[i + 8]![column] = {
          dataValidation: standardValidation(a.id, `${columnName(column)}${i + 9}`),
        };
    for (const [i, date] of [s.date, '2026-10-16'].entries())
      s.cells[4]![3 + i] = {
        effectiveValue: { numberValue: Date.parse(date) / 86400000 + 25569 },
        effectiveFormat: { numberFormat: { type: 'DATE' } },
      };
    await expect(s.tracker()).resolves.toMatchObject({ status: 'active' });
    for (const col of [3, 4])
      s.cells[4]![col] = {
        effectiveValue: { numberValue: 50000 + col },
        effectiveFormat: { numberFormat: { type: 'CURRENCY' } },
      };
    await expect(s.tracker()).rejects.toMatchObject({ code: 'DATE_NOT_IN_TRACKER' });
    expect(s.state.requests).toHaveLength(0);
  });
  it('menolak beberapa kalender dan header hanya 1-31 tanpa menebak tanggal', async () => {
    const s = setup();
    for (const [i, a] of ACTIVITIES.entries()) {
      s.cells[i + 8]![0] = {};
      s.cells[i + 8]![1] = { userEnteredValue: { stringValue: a.label } };
    }
    for (const row of [4, 5])
      for (const [i, date] of [s.date, '2026-10-16'].entries())
        s.cells[row]![3 + i] = { userEnteredValue: { stringValue: date } };
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_LAYOUT_AMBIGUOUS' });
    for (const row of [4, 5, 6])
      for (let col = 2; col < 11; col++)
        s.cells[row]![col] = { userEnteredValue: { numberValue: col } };
    await expect(s.tracker()).rejects.toMatchObject({ code: 'DATE_NOT_IN_TRACKER' });
  });
  it('membaca pilihan angka dari rentang/named range pada file yang sama dan tetap membatasi nilai', async () => {
    const s = setup();
    const t = await s.tracker();
    s.state.sheets.push({
      properties: {
        sheetId: 8,
        title: "Synthetic's Choices",
        gridProperties: { rowCount: 4, columnCount: 1 },
      },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [0, 1, 2, 3].map((n) => ({
            values: [{ userEnteredValue: { numberValue: n } }],
          })),
        },
      ],
      protectedRanges: [],
    });
    s.cells[8]![9] = {
      dataValidation: {
        condition: {
          type: 'ONE_OF_RANGE',
          values: [{ userEnteredValue: "='Synthetic''s Choices'!$A$1:$A$4" }],
        },
      },
    };
    const v = await s.adapter.inspect(s.actor, t, [
      { activityId: 'subuh', localDate: s.date, afterValue: { kind: 'number', value: 3 } },
    ]);
    expect(v[0]?.value).toEqual({ kind: 'blank' });
    expect(
      s.state.readUrls.some((url) =>
        new URL(url).searchParams.getAll('ranges').includes("'Synthetic''s Choices'!A1:A4")
      )
    ).toBe(true);
    s.state.namedRanges.push({
      name: 'ScoreChoices',
      range: { sheetId: 8, endRowIndex: 4, endColumnIndex: 1 },
    });
    s.cells[8]![9] = {
      dataValidation: {
        condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: 'ScoreChoices' }] },
      },
    };
    await expect(
      s.adapter.inspect(s.actor, t, [
        { activityId: 'subuh', localDate: s.date, afterValue: { kind: 'number', value: 2 } },
      ])
    ).resolves.toHaveLength(1);
    s.state.sheets[1]!.data[0]!.rowData.splice(2);
    await expect(
      s.adapter.inspect(s.actor, t, [
        { activityId: 'subuh', localDate: s.date, afterValue: { kind: 'number', value: 3 } },
      ])
    ).rejects.toMatchObject({ code: 'VALUE_OUT_OF_RANGE' });
    expect(s.state.requests).toHaveLength(0);
  });
  it('menyebut aktivitas, sel, dan tipe aturan ketika pemetaan validasi tidak pasti', async () => {
    const s = setup();
    const t = await s.tracker();
    s.cells[8]![9] = {
      dataValidation: {
        condition: {
          type: 'CUSTOM_FORMULA',
          values: [{ userEnteredValue: '=INDIRECT("private")' }],
        },
      },
    };
    await expect(
      s.adapter.inspect(s.actor, t, [{ activityId: 'subuh', localDate: s.date }])
    ).rejects.toMatchObject({
      code: 'TRACKER_VALIDATION_UNSUPPORTED',
      message: expect.stringContaining('Subuh di J9 [CUSTOM_FORMULA]'),
    });
    expect(s.state.requests).toHaveLength(0);
  });
  it('rekap beberapa tanggal memakai satu range ringkas tanpa request write', async () => {
    const s = setup();
    s.cells[6]![10] = {
      effectiveValue: { numberValue: Date.parse('2026-10-16') / 86400000 + 25569 },
    };
    for (const [i, definition] of ACTIVITIES.entries())
      s.cells[i + 8]![10] = { dataValidation: standardValidation(definition.id, `K${i + 9}`) };
    const t = await s.tracker();
    s.cells[8]![9] = { userEnteredValue: { numberValue: 3 } };
    s.cells[8]![10] = { userEnteredValue: { numberValue: 0 } };
    const snapshots = await s.adapter.inspect(
      s.actor,
      t,
      [s.date, '2026-10-16'].flatMap((localDate) =>
        ACTIVITIES.map((a) => ({ activityId: a.id, localDate }))
      )
    );
    expect(snapshots).toHaveLength(30);
    expect(snapshots.filter((v) => v.activityId === 'subuh').map((v) => v.value)).toEqual([
      { kind: 'number', value: 3 },
      { kind: 'number', value: 0 },
    ]);
    expect(new URL(s.state.readUrls.at(-1)!).searchParams.getAll('ranges')).toEqual([
      "'Synthetic''s SDJ'!J9:K23",
    ]);
    expect(s.state.requests).toHaveLength(0);
  });
  it('menolak Excel dan akun tanpa izin edit', async () => {
    const s = setup();
    s.state.native = false;
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_NOT_NATIVE' });
    s.state.native = true;
    s.state.canEdit = false;
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_READ_ONLY' });
  });
  it('menolak label dan header tanggal duplikat', async () => {
    const s = setup();
    s.cells[30]![0] = s.cells[8]![0]!;
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_SCHEMA_CHANGED' });
    s.cells[30]![0] = {};
    s.cells[6]![10] = s.cells[6]![9]!;
    await expect(s.tracker()).rejects.toMatchObject({ code: 'TRACKER_SCHEMA_CHANGED' });
  });
  it('mendeteksi pergeseran struktur setelah binding', async () => {
    const s = setup(),
      t = await s.tracker();
    s.sheet.properties.title = 'Moved';
    await expect(
      s.adapter.inspect(s.actor, t, [{ activityId: 'dzuhur', localDate: s.date }])
    ).rejects.toMatchObject({ code: 'TRACKER_SCHEMA_CHANGED' });
  });
  it('menjaga blank, zero dan false serta validasi pilihan sebelum write', async () => {
    const s = setup(),
      t = await s.tracker();
    s.cells[9]![9] = {
      userEnteredValue: { numberValue: 0 },
      dataValidation: {
        condition: {
          type: 'ONE_OF_LIST',
          values: [{ userEnteredValue: '0' }, { userEnteredValue: '1' }],
        },
      },
    };
    const v = await s.adapter.inspect(s.actor, t, [{ activityId: 'dzuhur', localDate: s.date }]);
    expect(v[0]?.value).toEqual({ kind: 'number', value: 0 });
    await expect(
      s.adapter.inspect(s.actor, t, [
        { activityId: 'dzuhur', localDate: s.date, afterValue: { kind: 'number', value: 3 } },
      ])
    ).rejects.toMatchObject({ code: 'VALUE_OUT_OF_RANGE' });
    expect(s.state.requests).toHaveLength(0);
  });
  it('mengirim satu typed batch dan field mask tanpa formula atau range dari pengguna', async () => {
    const s = setup(),
      t = await s.tracker();
    const targets = await s.adapter.inspect(s.actor, t, [
      { activityId: 'dzuhur', localDate: s.date },
      { activityId: 'dhuha', localDate: s.date },
    ]);
    const mutations: Mutation[] = targets.map((target, i) => ({
      id: crypto.randomUUID(),
      target,
      before: target.value,
      after: i === 0 ? { kind: 'number', value: 0 } : { kind: 'boolean', value: false },
      status: 'prepared',
    }));
    await s.adapter.write(s.actor, t, mutations);
    expect(s.state.requests).toHaveLength(1);
    expect(s.state.requests[0]).toMatchObject({
      requests: [
        {
          updateCells: {
            range: {
              sheetId: 7,
              startRowIndex: 9,
              startColumnIndex: 9,
              endRowIndex: 10,
              endColumnIndex: 10,
            },
            rows: [{ values: [{ userEnteredValue: { numberValue: 0 } }] }],
            fields: 'userEnteredValue',
          },
        },
        { updateCells: { rows: [{ values: [{ userEnteredValue: { boolValue: false } }] }] } },
      ],
    });
  });
  it('membedakan penolakan HTTP dan timeout setelah pengiriman', async () => {
    const s = setup(),
      t = await s.tracker(),
      target = (
        await s.adapter.inspect(s.actor, t, [{ activityId: 'dzuhur', localDate: s.date }])
      )[0]!;
    const m: Mutation = {
      id: crypto.randomUUID(),
      target,
      before: target.value,
      after: { kind: 'number', value: 3 },
      status: 'prepared',
    };
    s.state.status = 403;
    await expect(s.adapter.write(s.actor, t, [m])).rejects.toMatchObject({ definitive: true });
    s.state.writeError = true;
    await expect(s.adapter.write(s.actor, t, [m])).rejects.toMatchObject({ definitive: false });
  });
});
