import { describe, expect, it } from 'vitest';
import { ticketAgentTask, ticketDraftTask, type SupportContextInput } from './ticket-support';

/**
 * Destek görevlerinin PROMPT girdisi (15.8 · 20.4 · test dalgası 15.18).
 *
 * Buradaki iddialar modelin ne CEVAP VERECEĞİNİ sınamaz — o sınanamaz ve sınanmamalı. Sınanan şey
 * **modele ne SÖYLENDİĞİ**: kanal adı doğru mu, künye girdiye giriyor mu, siparişsiz talepte
 * uydurulacak bir sipariş bağlamı bırakılmış mı. Modelin uydurmasını engelleyen şey prompt'un
 * kendisi değil yüzeyin darlığıdır (`ticket-support.ts` künyesi) — ama yüzeyin darlığı da ancak
 * girdide olmayan şeyin gerçekten olmadığı doğrulanırsa anlamlıdır.
 *
 * `packages/ai` DB'siz: bu dosya birim projesinde koşar, şerit kendi koşar.
 */
const base: SupportContextInput = {
  channel: 'whatsapp',
  business: { whatsapp: '+33 (0)6 16 99 06 81', email: 'contact@lezzetanatolie.com' },
  messages: [{ who: 'customer', text: 'Fıstıklı baklava var mı?' }],
  order: null,
};

describe('kanal adı — modele SÖYLENİR çünkü müşteri onu görür', () => {
  it('dört kanalın dördü de kendi adıyla geçer', () => {
    // 21.08'e kadar konuşma yolu sabit 'whatsapp' geçiyordu ve Messenger'dan yazan müşteriye ajan
    // "WhatsApp" diyordu. Bu test o hatanın nöbetçisi.
    expect(ticketDraftTask.buildPrompt({ ...base, channel: 'whatsapp' })).toContain('Kanal: WhatsApp.');
    expect(ticketDraftTask.buildPrompt({ ...base, channel: 'messenger' })).toContain('Kanal: Facebook Messenger.');
    expect(ticketDraftTask.buildPrompt({ ...base, channel: 'instagram' })).toContain('Kanal: Instagram DM.');
    expect(ticketDraftTask.buildPrompt({ ...base, channel: 'ticket' })).toContain('destek talebi');
  });

  it('Messenger prompt’unda "WhatsApp" kanal adı olarak GEÇMEZ', () => {
    const prompt = ticketDraftTask.buildPrompt({ ...base, channel: 'messenger' });
    expect(prompt).not.toContain('Kanal: WhatsApp');
  });
});

describe('işletme künyesi — araç değil GİRDİ', () => {
  it('numara ve e-posta prompt’a girer', () => {
    // Değişmeyen bilgi için araç açmak her soruda bir tur ve jeton demekti (22.08 kararı).
    const prompt = ticketDraftTask.buildPrompt(base);
    expect(prompt).toContain('+33 (0)6 16 99 06 81');
    expect(prompt).toContain('contact@lezzetanatolie.com');
  });

  it('künye TALİMAT değil BAĞLAM olarak veriliyor — model ancak sorulursa söyler', () => {
    expect(ticketDraftTask.buildPrompt(base)).toContain('müşteri sorarsa söyleyebilirsin');
  });
});

describe('sipariş bağlamı — yokluğu AÇIKÇA söylenir', () => {
  it('siparişsiz talepte "yok" yazar, boş bırakılmaz', () => {
    // Boş bırakmak, modele doldurulacak bir yer bırakmaktır. Girdide olmayan sayı cevapta olamaz —
    // ama "olmadığı" da söylenmeli, yoksa sessizlik uydurmaya davet olur.
    const prompt = ticketDraftTask.buildPrompt(base);
    expect(prompt).toContain('SİPARİŞ BAĞLAMI: yok');
    expect(prompt).not.toContain('Referans:');
  });

  it('sipariş varsa alanları DOĞRULANMIŞ diye işaretlenir', () => {
    const prompt = ticketDraftTask.buildPrompt({
      ...base,
      order: {
        referenceNo: 'LZ-26-0142',
        statusLabel: 'hazırlanıyor',
        deliveryDate: '2026-08-25',
        paymentLabel: 'kapıda',
        items: [{ name: 'Fıstıklı Baklava', qty: 2 }],
      },
    });
    expect(prompt).toContain('SİPARİŞ BAĞLAMI (doğrulanmış)');
    expect(prompt).toContain('LZ-26-0142');
    expect(prompt).toContain('Fıstıklı Baklava ×2');
  });
});

describe('yazışma — kim konuştuğu ayrışır', () => {
  it('müşteri, personel ve AI ayrı etiketlerle geçer', () => {
    // "Bunu kim söyledi" sorusu modelin de cevaplayabilmesi gereken bir soru: kendi eski cevabını
    // müşterinin sözü sanan bir ajan, olmayan bir talebi karşılamaya çalışır.
    const prompt = ticketDraftTask.buildPrompt({
      ...base,
      messages: [
        { who: 'customer', text: 'merhaba' },
        { who: 'staff', text: 'buyrun' },
        { who: 'ai', text: 'yardımcı olayım' },
      ],
    });
    expect(prompt).toContain('[MÜŞTERİ] merhaba');
    expect(prompt).toContain('[BİZ (personel)] buyrun');
    expect(prompt).toContain('[BİZ (AI)] yardımcı olayım');
  });
});

describe('sipariş yönlendirmesi — sohbet danışmanlık, işlem sitede (28.08 · CHANNELS §3b)', () => {
  /* Kanal rolünün ajandaki karşılığı. Kimliksiz sohbette ajan artık araçlı (16.9 · üçlü kapı):
     ürünü buluyor, fiyatı ve teslimatı söylüyor — ama "peki nasıl sipariş veririm" sorusuna
     verecek cevabı YOKTU. Danışmanlığın son adımı eksikti. */
  /* İDDİA HER İKİ GÖREVE AYRI AYRI kuruluyor: iki metni birleştirip aramak, kuralın yalnız BİRİNDE
     kalmasını gözden kaçırırdı — ve kaçan taraf taslak olsaydı operatörün önüne "adresinizi yazın"
     diyen bir öneri gelirdi. Ortak sabit (`FACTS`) bugün ikisine de giriyor; test bunu çiviliyor. */
  const talimatlar = [
    ['özerk ajan', ticketAgentTask.system],
    ['taslak', ticketDraftTask.system],
  ] as const;
  const herIkisinde = (parca: string) => {
    for (const [ad, talimat] of talimatlar) expect(talimat, `${ad} talimatında eksik`).toContain(parca);
  };

  it('ajan sipariş ALAMAYACAĞINI biliyor — sepet/adres/kayıt üçü de kapalı', () => {
    // Araçların değişmezi zaten "yalnız okur"; ama değişmezi KOD zorlar, modeli PROMPT bilgilendirir.
    // İkisi ayrı katman: araç vermemek modelin uydurmasını engellemez, yalnız yapmasını engeller.
    herIkisinde('siparişi SEN alamazsın');
  });

  it('yönlendirme bir EKSİKLİK gibi değil, doğru yol olarak anlatılıyor', () => {
    /* "Ben yapamıyorum, siteye gidin" cümlesi müşteriye bir kusur bildirir. Gerekçe gerçek:
       adres doğrulaması, stok ayırma ve ödeme sitede BİRLİKTE çalışıyor. */
    herIkisinde('adres doğrulaması, stok ayırma ve ödeme orada birlikte çalışır');
  });

  it('site adresi EZBERDEN yazılmıyor — uydurulan bağlantı yanlış bilgiden kötüdür', () => {
    // Adres ortama göre değişiyor (`NEXT_PUBLIC_SITE_URL`) ve prompt'a taşınmadı; model
    // hafızasından bir alan adı üretirse müşteri var olmayan bir sayfaya giderdi.
    herIkisinde('EZBERDEN YAZMA');
  });

  it('ADRES sohbette alınmıyor — 22.08 kararının prompt karşılığı', () => {
    /* Kararın gerekçesi ölçülmüştü: serbest metinden çıkarılan adreste doğrulama makinesi (BAN
       sorgusu · posta kodu çözümü · bölge eşleşmesi) tümüyle atlanır ve soğuk zincirde yanlış
       adres malın kendisidir. Kod tarafında yazan araç zaten yok; bu satır modelin SÖZ VERMESİNİ
       engelliyor — "adresinizi yazın, ben girerim" cümlesi araçsız da kurulabilirdi. */
    herIkisinde('Adresi sohbette ALMA');
  });
});

describe('iki görev — ortak girdi, AYRI talimat ve AYRI risk', () => {
  it('prompt kurucusu ORTAK', () => {
    expect(ticketAgentTask.buildPrompt(base)).toBe(ticketDraftTask.buildPrompt(base));
  });

  it('sistem talimatları AYRI — taslak boşluk bırakabilir, ajan susup devretmek zorunda', () => {
    expect(ticketAgentTask.system).not.toBe(ticketDraftTask.system);
  });

  it('ÖZERK ajanın sıcaklığı taslaktan DÜŞÜK — onaysız giden metinde tutarlılık yaratıcılıktan değerli', () => {
    expect(ticketAgentTask.temperature).toBeLessThan(ticketDraftTask.temperature);
  });

  it('ikisinin de adım tavanı var — araç döngüsüne giren model faturayı sessizce büyütemez', () => {
    expect(ticketDraftTask.maxSteps).toBeGreaterThan(0);
    expect(ticketAgentTask.maxSteps).toBeGreaterThan(0);
  });
});
