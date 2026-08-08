import { one, oneOf, type RawParams } from '@/lib/url-params';

// WhatsApp konuşma izleme ekranının URL SÖZLEŞMESİ (15.5) — iki soru taşır: **hangi kuyruğa
// bakıyorum** ve **hangi konuşma açık**.
//
// Seçili konuşma adreste durur, çünkü bu ekranın en sık paylaşılan şeyi bir SOHBETTİR ("şuna bir
// bak") ve talep ekranı da buraya konuşma kimliğiyle bağlanıyor (`whatsappLink`). Ayrıca detayı
// sunucunun okumasını sağlar: seçim istemcide tutulsaydı her tıklama bir istemci turuna, mesaj
// geçmişi de ikinci bir çağrıya kalırdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan bağlantı kuyruğun ortasından başlamamalı.

export const WHATSAPP_PATH = '/operations/whatsapp';

/**
 * Çip şeridi — İKİ çip, çünkü arka uçta süzülebilen tek eksen `awaitingReply` ve çizimin başlığı da
 * o sayıyı öne çıkarıyor (*"3 cevap bekliyor"*).
 *
 * Çizimin ikinci sayısı (*"1 AI yürütüyor"*) ve ona karşılık gelecek çip bilerek YOK: ajan yazılmadı
 * (15.8/15.13), yani bugün her konuşma zaten insanda ve çip daima boş liste döndürürdü — çalışıyormuş
 * gibi duran ama hiçbir şey bulamayan bir süzgeç (Talepler ekranının "AI yanıtladı" çipiyle aynı
 * gerekçe).
 */
export const WHATSAPP_FILTERS = ['all', 'awaiting'] as const;
export type WhatsappFilterKey = (typeof WHATSAPP_FILTERS)[number];

export const WHATSAPP_FILTER_LABELS: Record<WhatsappFilterKey, string> = {
  all: 'Tümü',
  awaiting: 'Cevap bekliyor',
};

export interface WhatsappUrlState {
  /** Kuyruk çipi. */
  f: WhatsappFilterKey;
  /** Açık konuşmanın kimliği; boş = seçim adreste taşınmıyor. */
  c: string;
}

/**
 * Varsayılan çip **"Tümü"**, "cevap bekliyor" DEĞİL — ve bu Talepler'den bilinçli bir ayrım.
 *
 * Talep kuyruğunda açık talep bir iş kalemidir, kapanmışı görmek istisnadır. Konuşmada öyle değil:
 * ekranın adı "izleme" ve operatör buraya çoğu zaman **belirli bir sohbeti okumaya** gelir (talep
 * ekranından, müşteri kartından). Varsayılan süzgeç "cevap bekliyor" olsaydı, cevaplanmış bir
 * konuşmanın bağlantısı boş bir kuyrukla açılırdı.
 */
const DEFAULTS: WhatsappUrlState = { f: 'all', c: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL → ekran durumu. Tanınmayan çip sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz).
 *
 * Kimlik BİÇİMİ burada elenir, VARLIĞI değil: uydurma bir dizgeyle okuma turuna çıkmanın karşılığı
 * yok. Var olmayan ama biçimi doğru bir kimlik okuma katmanında `null` döner ve orta pano "konuşma
 * bulunamadı" der.
 */
export function parseWhatsappUrl(params: RawParams): WhatsappUrlState {
  const c = one(params.c).trim();
  return {
    f: oneOf(params.f, WHATSAPP_FILTERS, DEFAULTS.f),
    c: UUID.test(c) ? c : DEFAULTS.c,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function whatsappUrl(state: WhatsappUrlState): string {
  const p = new URLSearchParams();
  if (state.f !== DEFAULTS.f) p.set('f', state.f);
  if (state.c) p.set('c', state.c);
  const qs = p.toString();
  return qs ? `${WHATSAPP_PATH}?${qs}` : WHATSAPP_PATH;
}

/**
 * BAŞKA ekranlardan buraya köprü — bugün Talepler kullanıyor (`ticket.conversationId`).
 *
 * Bağlantı kuyruk süzgeci TAŞIMAZ: dışarıdan gelen operatör belirli bir sohbeti okumaya geliyor ve
 * "cevap bekliyor" süzgecine düşseydi, cevaplanmış bir konuşmanın bağlantısı boş kuyruk açardı.
 */
export function whatsappLink(conversationId: string): string {
  return whatsappUrl({ ...DEFAULTS, c: conversationId });
}
