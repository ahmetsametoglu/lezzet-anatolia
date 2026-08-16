import { TICKET_STATUS_LABELS } from '@lezzet/types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Talepler ekranının URL SÖZLEŞMESİ (16.3) — iki soru taşır: **hangi kuyruğa bakıyorum** ve
// **hangi talep açık**.
//
// Seçili talep adreste durur çünkü bu ekranın en sık paylaşılan şeyi bir TALEPTİR ("şuna bir bak").
// Ayrıca detayı sunucunun okumasını sağlar: seçim istemcide tutulsaydı her tıklama bir istemci
// turuna, yazışma da ikinci bir çağrıya kalırdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan bağlantı kuyruğun ortasından başlamamalı.

export const TICKETS_PATH = '/operations/tickets';

/**
 * Çip şeridi — **çizimdeki dört çip** (`Operasyon - Talepler.dc.html`).
 *
 * Beşincisi ("AI yanıtladı") bilerek YOK: `16.5` yazılmadı, bugün her talep `human` ve çip daima
 * boş liste döndürürdü — çalışıyormuş gibi duran ama hiçbir şey bulamayan bir süzgeç. Buna karşılık
 * arka uçta hazır olup çizimde bulunmayan iki süzgeç var (`awaitingReply`, `type`); uydurulmadılar,
 * karar `design/BACKLOG.md`'de bekliyor (03.08).
 *
 * Şerit TEK SEÇİMLİ ve eksenleri karışık (üçü durum, biri sipariş bağı) — çizimin kendi kararı.
 */
export const TICKET_FILTERS = ['open', 'in_progress', 'resolved', 'with_order', 'ai', 'ai_answered'] as const;
export type TicketFilterKey = (typeof TICKET_FILTERS)[number];

/**
 * Çip adları — durum adları TEK KAYNAKTAN (`TICKET_STATUS_LABELS`), burada yeniden yazılmaz.
 *
 * İki AI çipi (16.5'in kalanı, 16.08'de indi) İKİ AYRI soruyu sorar ve karıştırılmaları bir
 * hataydı (build 16 künyesi): "AI'da" ŞU AN kimin yürüttüğü (`handledBy` — ai VE hibrit; ekran
 * ikisini ayrı rozetle zaten gösteriyor), "AI yanıtladı" ise AI'ın HİÇ konuşup konuşmadığı
 * (`answeredByAi` — devralınmış talep de bu kümededir, kalite denetimi tam ona bakar).
 * Metin "yanıtladı", "yanıtlıyor" değil: bir kez true olan bir daha false olmaz.
 */
export const TICKET_FILTER_LABELS: Record<TicketFilterKey, string> = {
  ...TICKET_STATUS_LABELS,
  with_order: 'Siparişli',
  ai: "AI'da",
  ai_answered: 'AI yanıtladı',
};

export interface TicketsUrlState {
  /** Kuyruk çipi. */
  f: TicketFilterKey;
  /** Açık talebin kimliği; boş = seçim adreste taşınmıyor. */
  t: string;
}

const DEFAULTS: TicketsUrlState = { f: 'open', t: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL → ekran durumu. Tanınmayan çip sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz).
 *
 * Kimlik BİÇİMİ burada elenir, VARLIĞI değil: uydurma bir dizgeyle okuma turuna çıkmanın karşılığı
 * yok. Var olmayan ama biçimi doğru bir kimlik okuma katmanında `null` döner ve detay panosu "talep
 * bulunamadı" der — silinmiş bir talebin bağlantısına tıklayan operatörün hak ettiği cevap budur.
 */
export function parseTicketsUrl(params: RawParams): TicketsUrlState {
  const t = one(params.t).trim();
  return {
    f: oneOf(params.f, TICKET_FILTERS, DEFAULTS.f),
    t: UUID.test(t) ? t : DEFAULTS.t,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function ticketsUrl(state: TicketsUrlState): string {
  const p = new URLSearchParams();
  if (state.f !== DEFAULTS.f) p.set('f', state.f);
  if (state.t) p.set('t', state.t);
  const qs = p.toString();
  return qs ? `${TICKETS_PATH}?${qs}` : TICKETS_PATH;
}

// BAŞKA ekranlardan buraya köprü (`admin-talepler.md §5`: sipariş detayı, müşteri detayı, WhatsApp
// izleme) HENÜZ YOK — o ekranlar bağlantıyı kurduğunda `settingsLink` gibi bir `ticketsLink`
// yardımcısı da burada doğar. Bugün yazılsaydı çağıranı olmayan bir dışa verim olurdu (`knip`).
