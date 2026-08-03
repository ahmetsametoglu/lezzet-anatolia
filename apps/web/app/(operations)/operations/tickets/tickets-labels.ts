import type { TicketSender, TicketSource, TicketStatus, TicketType } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';

// Talepler ekranının SÖZLÜĞÜ ve RENK EŞLEMESİ (16.3).
//
// Tür ve durum ADLARI burada YOK — onlar enum'un yanında (`TICKET_TYPE_LABELS`,
// `TICKET_STATUS_LABELS`), çünkü `Record` eksik anahtarda derlemeyi durdurur ve yeni bir değer
// eklendiğinde karşılığını yazmak unutulamaz. Burada kalan, o adların bu YÜZEYDEKİ görünümü.

/**
 * Tür → ton. Çizimin renkleri (`.dc.html`): bozuk kırmızı, eksik amber, soru mavi, diğer nötr.
 *
 * Renk keyfi değil ağırlık söylüyor: bozuk/eksik iade kararına gider (para işi), soru çoğu zaman
 * tek cevapla kapanır. Kuyruğu tarayan operatör hangisinin para işi olduğunu okumadan görmeli.
 */
export const TICKET_TYPE_TONE: Record<TicketType, OpsTone> = {
  damaged: 'red',
  missing: 'amber',
  question: 'blue',
  other: 'neutral',
};

/**
 * Durum → ton. Açık amber (bekliyor), ilgileniliyor mavi (elde), çözüldü olive (yolunda).
 * Çizimle birebir.
 */
export const TICKET_STATUS_TONE: Record<TicketStatus, OpsTone> = {
  open: 'amber',
  in_progress: 'blue',
  resolved: 'olive',
};

/**
 * Geliş yolu — talebin künyesindeki "nereden geldi" cümlesi.
 *
 * `admin` çizimde YOK ve olması gerekiyordu: personelin elle açtığı talep de bir geliş yoludur.
 * Adlandırılmasaydı künye o talepte boş kalır ya da yanlış bir yol söylerdi (ön inceleme 8).
 */
export const TICKET_SOURCE_LABELS: Record<TicketSource, string> = {
  order: 'sipariş detayından',
  form: 'genel formdan',
  whatsapp: "WhatsApp'tan",
  admin: 'elle açıldı',
};

/**
 * Yazışmada kim konuştu.
 *
 * `admin` için **"Siz" DEĞİL**: çizim "Selim A. (siz)" yazıyor ama mesaj görünümü yazarın kimliğini
 * taşımıyor (`TicketMessageView`) — ve taşısa bile bir meslektaşın yazdığı cevaba "siz" demek yanlış
 * olurdu. Ayrım gerçekten gereken yerde duruyor: müşteri ↔ operasyon ↔ AI. Sapma
 * `design/BACKLOG.md`'de kayıtlı.
 */
export const TICKET_SENDER_LABELS: Record<TicketSender, string> = {
  customer: 'Müşteri',
  admin: 'Operasyon',
  ai: 'AI ajanı',
};

/**
 * Mesaj balonunun tonu. AI ayrı bir tondadır çünkü ayrımın tek amacı bu: "bunu kim söyledi"
 * sorusu sonradan da cevaplanabilmeli (`admin-talepler.md §6`).
 *
 * Çizim AI'ı morla ayırıyor; palette mor YOK ve ham hex yasak (`CLAUDE.md §3`) — en yakın ayrık ton
 * `slate` kullanıldı, kayıt `design/BACKLOG.md`'de.
 */
export const TICKET_SENDER_TONE: Record<TicketSender, OpsTone> = {
  customer: 'neutral',
  admin: 'olive',
  ai: 'slate',
};

/** İade düğmesi kapalıysa sebebi — düğmenin gizlenmesi yerine SÖYLENMESİ (kapalı bir kapı da bilgidir). */
export const RETURN_BLOCKED_REASON: Record<'no_order' | 'already_triggered', string> = {
  no_order: 'Bu talep bir siparişe bağlı değil — iade akışının başlatılacağı bir sipariş yok.',
  already_triggered: 'İade bu talepten zaten başlatıldı. Sonucu siparişin iade akışında yürüyor.',
};
