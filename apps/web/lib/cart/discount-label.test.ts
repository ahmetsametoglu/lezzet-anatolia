import { describe, expect, it } from 'vitest';
import type { LocalizedText } from '@lezzet/types';
import { discountLabel } from './discount-label';
import type { CartDiscount } from './cart-types';

/**
 * İndirim satırının etiketi (05.13) — "neden bu para düştü" sorusunun cevabı.
 *
 * Sınanan şey bir YEDEK ZİNCİRİ: kampanyanın müşteriye görünen adı varsa o yazılır; yoksa kuponun
 * kodu; o da yoksa türün kendisi. Zincir olmadan iki uç davranış doğuyordu — ya satır yalnız
 * "İndirim" diyordu (müşteri neyin indiğini bilmiyordu, 29.07 bildirimi), ya da ad eklenince kupon
 * kodunu gösteren eski hâl sessizce kaybolacaktı.
 *
 * DB'ye vurmaz; entegrasyon kökünde durmasının tek sebebi dizin kuralıdır (`vitest.config.ts`).
 */
const t = {
  discount: 'İndirim',
  discountCampaign: 'kampanya',
  discountCampaignPercent: 'kampanya %{percent}',
  discountCustomerRate: 'size özel %{percent}',
};

const withLabel = (label: LocalizedText | null): CartDiscount => ({
  status: 'automatic',
  reason: { kind: 'campaign', percent: 15 },
  amountCents: 300,
  lineShares: [300],
  discountId: 'd1',
  label,
});

describe('discountLabel', () => {
  it('kampanyanın adı varsa ONU yazar — sepette gösterilen dilde', () => {
    const discount = withLabel({ tr: 'Hoş geldin indirimi', fr: 'Offre de bienvenue', de: 'Willkommensrabatt' });

    expect(discountLabel(discount, t, 'fr')).toBe('İndirim — Offre de bienvenue');
    expect(discountLabel(discount, t, 'tr')).toBe('İndirim — Hoş geldin indirimi');
  });

  it('istenen dil boşsa yedek zincirine düşer, satırı BOŞ bırakmaz', () => {
    // Operatör yalnız Türkçesini yazmış olabilir; Alman müşteriye boş bir tire gösterilemez.
    expect(discountLabel(withLabel({ tr: 'Bayram indirimi' }), t, 'de')).toBe('İndirim — Bayram indirimi');
  });

  it('ad verilmemişse TÜR konuşur — eski davranış korunur', () => {
    expect(discountLabel(withLabel(null), t, 'fr')).toBe('İndirim — kampanya %15');
  });

  it('boş dilli ad artığı, ad SAYILMAZ', () => {
    // Form dokunulup silinen dili `''` olarak gönderebilir. "Ad var" sanılırsa satır "İndirim — " olurdu.
    expect(discountLabel(withLabel({ tr: '', fr: '  ' }), t, 'fr')).toBe('İndirim — kampanya %15');
  });

  it('kuponda ad varsa koda TERCİH edilir — ad daha çok şey söyler', () => {
    const coupon: CartDiscount = {
      status: 'applied',
      source: 'coupon',
      code: 'HOSGELDIN10',
      codeId: 'dc1',
      amountCents: 300,
      lineShares: [300],
      discountId: 'd1',
      label: { fr: 'Offre de bienvenue' },
    };

    expect(discountLabel(coupon, t, 'fr')).toBe('İndirim — Offre de bienvenue');
    // Adsız kuponda tasarımdaki asıl hâl: kodun kendisi.
    expect(discountLabel({ ...coupon, label: null }, t, 'fr')).toBe('İndirim — HOSGELDIN10');
  });

  it('dil verilmezse ad ATLANIR — yanlış dilde basmaktansa hiç basmaz', () => {
    expect(discountLabel(withLabel({ fr: 'Offre de bienvenue' }), t)).toBe('İndirim — kampanya %15');
  });

  it('müşterinin kendi oranında ad YOKTUR — ortada kampanya yok', () => {
    const rate: CartDiscount = {
      status: 'automatic',
      reason: { kind: 'customer_rate', percent: 8 },
      amountCents: 800,
      lineShares: [800],
      discountId: null,
      label: null,
    };

    expect(discountLabel(rate, t, 'tr')).toBe('İndirim — size özel %8');
  });

  it('reddedilen kupon sepette indirim BIRAKMADIYSA satır genel adında kalır', () => {
    const rejected: CartDiscount = { status: 'rejected', reason: 'expired', code: 'RAMAZAN20', appliedInsteadCents: 0, appliedInstead: null };

    expect(discountLabel(rejected, t, 'fr')).toBe('İndirim');
  });

  /**
   * Kullanıcı geri bildirimi (29.07): sepette "İndirim — Baklava haftası" yazarken müşteri bir
   * kupon deniyor, kupon kaybediyor ve satır "İndirim"e düşüyordu. Para değişmedi, yalnız adı
   * kayboldu — aynı indirim iki farklı ad. Kuponun reddi, sepetteki indirimin kimliğini silmez.
   */
  it('kupon kaybettiğinde sepetteki indirimin ADI korunur', () => {
    const rejected: CartDiscount = {
      status: 'rejected',
      reason: 'outranked',
      code: 'ILK5',
      appliedInsteadCents: 536,
      appliedInstead: { reason: { kind: 'campaign', percent: null }, label: { tr: 'Baklava haftası', fr: 'Semaine du baklava' } },
    };

    expect(discountLabel(rejected, t, 'tr')).toBe('İndirim — Baklava haftası');
    expect(discountLabel(rejected, t, 'fr')).toBe('İndirim — Semaine du baklava');
  });

  it('adı olmayan kampanya kaybeden kuponun ardından da SEBEBİNİ söyler', () => {
    const rejected: CartDiscount = {
      status: 'rejected',
      reason: 'outranked',
      code: 'ILK5',
      appliedInsteadCents: 800,
      appliedInstead: { reason: { kind: 'campaign', percent: 8 }, label: null },
    };

    expect(discountLabel(rejected, t, 'tr')).toBe('İndirim — kampanya %8');
  });
});
