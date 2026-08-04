import { describe, expect, it } from 'vitest';
import { normalizeUtm } from './utm';

/**
 * UTM normalleştirmesi — **bu dosyanın koruduğu şey bir biçim değil, bir SINIRdır.**
 *
 * Deftere ne girdiği kararı burada veriliyor. Sözlük bir gün açılırsa hiçbir test kırılmaz ama
 * anonim deftere tıklama kimliği sızar ve sızıntı hata vermez — o yüzden en önemli test
 * "beklenmeyen anahtar ATILDI" testidir.
 */
describe('normalizeUtm', () => {
  it('kapalı sözlüğün dışındaki her şeyi ATAR — tıklama kimlikleri dâhil', () => {
    const sonuc = normalizeUtm({
      utm_source: 'instagram',
      utm_campaign: 'yaz-2026',
      // Reklam ağının eklediği tıklama kimlikleri: ağın tarafında TEK KULLANICIYA çözülür.
      gclid: 'Cj0KCQiA-abcdef',
      fbclid: 'IwAR0xyz',
      // Ziyaretçinin kendi sorgusu — deftere hiç girmemeli.
      q: 'baklava 500g',
    });

    expect(sonuc).toEqual({ source: 'instagram', campaign: 'yaz-2026' });
    expect(sonuc).not.toHaveProperty('gclid');
    expect(sonuc).not.toHaveProperty('fbclid');
    expect(sonuc).not.toHaveProperty('q');
  });

  it('üç yazımı da tanır ve `utm_` öneki önce gelir', () => {
    // Aynı anahtar iki biçimde geldiğinde kampanya etiketi kazanır: çıplak `source` çoğu zaman
    // sayfanın kendi parametresidir, kampanyayı gölgelememeli.
    expect(normalizeUtm({ utm_source: 'google', source: 'sayfa-ici' })).toEqual({ source: 'google' });
    expect(normalizeUtm({ utmMedium: 'cpc' })).toEqual({ medium: 'cpc' });
    expect(normalizeUtm({ term: 'lahmacun' })).toEqual({ term: 'lahmacun' });
  });

  it('beş alanın hepsini taşır', () => {
    expect(
      normalizeUtm({
        utm_source: 'meta',
        utm_medium: 'paid_social',
        utm_campaign: 'ramazan',
        utm_content: 'video-a',
        utm_term: 'borek',
      }),
    ).toEqual({ source: 'meta', medium: 'paid_social', campaign: 'ramazan', content: 'video-a', term: 'borek' });
  });

  it('boş, boşluklu ve hiç UTM taşımayan girdide `null` döner', () => {
    // `null` "künye yok" demek ve oturum satırı AÇILMAZ — boş künye için satır açmak, oturum
    // tablosunu defterin ikinci kopyasına çevirirdi.
    expect(normalizeUtm(null)).toBeNull();
    expect(normalizeUtm(undefined)).toBeNull();
    expect(normalizeUtm({})).toBeNull();
    expect(normalizeUtm({ utm_source: '   ' })).toBeNull();
    expect(normalizeUtm({ page: '2', sort: 'price' })).toBeNull();
  });

  it('değerleri kırpar — uzun bir etiket bir hata ya da bir enjeksiyon denemesidir', () => {
    const uzun = 'x'.repeat(300);
    expect(normalizeUtm({ utm_campaign: uzun })?.campaign).toHaveLength(80);
  });

  it('etiketin içine sıkışmış kişisel veriyi maskeler', () => {
    // Kampanya adına e-posta yazılması bir kaza da olabilir bir deneme de; ikisinde de ham hâliyle
    // deftere girmemeli (`scrubMessage` tek kapı).
    const sonuc = normalizeUtm({ utm_campaign: 'davet-ahmet@ornek.fr' });
    expect(sonuc?.campaign).not.toContain('ahmet@ornek.fr');
  });
});
