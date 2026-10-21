import { describe, expect, it } from 'vitest';
import type { ActivityId } from '@sdj/domain';
import type { GoogleCell } from '../../packages/infrastructure/src/sheet-profile.js';
import {
  normalizedValue,
  planCell,
  canonicalRuleMatches,
} from '../../packages/infrastructure/src/sheet-normalization.js';
import { standardValidation } from '../../packages/infrastructure/src/sheet-validation.js';

describe('Normalisasi deterministik seluruh jenis input', () => {
  it.each([
    ['tilawah', { numberValue: 0 }, 'id_ID', { kind: 'number', value: 0 }],
    ['tilawah', { numberValue: 2.5 }, 'id_ID', { kind: 'number', value: 2.5 }],
    ['tilawah', { boolValue: true }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { boolValue: false }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { stringValue: ' 2,5 ' }, 'id_ID', { kind: 'number', value: 2.5 }],
    ['tilawah', { stringValue: '2.5' }, 'en_US', { kind: 'number', value: 2.5 }],
    ['tilawah', { stringValue: '2.5' }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { stringValue: '1,000.00' }, 'en_US', { kind: 'blank' }],
    ['tilawah', { stringValue: '2 halaman' }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { stringValue: '=2+2' }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { stringValue: '1e2' }, 'en_US', { kind: 'blank' }],
    ['tilawah', { numberValue: -1 }, 'id_ID', { kind: 'blank' }],
    ['tilawah', { numberValue: 101 }, 'id_ID', { kind: 'blank' }],
    ['subuh', { numberValue: 4 }, 'id_ID', { kind: 'blank' }],
    ['subuh', { numberValue: 2.5 }, 'id_ID', { kind: 'blank' }],
    ['subuh', { stringValue: '3' }, 'id_ID', { kind: 'number', value: 3 }],
    ['rawatib', { numberValue: 0.5 }, 'id_ID', { kind: 'blank' }],
    ['rawatib', { numberValue: 9007199254740992 }, 'id_ID', { kind: 'blank' }],
    ['matsurat_petang', { boolValue: false }, 'id_ID', { kind: 'boolean', value: false }],
    ['matsurat_petang', { boolValue: true }, 'id_ID', { kind: 'boolean', value: true }],
    ['matsurat_petang', { stringValue: ' true ' }, 'id_ID', { kind: 'boolean', value: true }],
    ['matsurat_petang', { stringValue: 'FALSE' }, 'id_ID', { kind: 'boolean', value: false }],
    ['matsurat_petang', { numberValue: 0 }, 'id_ID', { kind: 'boolean', value: false }],
    ['matsurat_petang', { numberValue: 1 }, 'id_ID', { kind: 'boolean', value: true }],
    ['matsurat_petang', { stringValue: '0' }, 'id_ID', { kind: 'boolean', value: false }],
    ['matsurat_petang', { stringValue: '1' }, 'id_ID', { kind: 'boolean', value: true }],
    ['matsurat_petang', { numberValue: 2 }, 'id_ID', { kind: 'blank' }],
    ['matsurat_petang', { stringValue: 'tidak jelas' }, 'id_ID', { kind: 'blank' }],
    ['matsurat_petang', {}, 'id_ID', { kind: 'blank' }],
  ] satisfies [ActivityId, GoogleCell['userEnteredValue'], string, unknown][])(
    '%s %j dalam %s',
    (id, value, locale, expected) => {
      expect(
        normalizedValue({ ...(value ? { userEnteredValue: value } : {}) }, id, locale)
      ).toEqual(expected);
    }
  );
  it.each([
    ['ya', true],
    ['tidak', false],
  ] as const)('mengikuti pasangan checkbox eksplisit %s', (text, expected) => {
    expect(
      normalizedValue(
        {
          userEnteredValue: { stringValue: text },
          dataValidation: {
            condition: {
              type: 'BOOLEAN',
              values: [{ userEnteredValue: 'ya' }, { userEnteredValue: 'tidak' }],
            },
          },
        },
        'matsurat_petang',
        'id_ID'
      )
    ).toEqual({ kind: 'boolean', value: expected });
  });
  it('mencadangkan rumus asli dan menggunakan hasil bertipe tanpa mengeksekusi teks', () => {
    const cell = {
      userEnteredValue: { formulaValue: '=1+1' },
      effectiveValue: { numberValue: 2 },
      dataValidation: standardValidation('tilawah', 'J15'),
      note: 'Milik peserta',
    };
    const plan = planCell(cell, 'tilawah', 14, 9, 'J15', 'id_ID', 'run', 'fingerprint', 7)!;
    expect(plan.before.value).toEqual({ formulaValue: '=1+1' });
    expect(plan.before.note).toBe('Milik peserta');
    expect(plan.after).toEqual({ kind: 'number', value: 2 });
    expect(plan.reason).toBe('convert');
    expect(
      normalizedValue(
        {
          userEnteredValue: { formulaValue: '=1/0' },
          effectiveValue: { errorValue: { type: 'DIVIDE_BY_ZERO' } },
        },
        'tilawah',
        'id_ID'
      )
    ).toEqual({ kind: 'blank' });
  });
  it('mengganti aturan kompatibel yang lebih sempit dan melengkapi aturan yang hilang', () => {
    expect(
      canonicalRuleMatches(
        {
          dataValidation: {
            condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: '0' }] },
            strict: true,
          },
        },
        'subuh',
        'J9'
      )
    ).toBe(false);
    expect(canonicalRuleMatches({}, 'tilawah', 'J15')).toBe(false);
    expect(
      planCell(
        { userEnteredValue: { numberValue: 0 }, dataValidation: standardValidation('subuh', 'J9') },
        'subuh',
        8,
        9,
        'J9',
        'id_ID',
        'run',
        'fp',
        7
      )
    ).toBeNull();
  });
  it('tidak menebak pasangan checkbox duplikat dan menganggap objek nilai kosong sebagai blank', () => {
    const ambiguous = {
      userEnteredValue: { stringValue: 'ya' },
      dataValidation: {
        condition: {
          type: 'BOOLEAN',
          values: [{ userEnteredValue: 'ya' }, { userEnteredValue: 'ya' }],
        },
      },
    };
    expect(normalizedValue(ambiguous, 'matsurat_petang', 'id_ID')).toEqual({ kind: 'blank' });
    expect(
      planCell(
        { userEnteredValue: {}, dataValidation: standardValidation('tilawah', 'J15') },
        'tilawah',
        14,
        9,
        'J15',
        'id_ID',
        'run',
        'fp',
        7
      )
    ).toBeNull();
  });
});
