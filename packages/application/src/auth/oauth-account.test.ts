import { describe, expect, it } from 'vitest';
import { isFreshSignUp } from './oauth-account';

/*
  "BU GİRİŞTE DOĞDU" ölçütü — silmenin tek kapısı, bu yüzden sınırları ayrı ölçülür. Veritabanı yolu (silme,
  personelin korunması, sahipsiz kalan profil) mobil API'nin uç testinde: `apps/mobile-api/src/api/v1/auth-oauth.test.ts`.
*/

const T0 = '2026-09-14T15:00:00.000Z';
const after = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();

describe('isFreshSignUp', () => {
  it('açılışla aynı saniyelerdeki ilk giriş YENİ hesaptır — Google hesabı girişin kendisinde doğar', () => {
    expect(isFreshSignUp(T0, after(350))).toBe(true);
  });

  it('dakikalar önce açılmış hesabın bugünkü girişi yeni DEĞİL — müşteri uygulamasında kaydolmuş kişi silinmez', () => {
    expect(isFreshSignUp(T0, after(5 * 60_000))).toBe(false);
  });

  it('pencere sınırı dahildir, bir milisaniye ötesi değildir', () => {
    expect(isFreshSignUp(T0, after(10_000))).toBe(true);
    expect(isFreshSignUp(T0, after(10_001))).toBe(false);
  });

  it('son giriş damgası yoksa ya da okunamıyorsa hesaba DOKUNULMAZ', () => {
    expect(isFreshSignUp(T0, null)).toBe(false);
    expect(isFreshSignUp(T0, undefined)).toBe(false);
    expect(isFreshSignUp(T0, 'damga-değil')).toBe(false);
  });
});
