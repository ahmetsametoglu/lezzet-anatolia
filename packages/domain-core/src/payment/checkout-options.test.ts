import { describe, expect, it } from 'vitest';
import { resolveCheckoutOptions, type CheckoutOptionsInput } from './checkout-options';

const TAVAN = 15_000; // 150 € kapıda ödeme tavanı
// Varsayılan kanal `b2b`: bu dosyanın çoğu vade/tavan davranışını sınıyor ve vade zaten işletme
// yetkisidir. Kanalın KENDİ kuralı ayrı bir bölümde, iki kanal karşılaştırılarak sınanır.
const base = (over: Partial<CheckoutOptionsInput> = {}): CheckoutOptionsInput => ({
  orderTotalCents: 5000,
  channel: 'b2b',
  deliveryType: 'route',
  codMaxCents: TAVAN,
  ...over,
});

describe('kapıda ödeme (03.8)', () => {
  it('rota içi, tavan altı, izinli müşteri → nakit/kart/çek açık', () => {
    const r = resolveCheckoutOptions(base());
    expect(r.methods).toEqual(['online', 'bank_transfer', 'cash', 'card', 'cheque']);
    expect(r.codBlockedReason).toBeNull();
  });

  it('kargoda kapıda ödeme yok — peşin', () => {
    const r = resolveCheckoutOptions(base({ deliveryType: 'shipping' }));
    expect(r.methods).toEqual(['online', 'bank_transfer']);
    expect(r.codBlockedReason).toBe('shipping');
  });

  it('tavan aşılırsa kapıda ödeme kapanır ("hepsini alıp kapıda öderim" kesilir)', () => {
    expect(resolveCheckoutOptions(base({ orderTotalCents: TAVAN + 1 })).codBlockedReason).toBe('over_limit');
    expect(resolveCheckoutOptions(base({ orderTotalCents: TAVAN })).codBlockedReason).toBeNull(); // tam tavan geçer
  });

  it('müşteri bazlı kapı (cod_allowed=false) tavandan bağımsız keser', () => {
    expect(resolveCheckoutOptions(base({ codAllowed: false })).codBlockedReason).toBe('customer_blocked');
  });

  it('nakit yasal sınırı UYARIR ama engellemez', () => {
    const r = resolveCheckoutOptions(base({ orderTotalCents: 120_000, codMaxCents: 200_000, cashLegalLimitCents: 100_000 }));
    expect(r.cashWarning).toBe(true);
    expect(r.methods).toContain('cash'); // engel yok — karar sahada
  });
});

describe('ertelenmiş tahsilat yalnız işletmeye (kullanıcı kararı 04.08)', () => {
  it('bireysel müşteride havale YOK — kart ve kapıda ödeme açık kalır', () => {
    const r = resolveCheckoutOptions(base({ channel: 'b2c' }));
    expect(r.methods).toEqual(['online', 'cash', 'card']);
    expect(r.codBlockedReason).toBeNull(); // kapıda ödeme kapanmıyor, yalnız havale/çek düşüyor
  });

  it('bireysel müşteride çek YOK — kapıda ödeme açık olsa bile', () => {
    // Ayrımın kendisi: çek kapıda ALINIR ama karşılığı sonra tahsil edilir. Nakit/kartla aynı
    // kovaya konsaydı "kapıda ödeme açık" kararı sessizce bir vade kararına dönerdi.
    const r = resolveCheckoutOptions(base({ channel: 'b2c' }));
    expect(r.methods).toContain('cash');
    expect(r.methods).not.toContain('cheque');
  });

  it('kargoda bireysel müşteriye YALNIZ kart kalır', () => {
    const r = resolveCheckoutOptions(base({ channel: 'b2c', deliveryType: 'shipping' }));
    expect(r.methods).toEqual(['online']);
  });

  it('aynı sipariş işletmede havale ve çeki açar — fark yalnız kanal', () => {
    const b2c = resolveCheckoutOptions(base({ channel: 'b2c' }));
    const b2b = resolveCheckoutOptions(base({ channel: 'b2b' }));
    expect(b2b.methods.filter((m) => !b2c.methods.includes(m))).toEqual(['bank_transfer', 'cheque']);
  });
});

describe('vade / hesaba (03.7)', () => {
  it('varsayılan kapalı — credit_enabled olmadan vade yok', () => {
    const r = resolveCheckoutOptions(base());
    expect(r.creditAvailable).toBe(false);
    expect(r.creditBlockedReason).toBe('not_enabled');
  });

  it('limit içinde otomatik açılır — B2B hızı bozulmaz', () => {
    const r = resolveCheckoutOptions(base({ creditEnabled: true, creditLimitCents: 100_000, openBalanceCents: 20_000 }));
    expect(r.creditAvailable).toBe(true);
    expect(r.creditRequiresApproval).toBe(false);
  });

  it('limit aşımı REDDETMEZ, admin onayına düşer', () => {
    const r = resolveCheckoutOptions(base({ orderTotalCents: 90_000, creditEnabled: true, creditLimitCents: 100_000, openBalanceCents: 20_000 }));
    expect(r.creditAvailable).toBe(false);
    expect(r.creditBlockedReason).toBe('limit_exceeded');
    expect(r.creditRequiresApproval).toBe(true);
  });

  it('gecikmiş sipariş varsa vade kapanır — peşin yollar açık kalır', () => {
    const r = resolveCheckoutOptions(base({ creditEnabled: true, creditLimitCents: 999_999, hasOverdue: true }));
    expect(r.creditBlockedReason).toBe('overdue');
    expect(r.creditRequiresApproval).toBe(false); // gecikmede onay yolu da yok
    expect(r.methods).toContain('online');
  });

  it('vade bir ödeme YÖNTEMİ değildir — methods listesine girmez', () => {
    const r = resolveCheckoutOptions(base({ creditEnabled: true, creditLimitCents: 999_999 }));
    expect(r.creditAvailable).toBe(true);
    expect(r.methods).not.toContain('on_account' as never);
  });
});

describe('iki fren birlikte', () => {
  it('büyük vadeli sipariş: kapıda kapalı (tavan), vade admin onayında, online açık', () => {
    const r = resolveCheckoutOptions(base({ orderTotalCents: 300_000, creditEnabled: true, creditLimitCents: 100_000 }));
    expect(r.codBlockedReason).toBe('over_limit');
    expect(r.creditRequiresApproval).toBe(true);
    expect(r.methods).toEqual(['online', 'bank_transfer']);
  });
});
