import { describe, expect, it } from 'vitest';
import { errorMessageOf } from './error-message';

/**
 * Hata mesajı normalize edici (09.08 · harici MCP denetiminin bulgusu).
 *
 * Sınanan iddia tek cümle: **hiçbir hata `[object Object]`e dönüşemez.** Bu, teşhisin kendisini
 * kaybettiren sınıftı — MCP aracı modele "Araç hatası: [object Object]" diyor, web operatöre
 * "Beklenmeyen bir hata oluştu" diyordu; oysa veritabanı sebebi tam olarak söylüyordu.
 */
describe('errorMessageOf', () => {
  it('Error örneğinin mesajını verir', () => {
    expect(errorMessageOf(new Error('kapı kapalı'))).toBe('kapı kapalı');
  });

  it('SUPABASE hatasını okur — Error DEĞİL, düz nesne (asıl bulgu)', () => {
    const postgrest = {
      message: 'invalid input syntax for type uuid: "gecersiz"',
      code: '22P02',
      details: null,
      hint: null,
    };
    const out = errorMessageOf(postgrest);
    expect(out).toContain('invalid input syntax');
    expect(out).toContain('22P02'); // kod mesajın yanında: teşhis tek satırda bitsin
    expect(out).not.toContain('[object Object]');
  });

  it('ipucu varsa taşır — PostgREST’in en işe yarayan alanı', () => {
    expect(errorMessageOf({ message: 'kolon yok', code: '42703', hint: 'belki "name" demek istediniz' })).toContain(
      'belki "name"',
    );
  });

  it('şekli bilinmeyen nesneyi OLDUĞU GİBİ yazar (asla [object Object])', () => {
    const out = errorMessageOf({ weird: true, nested: { a: 1 } });
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('weird');
  });

  it('dizgi ve null gibi ilkel değerleri bozmadan geçirir', () => {
    expect(errorMessageOf('düz metin hata')).toBe('düz metin hata');
    expect(errorMessageOf(null)).toBe('null');
  });
});
