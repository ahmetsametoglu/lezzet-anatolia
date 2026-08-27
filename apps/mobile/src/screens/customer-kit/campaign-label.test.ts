import { formatPrice } from '@lezzet/helper';
import { campaignValueOf, cardBadgeOf, scopeBadgeOf, type CampaignView } from './campaign-label';

/**
 * İNDİRİM ROZETLERİ VE KAMPANYA CÜMLESİ (21.100 · MB-22b · 27.08 katman düzeltmesi).
 *
 * **Bu dosyanın koruduğu şey bir metin değil, DÖRT SESSİZ SÖZ.** Dördü de bozulduğunda ekran yine
 * bir rozet çizer — yalnız yanlışını, ya da tutulmayacak olanını:
 *
 *   1. **Kampanya ÜRÜN kartına girmez, KESİT kartına girer** (kullanıcı kararı 27.08). Ters
 *      çevrilirse sepete bir kez inen indirim ürün başına vaat gibi okunur: motor sabit tutarı
 *      `Math.min(amountCents, scopeBase)` ile sepete BİR KEZ indiriyor ve tek kazanan seçiyor,
 *      yani rozeti gören müşteri üç ürün alsa 9 € değil 3 € indirim alır.
 *   2. **Fırsat kalır.** Birim fiyatta gerçekten düşen, sepete bağlı olmayan tek indirim odur.
 *   3. **Eşikli kampanya rozete GİRMEZ.** Eşik yutulup yalnız *"−%15"* yazılırsa müşteri koşulu
 *      ancak sepete gelince öğrenir — düzeltmeye çalıştığımız sessizliğin ta kendisi.
 *   4. **Değeri olmayan kampanya hiç konuşmaz.** *"%0 indirim"* diye bir şey yoktur.
 *
 * Dördü de `undefined`/yanlış metinle biter, hiçbiri hata vermez.
 */
const t = {
  offer: 'Fırsat',
};

/** Kesit rozetinin sözlüğü — cümleyle AYNI kalıplar (rozet cümlenin kısa hâlidir). */
const tc = { percent: '−%{n}', amount: '−{amount}', withMinimum: '{minimum} üzeri {value}' };

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

describe('cardBadgeOf — ÜRÜN kartı yalnız fırsatı söyler', () => {
  it('fırsat rozeti çizilir', () => {
    expect(cardBadgeOf({ wasCents: 1500 }, t)).toBe('Fırsat');
  });

  it('fırsatı olmayan ürün rozetsizdir', () => {
    expect(cardBadgeOf({}, t)).toBeUndefined();
  });

  it('`wasCents: 0` de bir fırsattır — varlık sınanır, doğruluk değil', () => {
    // `if (product.wasCents)` diye yazılsaydı sıfır eski fiyat sessizce fırsat olmaktan çıkardı.
    expect(cardBadgeOf({ wasCents: 0 }, t)).toBe('Fırsat');
  });

  /* KAMPANYA ARTIK BU İMZAYA GİREMEZ (27.08) — kural tipin kendisinde yaşıyor: `cardBadgeOf`
     yalnız `wasCents` okuyor, yani bir kampanyayı ürün kartına yazmanın yolu yok. Bu satır bir
     iddia değil bir HATIRLATMA; asıl koruma derleyicide. */
});

describe('scopeBadgeOf — KESİT kartının rozeti', () => {
  it('koşulsuz yüzde kampanyası kısa değeriyle rozete döner', () => {
    expect(scopeBadgeOf(campaign(), tc, 'tr')).toBe('−%15');
  });

  it('koşulsuz sabit tutar müşterinin dilinde biçimlenir', () => {
    expect(scopeBadgeOf(campaign({ percent: null, amountCents: 300 }), tc, 'tr')).toBe(`−${para(300, 'tr')}`);
  });

  it('EŞİKLİ kampanya rozet ÇIKARMAZ — eşiği yutan bir rozet tutulmayan bir sözdür', () => {
    // Eşikli olan kaybolmaz: bandın sayaç satırında TAM cümlesiyle kalır (`countWithCampaign`).
    expect(scopeBadgeOf(campaign({ minBasketCents: 6000 }), tc, 'tr')).toBeUndefined();
    expect(scopeBadgeOf(campaign({ percent: null, amountCents: 300, minBasketCents: 6000 }), tc, 'tr')).toBeUndefined();
  });

  it('kampanyası olmayan kesit rozetsizdir', () => {
    expect(scopeBadgeOf(null, tc, 'tr')).toBeUndefined();
  });

  it('DEĞERİ OLMAYAN kampanya konuşmaz — "%0 indirim" diye bir şey yok', () => {
    expect(scopeBadgeOf(campaign({ percent: null, amountCents: null }), tc, 'tr')).toBeUndefined();
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
