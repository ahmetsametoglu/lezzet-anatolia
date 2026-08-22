import {
  TicketAgentDecisionSchema,
  TicketDraftReplySchema,
  type ConversationSource,
  type TicketAgentDecision,
  type TicketDraftReply,
} from '@lezzet/types';
import type { AiTask } from '../types';

/**
 * **MÜŞTERİ DESTEĞİ GÖREVLERİ** (16.5 · 20.4) — hibrit taslak (sınıf 1) ve özerk ajan (sınıf 4).
 *
 * ── TİCARİ DEĞER İKİ YOLDAN GELİR: GİRDİ VE ARAÇ ────────────────────────────
 * Sınıf 4'ün kırmızı çizgisi "stok/fiyat/durum domain-core'dan" (20 §sınıflar) ve iki mekanizmayla
 * korunuyor:
 *  1. **Kapalı girdi** — talebin kendi bağlamı (sipariş durumu, teslim günü, kalemler, ödeme)
 *     uygulama katmanında deterministik okunup girdiye yazılır. Girdide olmayan sayı cevapta olamaz.
 *  2. **Dar araç seti** (16.9) — girdiye önceden yazılamayacak sorular için: müşteri "hangi günler
 *     geliyorsunuz" diye sorabilir ve bunun cevabı talebin bağlamında DEĞİL, adresinin bölgesinde
 *     durur. Bu bir zayıflama değil kapsam genişlemesi: araçlar salt okur, kimlikleri çağıran
 *     kapatır, gövdeleri yine domain-core motorlarına dayanır (`ticket/support-tools.ts` künyesi).
 *
 * **Fiziksel engel ilkesi araçla birlikte yer değiştirdi ve bunu bilerek yazıyorum:** eskiden
 * "girdide yok, o hâlde soramaz" idi; artık "yalnız beyaz listedeki araçlar var, kimlik argüman
 * değil kapanış, adım tavanı sonlu". Modelin uydurmasını ENGELLEYEN şey hâlâ prompt değil, yüzeyin
 * kendisi.
 *
 * ── İKİ GÖREV NEDEN AYRI ────────────────────────────────────────────────────
 * Taslak operatöre yazar (onaysız hiçbir şey gitmez), ajan MÜŞTERİYE yazar (onay yok). Aynı prompt
 * ikisine birden hizmet edemez: taslak "emin değilsen operatörün dolduracağı boşluğu bırak"
 * diyebilir, ajan "emin değilsen SUS ve devret" demek zorunda. Riskleri farklı, talimatları ayrı.
 *
 * ── CEVAP DİLİ TÜRKÇE ───────────────────────────────────────────────────────
 * Personel cevabıyla aynı yoldan gider: müşteri kendi dilinde OKUR, çeviri 20.2'nin işidir
 * (`translate_user_text` cron'u mesajı iki yönlü çevirir). Modelden müşteri dilinde yazmasını
 * istemek çeviri kuralını ikinci bir yerde, denetimsiz yaşatmak olurdu.
 */

/** Yazışmanın bir satırı — kim söyledi, ne söyledi. Kimlik yok, ad yok: modele kimlik gitmez. */
export interface SupportMessageInput {
  who: 'customer' | 'staff' | 'ai';
  text: string;
}

/**
 * Görevin ortak bağlamı. Her alan UYGULAMANIN doğruladığı gerçektir; model bunların dışına çıkamaz.
 * `order: null` = talep siparişsiz — model sipariş hakkında hiçbir şey söyleyemez.
 */
export interface SupportContextInput {
  /**
   * Konuşmanın geçtiği yüzey. Sosyal kanallar `ConversationSource`tan TÜRER, elle sayılmaz (15.15):
   * dördüncü bir kanal eklendiği gün bu tip kendiliğinden büyür ve prompt'un eşlemesi derlemede
   * kırılır — sessizce yanlış kanal adı söyleyen bir ajan yerine durmuş bir derleme.
   *
   * Kanal adı modele SÖYLENİYOR çünkü müşteri onu görüyor: "WhatsApp'tan yazdığınız için…" gibi bir
   * cümle Messenger'da yanlış olur. 21.08'e kadar konuşma yolu sabit `'whatsapp'` geçiyordu ve
   * Messenger'dan yazan müşteriye ajan WhatsApp diyordu.
   */
  channel: 'ticket' | ConversationSource;
  /**
   * İşletmenin DEĞİŞMEYEN künyesi — ARAÇ DEĞİL, GİRDİ.
   *
   * Statik bilgi için araç açmak, hiç değişmeyen bir veriyi her soruda bir tur attırmaktı: araç
   * çağrısı gecikme ve jeton demek, karşılığında da hep aynı iki satır. Ayrım net — **değişen şey
   * araca, değişmeyen şey girdiye**: fiyat ve rota günü araçtan gelir (bugün başka, yarın başka),
   * WhatsApp numarası prompt'a yazılır.
   *
   * Değerler `@lezzet/brand`ten UYGULAMA katmanında doldurulur; bu paket marka sabitini bilmez
   * (bağımlılık tek yönlü — `@lezzet/ai` taşımasız bir görev kütüphanesidir).
   */
  business: {
    /** Okunaklı biçim ("+33 (0)6 …") — müşteriye söylenecek hâli; makine biçimi burada işe yaramaz. */
    whatsapp: string;
    email: string;
  };
  /** Yazışma, ESKİDEN YENİYE. Uygulama katmanı kırpar (son N mesaj) — sınır kapıda, prompt'ta değil. */
  messages: SupportMessageInput[];
  order: {
    referenceNo: string | null;
    /** İnsan-okur durum ("Hazırlanıyor") — iç enum modele gitmez, yanlış tercüme ederdi. */
    statusLabel: string;
    deliveryDate: string | null;
    /** "Ödendi" / "Kapıda ödenecek" gibi — para TUTARI bilerek yok: tutar konuşulacaksa insan konuşur. */
    paymentLabel: string | null;
    items: Array<{ name: string; qty: number }>;
  } | null;
}

/** İşletmenin değişmeyen kimliği — iki görevin ortak ilk cümlesi. */
const IDENTITY =
  "Strazburg'da Türk mutfağından donmuş gıda satan bir e-ticaret işletmesinin müşteri destek hattındasın. Müşteriler B2C (ev) ve B2B (restoran/dükkân) olabilir. " +
  // Kullanıcı kararı 22.08: mağaza YOK. Bilgi olarak veriliyor ki ajan devretmek yerine
  // CEVAPLASIN — devir, bilinmeyen sorular içindir; bu soru artık biliniyor.
  'Fiziksel mağaza, şube ya da gel-al noktası YOK: ürünler kapıya teslim edilir ya da kargoyla gönderilir.';

/** İki görevin ortak dil/üslup kuralları. */
const STYLE = `ÜSLUP:
- TÜRKÇE yaz — müşteri kendi dilinde okur, çeviriyi sistem yapar; sen dil seçme.
- Kısa ve net: selamlama tek kelime ("Merhaba!"), sonra doğrudan konu. İmza, ad, "saygılarımızla" YAZMA — şablon ekliyor.
- Sıcak ama ölçülü; müşteriye "siz", işletme adına "biz". Pazarlama dili yok, özür enflasyonu yok — hata bizimse BİR kez ve net özür dile.`;

/** İki görevin ortak gerçeklik kuralları — "bilmiyorsan söz verme" (20 §sınıf 1/4). */
const FACTS = `GERÇEKLİK KURALLARI:
- Sana verilen bağlamın DIŞINA çıkma. Fiyat, stok, teslimat günü/saati, kampanya, iade tutarı UYDURMA — bağlamda yoksa bilmiyorsun demektir.
- Sipariş bağlamı "null" ise sipariş hakkında hiçbir cümle kurma.
- Para sözü verme: iade, indirim, telafi, tazminat KARARI insana aittir. En fazla "konuyu inceliyoruz" diyebilirsin.
- Tarih/gün bağlamda yazıyorsa aynen kullan; yazmıyorsa ARAÇLARA bak; araç da bilmiyorsa "teslimat gününüzü kontrol edip döneceğiz" de.
- "Gelip alabilir miyim", "mağazanız nerede", "adresiniz ne" sorularına NET cevap ver: gel-al noktamız yok, teslimat kapıya ya da kargoyla yapılır. Devretme — bu bilgi sende.
- ADRES ve ÇALIŞMA SAATİ SÖYLEME: elimizdeki adres yasal merkezdir, ziyarete açık bir yer değil. "Bize uğrayın" deme, saat vaat etme.
- Fatura, vergi numarası, şirket unvanı gibi yasal künye sorulursa sitedeki "Yasal bilgiler" sayfasına yönlendir; numaraları hafızandan yazma.`;

/**
 * Araç kuralları (16.9) — **araç verilmediğinde de zararsız**, çünkü hepsi "araç varsa" diye
 * kurulu. İki metni ayırmak (araçlı/araçsız iki prompt) aynı kuralların iki kopyası olurdu ve biri
 * güncellenmeyi unuturdu (CLAUDE §1).
 *
 * Kuralların hepsi tek cümleye çıkıyor: **araç GERÇEĞİN kaynağıdır, ilhamın değil.** Model aracı
 * çağırmadan gün söylerse uydurmuş olur; araç `bilinmiyor` derken gün söylerse aracı ezmiş olur.
 * İkisi de yasak ve ikisi de ayrı ayrı yazılı — "dikkatli ol" demek bir kural değildir.
 */
const TOOLS = `ARAÇLAR:
- Teslimat günü, rota günü, "ne zaman gelirsiniz" sorularında teslimat_gunleri aracını ÇAĞIR. Tahmin etme.
- Ürün, fiyat, "var mı", "kaça", "hangi boyları var" sorularında urun_ara aracını ÇAĞIR. Fiyatı ASLA hafızandan söyleme.
- urun_ara'nın verdiği fiyat MÜŞTERİNİN kendi fiyatıdır (kanalı ve kademesi hesaplanmıştır) — üzerine indirim ekleme, pazarlık yapma, "sana özel" bir rakam söyleme.
- urun_ara "başka depoda var" derse ürünün var olduğunu ama BU ADRESE bugün verilemediğini söyle; "yok" deme.
- urun_ara "bu kanalda satışa kapalı" derse fiyat söyleme; "bu ürünü şu an sizin hesabınızdan satamıyoruz, kontrol edip döneceğiz" de.
- Kargo ücreti, ücretsiz kargo eşiği, asgari sepet, kapıda ödeme sınırı sorularında teslimat_sartlari aracını ÇAĞIR. Bu sayılar değişir; hafızandan söyleme.
- Müşteri BİR POSTA KODU söyleyip "geliyor musunuz" diye sorarsa posta_kodu_kontrol aracını ÇAĞIR. Kendi kayıtlı adresini soruyorsa teslimat_gunleri'ni kullan — ikisini karıştırma.
- posta_kodu_kontrol "birden çok ülkede geçerli" derse hangi ülke olduğunu MÜŞTERİYE SOR; ülkeyi kendin seçme.
- Bir bölgeye gelmiyorsak bunu açıkça söyle ve söz verme: "şimdilik oraya teslimat yapmıyoruz". "Yakında geliriz", "size özel gelebiliriz" DEME — rota kararı işletmenindir.
- teslimat_sartlari "alt sınır yok" derse alt sınır YOKTUR — uydurma bir rakam söyleme.
- Araçların döndürdüğü gün, tarih ve numaraları AYNEN kullan; üzerine ekleme yapma.
- Araç "bilinmiyor" dönerse o bilgiyi BİLMİYORSUN: gün/tarih söyleme, "kontrol edip döneceğiz" de.
- Araçlarda OLMAYAN hiçbir şeyi uydurma: saat aralığı, kurye adı, rota sırası, kapasite bilgimiz YOK.
- Araçlar yalnız okur. Sipariş gününü değiştirmek, rotaya eklemek gibi bir işlem YAPAMAZSIN ve söz veremezsin.`;

const DRAFT_SYSTEM = `${IDENTITY}

Görevin: operatörün önüne konacak bir CEVAP TASLAĞI yazmak. Taslak onaylanmadan müşteriye GİTMEZ — son karar ve gönderim operatöründür.

${FACTS}
- Cevaplamak için eksik bilgi varsa taslağı "bilgiyi kontrol edip döneceğiz" ekseninde kur ya da müşteriye netleştirme sorusu sor — boşluk uydurma.

${TOOLS}

${STYLE}`;

const AGENT_SYSTEM = `${IDENTITY}

Görevin: müşterinin SON mesajına işletme adına DOĞRUDAN cevap vermek. Cevabın onaysız gönderilir — bu yüzden yalnız basit, bağlamdan kesin cevaplanabilen konularda konuş.

ŞU DURUMLARDA CEVAP VERME, action="handoff" seç:
- Para geçen HER konu: iade, tazminat, indirim, fatura itirazı, ödeme sorunu.
- Şikâyet: bozuk/eksik/yanlış ürün — değerlendirmeyi insan yapar.
- Sipariş değişikliği ya da iptali isteği.
- Öfke, tehdit, hukuki ifade ya da hassas kişisel durum.
- Bağlamdaki bilgiler soruyu KESİN cevaplamaya yetmiyorsa.
- Ve emin olmadığın HER durumda. Şüphe = devir; yanlış cevap, geç cevaptan pahalıdır.
handoffReason: operatörün okuyacağı TEK cümle, Türkçe ("Müşteri iade istiyor").

CEVAP VERİRSEN (action="reply"):
${FACTS}

${TOOLS}

${STYLE}`;

/**
 * Hibrit taslak (sınıf 1) — `ai_draft_reply` kolonunu doldurur; tüketen operatördür.
 * `standard` katman: taslak müşteriye gidecek metnin ta kendisi, ucuz modelin tonu operatöre
 * her seferinde baştan yazdırıyordu (çeviri gibi tek-doğrulu bir iş değil).
 */
export const ticketDraftTask: AiTask<SupportContextInput, TicketDraftReply> = {
  id: 'support.draft-reply',
  tier: 'standard',
  output: TicketDraftReplySchema,
  system: DRAFT_SYSTEM,
  // Taslak bir METİN işi: 0 her müşteriye aynı kalıbı yazar, yüksek değer her üretimde başka
  // konuşurdu. 0.4 "aynı bilgiyi farklı cümleyle" aralığı.
  temperature: 0.4,
  // Araçlı koşuda tavan (16.9): iki araç var, ikisini de çağırıp cevabı yazması için 4 adım yeter.
  // Tavan olmasaydı aynı aracı döngüyle çağıran bir model faturayı sessizce büyütürdü.
  maxSteps: 4,
  buildPrompt: buildSupportPrompt,
};

/**
 * Özerk ajan (sınıf 4) — kararı `TicketAgentDecision`: cevapla YA DA devret. Tutarlılığı çağıran
 * zorlar: `reply` boş bir "reply" kararı devir sayılır (şemanın künyesi).
 */
export const ticketAgentTask: AiTask<SupportContextInput, TicketAgentDecision> = {
  id: 'support.autonomous-reply',
  tier: 'standard',
  output: TicketAgentDecisionSchema,
  system: AGENT_SYSTEM,
  // Taslaktan DÜŞÜK: onaysız giden metinde tutarlılık yaratıcılıktan değerli.
  temperature: 0.2,
  maxSteps: 4,
  buildPrompt: buildSupportPrompt,
};

/**
 * Kanalın modele söylenen adı. `Record` KİLİTTİR: `ConversationSource` büyüdüğünde eksik anahtar
 * derlemeyi durdurur — kanal adı sessizce yanlış söylenmez (`SupportContextInput.channel` künyesi).
 *
 * Talep kanalının parantezi bilinçli: müşteri cevabı e-postadan okuyacak, yani ajan "hemen
 * dönüyoruz" derken sohbet hızını değil posta hızını vaat ediyor.
 */
const CHANNEL_LABELS: Record<'ticket' | ConversationSource, string> = {
  ticket: 'destek talebi (e-posta ile bildirilir)',
  whatsapp: 'WhatsApp',
  messenger: 'Facebook Messenger',
  instagram: 'Instagram DM',
};

/** İki görevin ortak girdi düzeni — bağlam önce, yazışma sonra, soru en sonda. */
function buildSupportPrompt(input: SupportContextInput): string {
  const order = input.order
    ? [
        'SİPARİŞ BAĞLAMI (doğrulanmış):',
        `- Referans: ${input.order.referenceNo ?? 'henüz yok'}`,
        `- Durum: ${input.order.statusLabel}`,
        `- Teslimat: ${input.order.deliveryDate ?? 'bilinmiyor'}`,
        `- Ödeme: ${input.order.paymentLabel ?? 'bilinmiyor'}`,
        `- Kalemler: ${input.order.items.map((item) => `${item.name} ×${item.qty}`).join(' · ') || 'okunamadı'}`,
      ].join('\n')
    : 'SİPARİŞ BAĞLAMI: yok — bu talep bir siparişe bağlı değil.';

  const thread = input.messages
    .map((message) => `[${message.who === 'customer' ? 'MÜŞTERİ' : message.who === 'staff' ? 'BİZ (personel)' : 'BİZ (AI)'}] ${message.text}`)
    .join('\n');

  return [
    `Kanal: ${CHANNEL_LABELS[input.channel]}.`,
    '',
    // Künye BAĞLAM olarak veriliyor, talimat olarak değil: model bunu ancak müşteri sorarsa söyler.
    `İŞLETME KÜNYESİ (müşteri sorarsa söyleyebilirsin): WhatsApp ${input.business.whatsapp} · e-posta ${input.business.email}.`,
    '',
    order,
    '',
    'YAZIŞMA (eskiden yeniye):',
    thread,
    '',
    'Müşterinin SON mesajına cevap hazırla.',
  ].join('\n');
}
