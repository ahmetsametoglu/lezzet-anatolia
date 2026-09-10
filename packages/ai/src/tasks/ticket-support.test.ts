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

describe('karşılama SİSTEMDE (10.09) — iki "Merhaba" üst üste gitmez', () => {
  it('beyanın ekleneceği turda modele "selam verme" denir; öteki turlarda satır HİÇ yok', () => {
    /* Beyan artık selamla açılıyor ("Merhaba! Ben … yapay zekâ asistanıyım"). Model de ilk cevapta
       selam verirse müşteri iki selam okur — karar uygulama katmanında, burada yalnız BAĞLAM. */
    expect(ticketAgentTask.buildPrompt({ ...base, greeting: true })).toContain('KARŞILAMA SİSTEMDE');
    expect(ticketAgentTask.buildPrompt(base)).not.toContain('KARŞILAMA SİSTEMDE');
    expect(ticketAgentTask.system).toContain('"KARŞILAMA SİSTEMDE" satırı varsa selamı sistem veriyor');
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

  it('ajan siparişi KAPATAMAYACAĞINI biliyor — adres/ödeme/kayıt üçü de kapalı; SEPET açık (07.09)', () => {
    // Araçların değişmezi "sepet dışında yalnız okur" (15.20); ama değişmezi KOD zorlar, modeli
    // PROMPT bilgilendirir. İkisi ayrı katman: araç vermemek modelin uydurmasını engellemez,
    // yalnız yapmasını engeller. Sınır 07.09'da kaydı: satın almada değil, ONAY ve ÖDEMEDE.
    herIkisinde('siparişi SEN kapatamazsın');
    herIkisinde('SEPETİ sen kurabilirsin');
    herIkisinde('Sepete ekleme bir sipariş DEĞİLDİR');
  });

  it('bağlantıyı model YAZMAZ, sistem ekler — kayan bir harf boş sayfaya götürür', () => {
    herIkisinde('sen bağlantıyı yazma');
    // 08.09 canlı tur 2: "Sepetiniz hazır" iki kez çıktı — modelin cümlesi + sistemin satırı. Cümle
    // artık sistemin; istem modele "sepetiniz hazır" dedirtmiyor.
    expect(ticketAgentTask.system).toContain('"sepetiniz hazır" da deme');
    expect(ticketAgentTask.system).not.toContain('aşağıdaki bağlantıdan giriş yapıp onaylayabilirsiniz" de');
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

  it('UZUNLUK ölçülebilir — "kısa yaz" bir kural değildir', () => {
    /* Eskiden yalnız "Kısa ve net" yazıyordu; ölçülen ilk gerçek cevap dört uzun cümle, ~380
       karakterdi. Mesajlaşmada müşteri telefonda okuyor — sayı verilmezse "kısa" modelin
       yorumuna kalır ve her seferinde başka çıkar. 500 → 350 (07.09): canlı turda 500'lük sınır
       520–616 karakterlik cevaplar üretti; 3-4 kısa cümle 350'ye sığar, liste satırları hariç. */
    herIkisinde('~350 karakter');
    // Selam yalnız bir kez ve tek soru — her turdaki "Merhaba!" ve üç soruluk mesajlar ölçülmüş üslup arızası (07.09).
    herIkisinde('SELAM YALNIZ BİR KEZ');
    herIkisinde('TEK SORU');
  });

  it('BİÇİMLENDİRME kuralı var ve KANALDAN BAĞIMSIZ — dallanma yüzeyde, prompt’ta değil', () => {
    /* Kanala göre dallandırmak ("WhatsApp'ta yıldız kullan, talepte kullanma") modelin
       unutabileceği bir TALİMAT olurdu ve arızası sessiz olurdu. Model her zaman işaretli yazıyor;
       kanal kararını `stripChatFormatting`/`formatForChannel` deterministik veriyor. Bu test o
       ayrımı koruyor: prompt'a bir gün "WhatsApp ise" koşulu sızarsa burada görülür. */
    herIkisinde('kanalı düşünme, sistem hallediyor');
    for (const [ad, talimat] of talimatlar) {
      expect(talimat, `${ad} talimatında kanal koşulu sızmış`).not.toMatch(/WhatsApp['’]?t[ae]\s+(?:ise|olduğunda)/i);
    }
  });

  it('İKİDEN ÇOK seçenek liste olur — dört boyu cümleye sıkıştırmak paragraf üretiyordu', () => {
    herIkisinde('İKİDEN ÇOK seçenek');
    // Tek seçenekte liste yapmak da yanlış: tek maddelik madde işareti gürültüdür.
    herIkisinde('Tek seçenek varsa liste YAPMA');
  });

  it('BOŞ araç sonucu devir sebebi DEĞİL — ölçülmüş yanlış devir', () => {
    /* 07.09'da ölçüldü: müşterinin sıfır siparişi vardı, araç açıklamasız `[]` döndü ve ajan
       *"sipariş geçmişini GÖREMEDİĞİMİZ için"* diye devretti — elinde araç varken ve kapı açıkken.
       Araç tarafı düzeltildi (boşluk artık adıyla geliyor); bu satır modelin okumasını çiviliyor. */
    expect(ticketAgentTask.system).toContain('Boş sonuç bir CEVAPTIR');
    expect(ticketAgentTask.system).toContain('"göremiyoruz" DEME');
  });

  it('MEMNUNİYETSİZLİK devir sebebi değil — öfke maddesi daraltıldı', () => {
    /* Aynı turda ölçülen geri besleme döngüsü: ajan cevap veremiyor → müşteri sitem ediyor → ajan
       sitemi "öfke" sayıp devrediyor. Yani kendi başarısızlığından kaçıyordu. Tehdit/hakaret
       maddesi duruyor, memnuniyetsizlik ondan AYRILDI. */
    expect(ticketAgentTask.system).toContain('Memnuniyetsizlik BUNA GİRMEZ');
    expect(ticketAgentTask.system).toContain('Önce SORUYU cevapla');
  });

  it('GEÇMİŞTEKİ devir yeni bir devri gerekçelendirmez', () => {
    /* Devir bildirimi deftere `ai` mesajı olarak düşüyor ve ajan onu 12 mesajlık pencerede
       görüyor. Operatör sohbeti YZ'ye geri verdiğinde ajan kendi eski cümlesini okuyup yeniden
       devrederse, sohbet insana yapışır ve otomasyon fiilen kapanır. */
    expect(ticketAgentTask.system).toContain('DAHA ÖNCE bir devir görünüyor');
  });

  it('KAPANIŞ devir sebebi değil ve metinsiz-mesaj kuralı SON TURLA sınırlı — canlı tur 4 (08.09)', () => {
    /* Ölçüldü: müşteri sesli soruyla birlikte bir fotoğraf gönderdi, ajan sesi cevapladı; müşteri
       "Anladım" deyince ajan devretti — gerekçe bir önceki turda kalan fotoğraf satırıydı (3 koşuda
       2). Kural tur sınırı taşımıyordu ve kapanış mesajının ne olduğu yazılı değildi. */
    expect(ticketAgentTask.system).toContain('ALTI DURUM');
    // Beğeni/emoji bir cevaptır (08.09): Messenger'ın "parmak"ı fotoğraf sanılıp devrettirilmesin.
    expect(ticketAgentTask.system).toContain('yalnız emoji, beğeni ya da çıkartma');
    // Kargo + eşik + ödenecek toplam birlikte (08.09): ajan 61,02 € dedi, sitede kargo eklenmiş tutar çıktı.
    expect(ticketAgentTask.system).toContain('"indirim", "kargo" ve "toplam" alanlarını BİRLİKTE');
    expect(ticketAgentTask.system).toContain('Bu bir KAPANIŞTIR, devir değil');
    // Ürün kartı (08.09): görmek isteyen müşteriye fotoğraf + fiyat + düğme; düğme cevabı sorusuz sepete.
    expect(ticketAgentTask.system).toContain('urun_karti aracını ÇAĞIR');
    expect(ticketAgentTask.system).toContain('"Sepete ekle — <ürün> (<boy>)" yazarsa');
    // Karusel (09.09): çeşit sorusunda liste değil kaydırmalı kartlar; düğmesi "Ürün kartı — <kod>".
    expect(ticketAgentTask.system).toContain('urun_karuseli aracını ÇAĞIR');
    expect(ticketAgentTask.system).toContain('"Ürün kartı — <kod>" yazarsa');
    // Hesap bağlantısı (15.16): kimliksiz sohbette "siparişim nerede" devredilmez, bağlantıyla cevaplanır.
    expect(ticketAgentTask.system).toContain("hesap_baglantisi'ni ÇAĞIR");
    expect(ticketAgentTask.system).toContain('Hesap bilgisi sorusu için DEVRETME');
    // İnsana geçiş YOLU var (Meta: "must have a way to chat with a human agent as needed"): ilk mesaj
    // artık onu duyurmuyor (10.09), o yüzden müşteri isteyince devretmek talimatta açık bir kural.
    expect(ticketAgentTask.system).toContain('Müşteri bir İNSANLA görüşmek istediğini söylüyor');
    // Posta kodu (10.09): sepete yazan araç yer bilinmeden yazmaz; o turun TEK sorusu posta kodu.
    expect(ticketAgentTask.system).toContain('"sepeteYazilmadi" döner — o zaman cevabının TEK sorusu posta kodu olsun');
    expect(ticketAgentTask.system).toContain('yalnız müşterinin SON TURU içindir');
    // Yere göre ayıklama (10.09): bu adrese gitmeyen ürün önerilmez, karusele girmez; adıyla sorulursa sebebi söylenir.
    expect(ticketAgentTask.system).toContain('"buAdreseGitmeyenler" verirse');
  });

  it('BAŞLANGIÇ FİYATI tek fiyat gibi sunulamaz — ölçülmüş arızanın prompt karşılığı', () => {
    /* 06.09'da ölçüldü: müşteri "fıstıklı baklava" diye genel sordu, ajan dört boydan yalnız en
       ucuzunu (225 g · 4,57 €) söyledi. Cevap yanlış değildi (gramaj ve fiyat aynı varyanttan
       geliyor) ama eksikti — ve eksikliği doğuran şey aracın `fiyat` diye verdiği alanın aslında
       BAŞLANGIÇ fiyatı olmasıydı. Araç artık adıyla söylüyor; prompt da okumasını biliyor. */
    herIkisinde('fiyatBaslangic');
    herIkisinde('EN UCUZ BOYUNDUR');
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
