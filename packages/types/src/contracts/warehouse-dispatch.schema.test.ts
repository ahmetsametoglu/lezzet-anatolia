import { describe, expect, it } from 'vitest';
import { DispatchOptionsResponseSchema } from './warehouse-api.schema';

/*
  Motorun ürettiği alan şemada yoksa uçtaki `parse` onu sessizce siler ve derleyici bunu göremez (fazla alan denetimi
  yalnız nesne sabitlerine uygulanır); bu sınır ancak testle tutulur.
*/
const gecerliSecenek = {
  code: 'colissimo:home',
  carrierName: 'Colissimo',
  name: 'Domicile',
  priceCents: 892,
  leadTimeHours: 48,
  lastMile: 'home_delivery',
  tracked: true,
};

describe('DispatchOptionsResponseSchema · homeOnly', () => {
  it('bayrak parse sonrası HAYATTA — motorun daraltma kararı tele çıkıyor', () => {
    const sonuc = DispatchOptionsResponseSchema.parse({
      status: 'ok',
      options: [gecerliSecenek],
      parcelCount: 1,
      totalWeightG: 3200,
      homeOnly: true,
      fixed: false,
      servicePoint: null,
      plannedParcelCount: null,
    });

    expect(sonuc).toMatchObject({ status: 'ok', homeOnly: true });
  });

  it('bayrak ZORUNLU — eksik cevap reddedilir, sessizce `false` sayılmaz', () => {
    // "Bilinmiyor"u `false`a düşürmek daraltılmış bir listeyi tam gibi okuturdu (CLAUDE §1).
    const eksik = DispatchOptionsResponseSchema.safeParse({
      status: 'ok',
      options: [gecerliSecenek],
      parcelCount: 1,
      totalWeightG: 3200,
    });

    expect(eksik.success).toBe(false);
  });

  it('daraltma listeyi BOŞALTABİLİR ve bu geçerli bir cevaptır', () => {
    // Boş liste bir hâl, hata değil: kural her seçeneği elemiş olabilir ve ekranın söyleyeceği
    // cümle tam da `homeOnly`den geliyor.
    const sonuc = DispatchOptionsResponseSchema.parse({
      status: 'ok',
      options: [],
      parcelCount: 1,
      totalWeightG: 3200,
      homeOnly: true,
      fixed: false,
      servicePoint: null,
      plannedParcelCount: null,
    });

    expect(sonuc).toMatchObject({ status: 'ok', options: [], homeOnly: true });
  });
});

describe('DispatchOptionsResponseSchema · siparişteki seçim', () => {
  it('sabit servis, teslim noktası ve planlanan koli sayısı parse sonrası hayatta', () => {
    const nokta = {
      id: 'sp-42',
      carrierCode: 'mondial_relay',
      name: 'Tabac du coin',
      street: 'Rue de Rivoli',
      houseNumber: '8',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
    };
    const sonuc = DispatchOptionsResponseSchema.parse({
      status: 'ok',
      options: [gecerliSecenek],
      parcelCount: 1,
      totalWeightG: 3200,
      homeOnly: false,
      fixed: true,
      servicePoint: nokta,
      plannedParcelCount: 1,
    });

    expect(sonuc).toMatchObject({ fixed: true, servicePoint: nokta, plannedParcelCount: 1 });
  });

  it('seçilen servisin tutmama sebebi ve iki koli sayısı tele çıkıyor', () => {
    const sonuc = DispatchOptionsResponseSchema.parse({ status: 'selection_unusable', reason: 'multicollo', parcelCount: 2, plannedParcelCount: 1 });
    expect(sonuc).toEqual({ status: 'selection_unusable', reason: 'multicollo', parcelCount: 2, plannedParcelCount: 1 });
  });
});
