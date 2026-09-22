import { describe, expect, it } from 'vitest';
import { chooseShippingOption, homeDeliveryOnly, homeShortlist, needsServicePoint, requiresHomeDelivery } from './shipping-choice';

describe('requiresHomeDelivery', () => {
  it('ÜCRETSİZ kargo eve gider — parayı biz ödüyoruz, seçim bizim', () => {
    expect(requiresHomeDelivery({ deliveryType: 'shipping', shippingFeeCents: 0 })).toBe(true);
  });

  it('müşteri ÖDÜYORSA seçim onun — teslimat noktası da meşru', () => {
    expect(requiresHomeDelivery({ deliveryType: 'shipping', shippingFeeCents: 499 })).toBe(false);
  });

  it('ROTA teslimatında soru doğmaz — ücret sıfır ama ortada kargo yok', () => {
    expect(requiresHomeDelivery({ deliveryType: 'route', shippingFeeCents: 0 })).toBe(false);
    expect(requiresHomeDelivery({ deliveryType: 'pickup', shippingFeeCents: 0 })).toBe(false);
  });
});

describe('homeDeliveryOnly', () => {
  const secenek = (code: string, lastMile: string | null) => ({ code, lastMile });

  it('yalnız eve teslim edenler kalır', () => {
    const kalan = homeDeliveryOnly([
      secenek('nokta', 'service_point'),
      secenek('ev', 'home_delivery'),
      secenek('dolap', 'locker'),
    ]);
    expect(kalan.map((o) => o.code)).toEqual(['ev']);
  });

  // Yanılmanın bedeli: müşteri ücretsiz kargo bekler, kolisini teslim noktasında bulur.
  it('son adımı BİLİNMEYEN seçenek eve teslim sayılmaz', () => {
    expect(homeDeliveryOnly([secenek('bilinmiyor', null)])).toEqual([]);
  });
});

describe('needsServicePoint', () => {
  it('noktada biten her son adım nokta ister, eve teslim ve bilinmeyen istemez', () => {
    expect(['service_point', 'locker', 'locker_or_service_point'].map(needsServicePoint)).toEqual([true, true, true]);
    expect(needsServicePoint('home_delivery')).toBe(false);
    expect(needsServicePoint('mailbox')).toBe(false);
    expect(needsServicePoint(null)).toBe(false);
  });
});

describe('chooseShippingOption', () => {
  // Liste fiyata göre sıralı gelmeyebilir; seçim sıraya güvenmemeli.
  const secenekler = [
    { code: 'ev-pahali', lastMile: 'home_delivery', priceCents: 990 },
    { code: 'nokta-ucuz', lastMile: 'service_point', priceCents: 450 },
    { code: 'ev-ucuz', lastMile: 'home_delivery', priceCents: 690 },
  ];

  it('müşteri ödüyorsa İSTEDİĞİ servis — teslim noktası dahil', () => {
    expect(chooseShippingOption(secenekler, { free: false, requestedCode: 'nokta-ucuz' })).toMatchObject({
      ok: true,
      option: { code: 'nokta-ucuz' },
    });
  });

  it('seçim yoksa en ucuz değil, EVE giden en ucuz', () => {
    expect(chooseShippingOption(secenekler, { free: false, requestedCode: null })).toMatchObject({
      ok: true,
      option: { code: 'ev-ucuz' },
    });
  });

  it('ücretsiz kargoda istenen teslim noktası YOK SAYILIR, koli eve gider', () => {
    expect(chooseShippingOption(secenekler, { free: true, requestedCode: 'nokta-ucuz' })).toMatchObject({
      ok: true,
      option: { code: 'ev-ucuz' },
    });
  });

  it('listede olmayan istek başka servise DÜŞMEZ, söylenir', () => {
    expect(chooseShippingOption(secenekler, { free: false, requestedCode: 'kalkmis' })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('seçim bize kalmış ve eve giden yoksa uydurulmaz', () => {
    expect(chooseShippingOption([secenekler[1]!], { free: true, requestedCode: null })).toEqual({ ok: false, reason: 'no_home_option' });
  });
});

describe('homeShortlist — müşteriye gösterilen eve teslim servisleri', () => {
  const ev = (code: string, priceCents: number, leadTimeHours: number | null) => ({ code, lastMile: 'home_delivery', priceCents, leadTimeHours });
  // Ölçülen listenin şekli: süresi bilinmeyen en ucuz servis, 48 ve 24 saatlik kademeler, cumartesi ve imza türevleri.
  const liste = [
    ev('chrono-10', 2141, 24),
    ev('mr-ev', 617, null),
    ev('colissimo-imza', 1252, 48),
    ev('chrono-13', 1424, 24),
    ev('chrono-18', 1106, 48),
    { code: 'nokta', lastMile: 'service_point', priceCents: 300, leadTimeHours: 12 },
  ];

  it('en ucuz ve en hızlı iki kart; en hızlılar arasında ucuz olan', () => {
    expect(homeShortlist(liste).map((o) => o.code)).toEqual(['mr-ev', 'chrono-13']);
  });

  it('en ucuz aynı zamanda en hızlıysa tek kart', () => {
    expect(homeShortlist([ev('a', 500, 24), ev('b', 900, 48)]).map((o) => o.code)).toEqual(['a']);
  });

  it('noktaya giden servis eve teslim listesine girmez; eve giden yoksa liste boş', () => {
    expect(homeShortlist([liste[5]!])).toEqual([]);
  });
});
