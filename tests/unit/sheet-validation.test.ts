import { describe, it, expect } from 'vitest';
import { validateCell } from '../../packages/infrastructure/src/sheet-validation.js';
import { choiceRange, Workbook } from '../../packages/infrastructure/src/sheet-profile.js';

describe('Konfigurasi aturan angka per sel', () => {
  it.each([
    ['NUMBER_GREATER', ['0'], 1, 0],
    ['NUMBER_GREATER_THAN_EQ', ['1'], 1, 0],
    ['NUMBER_LESS', ['3'], 2, 3],
    ['NUMBER_LESS_THAN_EQ', ['2'], 2, 3],
    ['NUMBER_EQ', ['2'], 2, 3],
    ['NUMBER_NOT_EQ', ['2'], 3, 2],
    ['NUMBER_BETWEEN', ['1', '2'], 2, 3],
    ['NUMBER_NOT_BETWEEN', ['1', '2'], 3, 2],
    ['ONE_OF_LIST', ['0', '2'], 2, 3],
  ] as const)('%s dikenali dengan batas yang tetap berlaku', (type, values, yes, no) => {
    const cell = {
      dataValidation: {
        condition: { type, values: values.map((userEnteredValue) => ({ userEnteredValue })) },
      },
    };
    expect(() => validateCell(cell, 'subuh', 'J9')).not.toThrow();
    expect(() => validateCell(cell, 'subuh', 'J9', { kind: 'number', value: yes })).not.toThrow();
    expect(() => validateCell(cell, 'subuh', 'J9', { kind: 'number', value: no })).toThrow(
      /di luar aturan/
    );
  });
  it.each([
    '=ISNUMBER(J14)',
    '=AND(ISNUMBER(J14),J14>=0,MOD(J14,1)=0)',
    '=AND(INT(J14)=J14,J14>=0)',
  ])('memahami rumus angka terbatas %s tanpa eval', (formula) => {
    const cell = {
      dataValidation: {
        condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
      },
    };
    expect(() => validateCell(cell, 'rawatib', 'J14', { kind: 'number', value: 2 })).not.toThrow();
    expect(() => validateCell(cell, 'rawatib', 'J14', { kind: 'number', value: 0.5 })).toThrow();
  });
  it('tidak mengubah batas domain, mengabaikan rumus lintas sel, atau menerima angka dari teks', () => {
    expect(() => validateCell({}, 'subuh', 'J9', { kind: 'number', value: 4 })).toThrow();
    for (const formula of ['=ISNUMBER(K9)', '=TRUE', '=IMPORTXML("https://example.com","x")'])
      expect(() =>
        validateCell(
          {
            dataValidation: {
              condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
            },
          },
          'subuh',
          'J9'
        )
      ).toThrow();
    expect(() =>
      validateCell(
        {
          dataValidation: {
            condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: '3 - baik' }] },
          },
        },
        'subuh',
        'J9'
      )
    ).toThrow();
  });
  it('mendeteksi aturan yang tidak punya nilai kompatibel, termasuk rawatib pecahan', () => {
    for (const [type, values] of [
      ['NUMBER_GREATER', ['3']],
      ['NUMBER_BETWEEN', ['0.1', '0.9']],
      ['NUMBER_GREATER_THAN_EQ', ['=Z1']],
    ] as const) {
      expect(() =>
        validateCell(
          {
            dataValidation: {
              condition: { type, values: values.map((userEnteredValue) => ({ userEnteredValue })) },
            },
          },
          'subuh',
          'J9'
        )
      ).toThrow();
    }
  });
  it('tidak mengubah checkbox khusus menjadi boolean dengan tebakan', () => {
    expect(() =>
      validateCell({ dataValidation: { condition: { type: 'BOOLEAN' } } }, 'dhuha', 'J19', {
        kind: 'boolean',
        value: true,
      })
    ).not.toThrow();
    expect(() =>
      validateCell(
        {
          dataValidation: {
            condition: {
              type: 'BOOLEAN',
              values: [{ userEnteredValue: 'yes' }, { userEnteredValue: 'no' }],
            },
          },
        },
        'dhuha',
        'J19'
      )
    ).toThrow();
  });
  it('membatasi pilihan rentang pada file yang sama dan maksimal 100 sel', () => {
    const workbook = Workbook.parse({
      sheets: [
        {
          properties: {
            sheetId: 1,
            title: 'Synthetic',
            gridProperties: { rowCount: 1000, columnCount: 100 },
          },
        },
      ],
    });
    const sheet = workbook.sheets[0]!;
    expect(choiceRange('$A$1:$A$4', workbook, sheet).a1).toBe("'Synthetic'!A1:A4");
    for (const ref of [
      'A:A',
      'A1:A101',
      'Other!A1:A4',
      '[remote]Synthetic!A1:A4',
      'https://example.com',
      'A4:A1',
    ])
      expect(() => choiceRange(ref, workbook, sheet)).toThrow();
  });
});
