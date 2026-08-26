import { describe, expect, it } from 'vitest';
import { dbNumeric, dbNumericNullable } from './db-numeric';

/**
 * **PostgreSQL `numeric` sürücüden STRING gelebilir** ve bu iki satır, para taşıyan her şemanın
 * altında duruyor. Çevrim burada olmasaydı `'12.50' * 2` hesabı `'12.5012.50'` üretirdi — ve
 * hiçbir tip hatası vermezdi, çünkü şema `unknown` değil `string` görürdü.
 */
describe('dbNumeric — sürücünün metnini sayıya indirir', () => {
  it('string de sayı da kabul edilir, ikisi de SAYI döner', () => {
    expect(dbNumeric.parse('12.50')).toBe(12.5);
    expect(dbNumeric.parse(12.5)).toBe(12.5);
    expect(dbNumeric.parse('0')).toBe(0);
  });

  it('nullable olan `null`u KORUR — sıfıra düşürmez', () => {
    expect(dbNumericNullable.parse(null)).toBeNull();
    expect(dbNumericNullable.parse('7.9')).toBe(7.9);
  });
});
