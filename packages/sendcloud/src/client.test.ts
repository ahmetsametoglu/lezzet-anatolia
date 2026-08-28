import { describe, expect, it } from 'vitest';
import { announceShipment, cancelShipment, fetchShippingQuotes, MAX_PARCELS_PER_SHIPMENT, type ParcelSpec } from './client';
import { isSendcloudError } from './errors';
import { fakeSendcloud, quoteResponse } from './testing';

const from = { countryCode: 'FR', postalCode: '67000', city: 'Strasbourg' };
const to = { countryCode: 'FR', postalCode: '75001', city: 'Paris' };
const koli: ParcelSpec = { weightG: 1500, lengthMm: 300, widthMm: 200, heightMm: 150 };

describe('birim gönderimi — gram ve milimetre, ondalık YOK', () => {
  it('ağırlık gram, ölçü milimetre olarak gider', async () => {
    const { config, calls } = fakeSendcloud([{ json: quoteResponse() }]);
    await fetchShippingQuotes(config, { from, to, parcels: [koli] });

    const parcel = (calls[0]!.body as { parcels: Array<Record<string, { value?: string; unit: string }>> }).parcels[0]!;
    expect(parcel.weight).toEqual({ value: '1500', unit: 'g' });
    expect(parcel.dimensions).toMatchObject({ length: '300', width: '200', height: '150', unit: 'mm' });
  });

  it('ondalık girdi TAM SAYIYA yuvarlanır — kayan nokta artefaktı tele girmez', async () => {
    const { config, calls } = fakeSendcloud([{ json: quoteResponse() }]);
    await fetchShippingQuotes(config, { from, to, parcels: [{ ...koli, weightG: 1049.9999999998 }] });
    expect((calls[0]!.body as { parcels: Array<{ weight: { value: string } }> }).parcels[0]!.weight.value).toBe('1050');
  });
});

describe('teklif okuması', () => {
  it('fiyat CENT olarak döner — para tam sayı üzerinden yürür', async () => {
    const { config } = fakeSendcloud([{ json: quoteResponse() }]);
    const [q] = await fetchShippingQuotes(config, { from, to, parcels: [koli] });
    expect(q!.priceCents).toBe(499);
    expect(q!.currency).toBe('EUR');
  });

  it('BOOLISH alanlar normalleşir — "yes" dizesi de true, "no" da false', async () => {
    const { config } = fakeSendcloud([{ json: quoteResponse() }]);
    const [q] = await fetchShippingQuotes(config, { from, to, parcels: [koli] });
    expect(q!.tracked).toBe(true);
    expect(q!.signature).toBe(false);
  });

  it('MULTICOLLO yüzeye çıkar — çok kutulu siparişin süzgeci buna bakar', async () => {
    const { config } = fakeSendcloud([{ json: quoteResponse() }]);
    const [q] = await fetchShippingQuotes(config, { from, to, parcels: [koli] });
    expect(q!.multicollo).toBe(true);
  });

  it('BİLİNMEYEN son-adım değeri parse KIRMAZ, null olur', async () => {
    const { config } = fakeSendcloud([
      { json: quoteResponse({ functionalities: { last_mile: 'drone_delivery', multicollo: true } }) },
    ]);
    const [q] = await fetchShippingQuotes(config, { from, to, parcels: [koli] });
    expect(q!.lastMile).toBeNull();
    expect(q!.code).toBe('chronopost:shop2shop');
  });

  it('fiyatsız seçenek fiyatı NULL taşır — sıfır değil', async () => {
    const { config } = fakeSendcloud([{ json: quoteResponse({ quotes: [] }) }]);
    const [q] = await fetchShippingQuotes(config, { from, to, parcels: [koli] });
    expect(q!.priceCents).toBeNull();
  });
});

describe('hata sınıflandırması — çağıranın vereceği karar hataya göre değişir', () => {
  const hal = async (status: number): Promise<string> => {
    const { config } = fakeSendcloud([{ status, json: { errors: [{ detail: 'olmadı' }] } }]);
    try {
      await fetchShippingQuotes(config, { from, to, parcels: [koli] });
      return 'hata yok';
    } catch (err) {
      return isSendcloudError(err) ? err.code : 'bilinmeyen';
    }
  };

  it('401 kimlik, 402 bakiye, 429 oran sınırı, 400 doğrulama', async () => {
    expect(await hal(401)).toBe('credentials');
    expect(await hal(403)).toBe('credentials');
    expect(await hal(402)).toBe('credit');
    expect(await hal(429)).toBe('network');
    expect(await hal(400)).toBe('validation');
  });

  it('anahtar yoksa AĞA HİÇ ÇIKILMAZ — kurulum hatası istekle öğrenilmez', async () => {
    const { calls } = fakeSendcloud([{ json: quoteResponse() }]);
    const bos = { publicKey: '', secretKey: '', fetchImpl: (() => Promise.reject(new Error('çağrılmamalı'))) as unknown as typeof fetch };
    await expect(fetchShippingQuotes(bos, { from, to, parcels: [koli] })).rejects.toThrow(/anahtarları tanımlı değil/);
    expect(calls).toHaveLength(0);
  });

  it('cevap şekli bozuksa `parse` — sözleşme değişmiş olabilir, sessizce boş liste dönmez', async () => {
    const { config } = fakeSendcloud([{ json: { data: [{ code: 42 }] } }]);
    await expect(fetchShippingQuotes(config, { from, to, parcels: [koli] })).rejects.toMatchObject({ code: 'parse' });
  });
});

describe('⚠ POST YENİDEN DENENMEZ — ikinci koli gerçek paradır', () => {
  it('duyuru 5xx alırsa TEK KEZ çağrılır', async () => {
    const { config, calls } = fakeSendcloud([{ status: 500, json: {} }]);
    await expect(
      announceShipment(config, { externalReferenceId: 'ship-1', from, to, parcels: [koli], shippingOptionCode: 'sendcloud:letter' }),
    ).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('duyuru AĞ HATASI alırsa da tek kez çağrılır — istek karşıya ulaşmış olabilir', async () => {
    const { config, calls } = fakeSendcloud([{ throws: 'socket hang up' }]);
    await expect(
      announceShipment(config, { externalReferenceId: 'ship-1', from, to, parcels: [koli], shippingOptionCode: 'sendcloud:letter' }),
    ).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('TEKLİF (POST ama yaratmaz) da tek kez çağrılır — kural yönteme bağlı, niyete değil', async () => {
    const { config, calls } = fakeSendcloud([{ status: 503, json: {} }]);
    await expect(fetchShippingQuotes(config, { from, to, parcels: [koli] })).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe('gönderi duyurusu', () => {
  const cevap = {
    data: {
      id: 'sc-ship-9',
      carrier: { code: 'chronopost', name: 'Chronopost' },
      parcels: [
        { id: 111, tracking_number: 'XY111', tracking_url: 'https://t/111', label_file: Buffer.from('PDF-1').toString('base64') },
        { id: 222, tracking_number: 'XY222', tracking_url: null },
      ],
    },
  };

  it('çok koli TEK çağrıda duyurulur, HER koli kendi takip numarasını alır', async () => {
    const { config, calls } = fakeSendcloud([{ json: cevap }]);
    const sonuc = await announceShipment(config, {
      externalReferenceId: 'ship-1',
      orderNumber: 'LA-26-ABC',
      reference: 'KT-26-XYZ',
      from,
      to,
      parcels: [koli, { ...koli, weightG: 900 }],
      shippingOptionCode: 'sendcloud:letter',
    });
    expect(calls).toHaveLength(1);
    expect(sonuc.parcels.map((p) => p.trackingNumber)).toEqual(['XY111', 'XY222']);
    expect(sonuc.providerShipmentId).toBe('sc-ship-9');
    expect(sonuc.parcels[0]!.labelPdf?.toString()).toBe('PDF-1');
  });

  it('ÜÇ KİMLİK de gövdeye yazılır — makine eşleşmesi, insan araması, fiziksel iz', async () => {
    const { config, calls } = fakeSendcloud([{ json: cevap }]);
    await announceShipment(config, {
      externalReferenceId: 'ship-1',
      orderNumber: 'LA-26-ABC',
      reference: 'KT-26-XYZ',
      from,
      to,
      parcels: [koli],
      shippingOptionCode: 'sendcloud:letter',
    });
    expect(calls[0]!.body).toMatchObject({
      external_reference_id: 'ship-1',
      order_number: 'LA-26-ABC',
      reference: 'KT-26-XYZ',
    });
  });

  it('takip numarasız koli REDDEDİLİR — izlenemeyen gönderi kaydedilmez', async () => {
    const { config } = fakeSendcloud([{ json: { data: { id: 'x', parcels: [{ id: 1, tracking_number: null }] } } }]);
    await expect(
      announceShipment(config, { externalReferenceId: 'ship-1', from, to, parcels: [koli], shippingOptionCode: 'sendcloud:letter' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('15 KOLİ TAVANI çağrıdan ÖNCE denetlenir — ağa boşuna gidilmez', async () => {
    const { config, calls } = fakeSendcloud([{ json: cevap }]);
    const fazla = Array.from({ length: MAX_PARCELS_PER_SHIPMENT + 1 }, () => koli);
    await expect(
      announceShipment(config, { externalReferenceId: 'ship-1', from, to, parcels: fazla, shippingOptionCode: 'sendcloud:letter' }),
    ).rejects.toThrow(/en fazla 15 koli/);
    expect(calls).toHaveLength(0);
  });

  it('kolisiz gönderi duyurulamaz', async () => {
    const { config } = fakeSendcloud([{ json: cevap }]);
    await expect(
      announceShipment(config, { externalReferenceId: 'ship-1', from, to, parcels: [], shippingOptionCode: 'sendcloud:letter' }),
    ).rejects.toThrow(/kolisiz/);
  });
});

describe('iptal', () => {
  it('404 BAŞARI sayılır — zaten yok olan gönderi iptal edilmiş demektir', async () => {
    const { config } = fakeSendcloud([{ status: 404, json: {} }]);
    await expect(cancelShipment(config, 'sc-1')).resolves.toBeUndefined();
  });

  it('409 FIRLATIR — koli yolda, operatöre söylenmeli', async () => {
    const { config } = fakeSendcloud([{ status: 409, json: { errors: [{ detail: 'parcel already in transit' }] } }]);
    await expect(cancelShipment(config, 'sc-1')).rejects.toMatchObject({ code: 'validation' });
  });
});
