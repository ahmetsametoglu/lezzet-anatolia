import { describe, expect, it } from 'vitest';
import { DispatchOptionsResponseSchema } from './warehouse-api.schema';

/*
  SEVK SEÇENEKLERİ SÖZLEŞMESİ — **motorun ürettiği bayrak tele çıkıyor mu.**

  Bu dosya bir Zod alıştırması değil, ölçülmüş bir arızanın nöbetçisi (29.08). `quoteOrderShipment`
  `homeOnly` bayrağını 29.08'den beri üretiyordu; şemada karşılığı YOKTU ve uçtaki
  `DispatchOptionsResponseSchema.parse` onu her cevapta **sessizce siliyordu.**

  Sessiz kalmasının sebebi TypeScript'in kendisi: uç `const body: z.input<Schema> = outcome`
  yazıyor ve fazla-alan denetimi yalnız NESNE SABİTLERİNE uygulanır — bir değişkende duran fazla
  alan tipe uyar, derleme geçer, alan telde kaybolur. Yani derleyicinin göremediği bir sınır bu ve
  ancak testle tutulur.

  Bedeli somut: depocu daraltılmış listeye TAM liste diye bakar; liste boşaldığında sebebi
  taşıyıcıda arar (oysa kural elemiştir) ve elle taşıyıcı girişine erken kaçar.
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
    });

    expect(sonuc).toMatchObject({ status: 'ok', options: [], homeOnly: true });
  });
});
