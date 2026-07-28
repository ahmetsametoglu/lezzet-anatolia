import { describe, expect, it } from 'vitest';
import { OFFER_DISCOUNT_PERCENT, needsExpiryAttention, offerDecisionOf, suggestedOfferPriceCents } from './offer';

// Sabit "bugün" — gerçek saate bağlı test, ertesi gün kendiliğinden kırılır.
const NOW = new Date('2026-07-28T10:00:00Z');
/** NOW'a göre gün ekler — okunur senaryolar için. */
const inDays = (d: number): string => new Date(Date.UTC(2026, 6, 28 + d)).toISOString().slice(0, 10);

describe('suggestedOfferPriceCents', () => {
  it('varsayılan %30 indirimi uygular', () => {
    expect(suggestedOfferPriceCents(1800)).toBe(1260);
    expect(OFFER_DISCOUNT_PERCENT).toBe(30);
  });

  it('yüzde parametriktir', () => {
    expect(suggestedOfferPriceCents(2000, 25)).toBe(1500);
  });

  it('AŞAĞI yuvarlar — önerilenden azını vermiş olmayalım', () => {
    // 1799 − %30 (539) = 1260 tam; 1795 − 538 = 1257 (kuruş aşağı kalır)
    expect(suggestedOfferPriceCents(1795, 30)).toBe(1257);
  });

  it('liste fiyatı yoksa öneri de YOKTUR (uydurma taban yok)', () => {
    expect(suggestedOfferPriceCents(null)).toBeNull();
    expect(suggestedOfferPriceCents(undefined)).toBeNull();
    expect(suggestedOfferPriceCents(0)).toBeNull();
  });
});

describe('offerDecisionOf', () => {
  const base = { dateType: 'DLC' as const, shelfLifeDays: 20, offerPriceCents: null, now: NOW };

  it('ömrü yeterli partide karar beklenmez', () => {
    const r = offerDecisionOf({ ...base, expiryDate: inDays(18) }); // %90
    expect(r.decision).toBe('none');
    expect(r.flag).toBe('ok');
    expect(needsExpiryAttention(r.decision)).toBe(false);
  });

  it('yaklaşan tarihli parti teklife açılabilir', () => {
    const r = offerDecisionOf({ ...base, expiryDate: inDays(3) }); // %15 ≤ %25
    expect(r.decision).toBe('can_offer');
    expect(r.remainingPercent).toBeCloseTo(15);
  });

  it('DDM geçmiş parti satılabilir → yine teklif yolu', () => {
    const r = offerDecisionOf({ ...base, dateType: 'DDM', expiryDate: inDays(-2) });
    expect(r.flag).toBe('expired_sellable');
    expect(r.decision).toBe('can_offer');
  });

  it('DLC geçmiş parti yalnız imha — teklif AÇIK olsa bile', () => {
    const r = offerDecisionOf({ ...base, expiryDate: inDays(-1), offerPriceCents: 1260 });
    // Güvenlik kuralı teklifi ezer: "indirimli satılıyor" görünmesi kuralı sessizce delerdi.
    expect(r.decision).toBe('must_discard');
  });

  it('açık teklif izlenir, yeniden önerilmez', () => {
    const r = offerDecisionOf({ ...base, expiryDate: inDays(3), offerPriceCents: 1260 });
    expect(r.decision).toBe('offer_open');
    expect(needsExpiryAttention(r.decision)).toBe(true);
  });

  it('raf ömrü girilmemişse eşik kararı verilmez (yanlış alarm yok)', () => {
    const r = offerDecisionOf({ ...base, shelfLifeDays: null, expiryDate: inDays(1) });
    expect(r.decision).toBe('none');
    expect(r.remainingPercent).toBeNull();
  });

  it('eşik parametriktir', () => {
    const r = offerDecisionOf({ ...base, expiryDate: inDays(8), nearExpiryPercent: 50 }); // %40 ≤ %50
    expect(r.decision).toBe('can_offer');
  });
});
