import { formatPrice } from '@lezzet/helper';
import { campaignValueOf, cardBadgeOf, type CampaignView } from './campaign-label';

/**
 * KARTIN İNDİRİM ROZETİ VE KAMPANYA CÜMLESİ (21.100 · MB-22b).
 *
 * **Bu dosyanın koruduğu şey bir metin değil, ÜÇ SESSİZ SÖZ.** Üçü de bozulduğunda ekran yine bir
 * rozet çizer — yalnız yanlışını, ya da tutulmayacak olanını:
 *
 *   1. **Fırsat kampanyayı yener.** Ters çevrilirse kart, birim fiyatta gerçekten düşmüş bir
 *      indirimin yerine sepete bağlı bir vaadi yazar.
 *   2. **Eşikli kampanya rozete GİRMEZ.** Eşik yutulup yalnız *"−%15"* yazılırsa müşteri koşulu
 *      ancak sepete gelince öğrenir — düzeltmeye çalıştığımız sessizliğin ta kendisi.
 *   3. **Değeri olmayan kampanya hiç konuşmaz.** *"%0 indirim"* diye bir şey yoktur.
 *
 * Üçü de `undefined`/yanlış metinle biter, hiçbiri hata vermez.
 */
const t = {
  offer: 'Fırsat',
  campaign: { percent: '%{n} indirim', amount: '{amount} indirim' },
};

function campaign(over: Partial<CampaignView> = {}): CampaignView {
  return { label: null, percent: 15, amountCents: null, minBasketCents: null, ...over };
}

/**
 * Para BEKLENTİSİ elle yazılmaz, `formatPrice`ten kurulur — ve bu bir kolaycılık değil.
 *
 * `Intl.NumberFormat` tutar ile simge arasına DAR BOŞLUKSUZ BOŞLUK (U+00A0) koyuyor; elle yazılan
 * `"3,00 €"` ekranda birebir aynı görünür ve test *"Expected: 3,00 € · Received: 3,00 €"* diye
 * anlaşılmaz biçimde düşer (ölçüldü 24.08, dört iddia birden). Daha kötüsü: boşluğu kopyalayıp
 * çivilemek, Node sürümüyle değişebilen bir ICU ayrıntısını sözleşme sanmak olurdu.
 *
 * Testin konusu zaten para biçimi DEĞİL, kalıbın kuruluşu: eşik söyleniyor mu, yüzde tutarı yeniyor
 * mu, hangi metin hangi yere giriyor. Biçimlemenin kendisi `@lezzet/helper`in kendi testinin işi.
 */
const para = (cents: number, locale: 'tr' | 'fr' | 'de'): string => formatPrice(cents, locale);

describe('cardBadgeOf', () => {
  it('koşulsuz yüzde kampanyası NE OLDUĞUNU söyleyen bir rozete döner', () => {
    // Çıplak "%15" değil: kullanıcının şikâyeti "ifade metinlerin arasında kayboluyor"du.
    expect(cardBadgeOf({ campaign: campaign() }, t, 'tr')).toBe('%15 indirim');
  });

  it('koşulsuz sabit tutar kampanyası müşterinin dilinde biçimlenir', () => {
    expect(cardBadgeOf({ campaign: campaign({ percent: null, amountCents: 300 }) }, t, 'tr')).toBe(`${para(300, 'tr')} indirim`);
  });

  it('FIRSAT KAMPANYAYI YENER — kesin indirim, koşullu olanın önüne geçer', () => {
    // Sunucu bunu zaten uyguluyor (`toProduct` teklif kazanınca `campaign` göndermiyor); burası o
    // güvencenin ekran karşılığı. İkisi birden geldiğinde bile kart doğru olanı yazmalı.
    expect(cardBadgeOf({ wasCents: 1500, campaign: campaign() }, t, 'tr')).toBe('Fırsat');
  });

  it('EŞİKLİ kampanya rozet ÇIKARMAZ — eşiği yutan bir rozet tutulmayan bir sözdür', () => {
    expect(cardBadgeOf({ campaign: campaign({ minBasketCents: 6000 }) }, t, 'tr')).toBeUndefined();
    expect(cardBadgeOf({ campaign: campaign({ percent: null, amountCents: 300, minBasketCents: 6000 }) }, t, 'tr')).toBeUndefined();
  });

  it('kampanyası olmayan ürün rozetsizdir', () => {
    expect(cardBadgeOf({}, t, 'tr')).toBeUndefined();
  });

  it('DEĞERİ OLMAYAN kampanya konuşmaz — "%0 indirim" diye bir şey yok', () => {
    expect(cardBadgeOf({ campaign: campaign({ percent: null, amountCents: null }) }, t, 'tr')).toBeUndefined();
  });

  it('`wasCents: 0` de bir fırsattır — varlık sınanır, doğruluk değil', () => {
    // `if (product.wasCents)` diye yazılsaydı sıfır eski fiyat sessizce fırsat olmaktan çıkardı.
    expect(cardBadgeOf({ wasCents: 0 }, t, 'tr')).toBe('Fırsat');
  });
});

/**
 * Kampanyanın TAM cümlesi — rozetin sığdıramadığı yerde, kesit başlığında.
 *
 * Rozetle aynı verinin başka sorusu: rozet *"söylenebilir mi"* diye sorar ve eşikliyi eler; cümle
 * *"tam olarak ne"* diye sorar ve eşiği SÖYLEMEK zorundadır.
 */
const cumle = { percent: '−%{n}', amount: '−{amount}', withMinimum: '{minimum} üzeri {value}' };

describe('campaignValueOf', () => {
  it('koşulsuz yüzde', () => {
    expect(campaignValueOf(campaign(), cumle, 'tr')).toBe('−%15');
  });

  it('koşulsuz sabit tutar', () => {
    expect(campaignValueOf(campaign({ percent: null, amountCents: 300 }), cumle, 'tr')).toBe(`−${para(300, 'tr')}`);
  });

  it('EŞİK SÖYLENİR — "60 € üzeri −%15" ile "−%15" aynı vaat değildir', () => {
    expect(campaignValueOf(campaign({ minBasketCents: 6000 }), cumle, 'tr')).toBe(`${para(6000, 'tr')} üzeri −%15`);
  });

  it('yüzde ve tutar birlikteyse YÜZDE kazanır — kalıp tek olmalı', () => {
    expect(campaignValueOf(campaign({ percent: 15, amountCents: 300 }), cumle, 'tr')).toBe('−%15');
  });

  it('değeri olmayan kampanya `null` döner — eşiği olsa bile', () => {
    // Eşik tek başına söylenecek bir şey değildir: "60 € üzeri" cümlesinin öznesi yok.
    expect(campaignValueOf(campaign({ percent: null, amountCents: null, minBasketCents: 6000 }), cumle, 'tr')).toBeNull();
  });

  it('para müşterinin diline göre biçimlenir — locale kalıba TAŞINIYOR', () => {
    // Asıl sınanan: `campaignValueOf` aldığı locale'i `formatPrice`e gerçekten geçiriyor mu. Sabit
    // bir dile çakılsaydı Fransız müşteri Türkçe biçimlenmiş bir tutar görürdü.
    expect(campaignValueOf(campaign({ percent: null, amountCents: 300 }), cumle, 'de')).toBe(`−${para(300, 'de')}`);
    expect(campaignValueOf(campaign({ percent: null, amountCents: 300 }), cumle, 'fr')).toBe(`−${para(300, 'fr')}`);
  });
});
