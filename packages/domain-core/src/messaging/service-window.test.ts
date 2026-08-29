import { describe, expect, it } from 'vitest';
import {
  humanAgentWindowState,
  isAvoidableTemplate,
  SERVICE_WINDOW_HOURS,
  serviceWindowExpiry,
  serviceWindowState,
} from './service-window';

/**
 * Servis penceresi (15.1). Sınanan tek şey pencerenin **neye göre** hesaplandığı: mesajın anına
 * göre, işlediğimiz ana göre değil. Fark adım 2'de para demek — gecikmiş bir webhook, kendi
 * işlenme anına göre hesaplanmış bir pencereyi Meta'nınkinden geç bitirir ve gönderim reddedilir.
 */

describe('servis penceresi gelen mesajın ANINA çıpalıdır', () => {
  it('24 saat sonrasını döner', () => {
    expect(serviceWindowExpiry('2026-08-08T09:00:00.000Z')).toBe('2026-08-09T09:00:00.000Z');
  });

  it('Date girdisi de aynı sonucu verir — çağıran dönüştürmek zorunda değil', () => {
    const at = new Date('2026-08-08T09:00:00.000Z');
    expect(serviceWindowExpiry(at)).toBe(serviceWindowExpiry(at.toISOString()));
  });

  it('süre SABİTTEN gelir — sayı koda ikinci kez yazılmaz', () => {
    const at = new Date('2026-08-08T09:00:00.000Z');
    const expiry = new Date(serviceWindowExpiry(at));
    expect((expiry.getTime() - at.getTime()) / (60 * 60 * 1000)).toBe(SERVICE_WINDOW_HOURS);
  });

  it('gün/ay sınırını doğru geçer — yerel saat dilimine kaymaz', () => {
    // 31 Aralık 20:00 UTC + 24s = 1 Ocak 20:00 UTC. Yerel saate düşen bir uygulama burada kayardı.
    expect(serviceWindowExpiry('2026-12-31T20:00:00.000Z')).toBe('2027-01-01T20:00:00.000Z');
  });
});

describe('pencerenin şu anki hâli — ücret kararının tek kapısı', () => {
  const simdi = new Date('2026-08-08T12:00:00.000Z');

  it('açık pencere: serbest metin, ücretsiz — kalan süre de söylenir', () => {
    const durum = serviceWindowState('2026-08-08T18:00:00.000Z', simdi);
    expect(durum).toEqual({ open: true, everOpened: true, msRemaining: 6 * 60 * 60 * 1000 });
  });

  it('kapanmış pencere: kalan süre SIFIR, eksi değil', () => {
    // Eksi bir süre "borç" gibi okunur ve ekranda "-3 saat kaldı" diye görünürdü.
    expect(serviceWindowState('2026-08-08T09:00:00.000Z', simdi)).toEqual({
      open: false,
      everOpened: true,
      msRemaining: 0,
    });
  });

  it('HİÇ AÇILMAMIŞ pencere kapanmış pencereden farklıdır — müdahaleleri de farklı', () => {
    // İkisi de "gönderemezsin" der ama biri kaçırılmış bir fırsat, öteki henüz kurulmamış bir
    // ilişkidir: birincisinde müşteriye ulaşmanın maliyeti bir şablon, ikincisinde bir izin.
    expect(serviceWindowState(null, simdi)).toEqual({ open: false, everOpened: false, msRemaining: 0 });
    expect(serviceWindowState(undefined, simdi).everOpened).toBe(false);
  });

  it('tam bitiş anında pencere KAPALIDIR — sınırda iyimserlik fatura yazar', () => {
    expect(serviceWindowState('2026-08-08T12:00:00.000Z', simdi).open).toBe(false);
  });
});

describe('insan-temsilci penceresi — 24 saat kapandıktan SONRAKİ 7 gün (28.08)', () => {
  /* Damga her testte gelen mesajın anı + 24 saattir (`serviceWindowExpiry`'nin yazdığı şey).
     Aşağıdaki değerler o kabule göre okunuyor: müşteri 8 Ağustos 12:00'de yazmış. */
  const gelenMesaj = '2026-08-08T12:00:00.000Z';
  const damga = '2026-08-09T12:00:00.000Z'; // gelen + 24 saat

  it('24 saat kapandıktan sonra da AÇIK — danışma kanalının varlık sebebi', () => {
    // Müşteri cuma yazdı, cevap pazartesi yazılıyor. Servis penceresi kapalı ama etiketli yol açık.
    const pazartesi = new Date('2026-08-11T09:00:00.000Z');
    expect(serviceWindowState(damga, pazartesi).open).toBe(false);
    expect(humanAgentWindowState(damga, pazartesi).open).toBe(true);
  });

  it('7 GÜN gelen mesajdan sayılır, damgadan değil — bir gün fark eder', () => {
    /* Damga zaten +24 saat taşıyor; 7 günü damgaya eklemek pencereyi 8 güne çıkarır ve son gün
       Meta reddederken bizim kapımız "gönderilebilir" derdi. Sınır: gelen + 7 gün. */
    const sonAn = new Date(new Date(gelenMesaj).getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
    const hemenSonrasi = new Date(new Date(gelenMesaj).getTime() + 7 * 24 * 60 * 60 * 1000 + 1000);
    expect(humanAgentWindowState(damga, sonAn).open).toBe(true);
    expect(humanAgentWindowState(damga, hemenSonrasi).open).toBe(false);
  });

  it('kapandığında kalan süre SIFIR, eksi değil — servis penceresiyle aynı kural', () => {
    const cokSonra = new Date('2026-09-01T00:00:00.000Z');
    expect(humanAgentWindowState(damga, cokSonra)).toEqual({ open: false, everOpened: true, msRemaining: 0 });
  });

  it('müşteri HİÇ yazmamışsa etiketli yol da yok — etiketin dayanağı gelen mesajdır', () => {
    // İnsan-temsilci etiketi "müşterinin sorusuna cevap veriyoruz" demektir; ortada soru yoksa
    // etiket bir gerekçe değil bahane olurdu.
    expect(humanAgentWindowState(null)).toEqual({ open: false, everOpened: false, msRemaining: 0 });
  });
});

describe('kaçınılabilir şablon — "pencere açıkken şablon = israf" kestirmesi YANLIŞ', () => {
  const acik = serviceWindowState('2026-08-08T18:00:00.000Z', new Date('2026-08-08T12:00:00.000Z'));
  const kapali = serviceWindowState('2026-08-08T09:00:00.000Z', new Date('2026-08-08T12:00:00.000Z'));

  it('pencere açıkken PAZARLAMA şablonu israftır — aynı içerik serbest metinle ücretsiz giderdi', () => {
    expect(isAvoidableTemplate('marketing', acik)).toBe(true);
  });

  it('pencere açıkken UTILITY şablonu israf DEĞİLDİR — ADR-005 onu orada öneriyor', () => {
    // Doğru davranışı uyarıyla cezalandırmak, uyarının kendisini değersizleştirir: her gönderim
    // uyarı basınca kimse uyarıya bakmaz ve gerçek israf da görünmez olur.
    expect(isAvoidableTemplate('utility', acik)).toBe(false);
  });

  it('AUTHENTICATION bilerek israf sayılmıyor — dayanağımız yok', () => {
    // Kodun şablonla gitmesi bir maliyet hatası değil teslim edilebilirlik kararıdır (biçim,
    // kopyala düğmesi). Olmayan bir dayanakla uyarı basmak, uyarıyı gürültüye çevirir.
    expect(isAvoidableTemplate('authentication', acik)).toBe(false);
  });

  it('pencere kapalıyken HİÇBİR şablon israf değildir — alternatifi yok', () => {
    expect(isAvoidableTemplate('marketing', kapali)).toBe(false);
    expect(isAvoidableTemplate('utility', kapali)).toBe(false);
  });

  it('şablon olmayan mesaj hiç sorulmaz', () => {
    expect(isAvoidableTemplate(null, acik)).toBe(false);
    expect(isAvoidableTemplate(undefined, acik)).toBe(false);
  });
});
