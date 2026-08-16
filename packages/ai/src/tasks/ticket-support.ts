import { TicketAgentDecisionSchema, TicketDraftReplySchema, type TicketAgentDecision, type TicketDraftReply } from '@lezzet/types';
import type { AiTask } from '../types';

/**
 * **MÜŞTERİ DESTEĞİ GÖREVLERİ** (16.5 · 20.4) — hibrit taslak (sınıf 1) ve özerk ajan (sınıf 4).
 *
 * ── TİCARİ DEĞER MODELE SORULMAZ, MODELE VERİLİR ────────────────────────────
 * Sınıf 4'ün kırmızı çizgisi "stok/fiyat/durum domain-core'dan" (20 §sınıflar). Burada araç
 * çağırma (function calling) YOK ve bilinçli: talebin cevaplanabilir sorularının bağlamı (sipariş
 * durumu, teslim günü, kalemler, ödeme) uygulama katmanında ZATEN deterministik okunuyor ve girdiye
 * yazılıyor — modelin arayacağı bir şey kalmıyor. Araç kataloğu, modelin NE arayacağını önceden
 * bilemediğimiz gün (WhatsApp satış ajanı 15.8: katalog/stok sorgusu) gerekir ve orada tanımlanır.
 * "Fiziksel engel ilkesi" burada girdinin tipiyle sağlanıyor: girdide olmayan sayı cevapta olamaz —
 * olursa uydurmadır ve prompt bunu açıkça yasaklıyor.
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
  channel: 'ticket' | 'whatsapp';
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
  "Strazburg'da Türk mutfağından donmuş gıda satan bir e-ticaret işletmesinin müşteri destek hattındasın. Müşteriler B2C (ev) ve B2B (restoran/dükkân) olabilir.";

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
- Tarih/gün bağlamda yazıyorsa aynen kullan; yazmıyorsa "teslimat gününüzü kontrol edip döneceğiz" de.`;

const DRAFT_SYSTEM = `${IDENTITY}

Görevin: operatörün önüne konacak bir CEVAP TASLAĞI yazmak. Taslak onaylanmadan müşteriye GİTMEZ — son karar ve gönderim operatöründür.

${FACTS}
- Cevaplamak için eksik bilgi varsa taslağı "bilgiyi kontrol edip döneceğiz" ekseninde kur ya da müşteriye netleştirme sorusu sor — boşluk uydurma.

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
  buildPrompt: buildSupportPrompt,
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
    `Kanal: ${input.channel === 'whatsapp' ? 'WhatsApp' : 'destek talebi (e-posta ile bildirilir)'}.`,
    '',
    order,
    '',
    'YAZIŞMA (eskiden yeniye):',
    thread,
    '',
    'Müşterinin SON mesajına cevap hazırla.',
  ].join('\n');
}
