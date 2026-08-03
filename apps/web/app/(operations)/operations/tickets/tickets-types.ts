import { z } from 'zod';
import { TicketTypeEnum, type KeysetCursor, type TicketStatus } from '@lezzet/types';
import type { StaffTicketDetail, TicketQueueItem } from '@/lib/ticket/ticket-types';
import type { TicketFilterKey, TicketsUrlState } from './tickets-url';

// Talepler ekranının SAYFAYA-ÖZEL tipleri (16.3).
//
// Kuyruk satırı ve detay TİPLERİ burada YENİDEN yazılmaz: veri kapısının sözleşmesi
// (`lib/ticket/ticket-types`) iki yüzeyin ortak tanımıdır ve ekran onun üstüne yalnız SUNUM
// bilgisini ekler (CLAUDE.md §1: view-model şemadan türer).

/** Kuyruk satırı + yalnızca ekranın ihtiyacı olan tek türetme: satırın yaşı. */
export interface TicketRowView extends TicketQueueItem {
  /**
   * Son mesajın üstünden geçen dakika — **sunucuda** hesaplanır.
   *
   * İstemcide `Date.now()` okunsaydı ilk boyama sunucunun ürettiğinden farklı çıkar ve hidrasyon
   * uyuşmazlığı doğardı (`agoLabel` künyesi).
   */
  ageMinutes: number;
}

/** Sunucudan gelen ekran verisi. */
export interface TicketsData {
  rows: TicketRowView[];
  nextCursor: KeysetCursor | null;
  /**
   * Kapanmamış talep sayısı — **tüm kuyruk üzerinden** (`countOpenTickets`), yüklenmiş sayfadan
   * değil. Sayfadan saymak, kuyruk sayfalı olduğu için tam da sayının anlam kazandığı yerde
   * (kalabalık kuyrukta) yalan söylerdi.
   *
   * Çizim üç sayı istiyor ("3 açık · 2 işlemde · 1 AI yürütüyor"); elde yalnız bu var. Durum başına
   * sayım arka uçtan istendi (`operasyon-ekranlari-arka-uc-talebi.md §8b`) — gelene kadar alt satır
   * bildiği tek sayıyı söyler, üçünü uydurmaz.
   */
  openCount: number;
  /** Seçili talebin detayı; seçim yoksa ya da talep silinmişse null. */
  detail: TicketDetailView | null;
}

/**
 * Detay + tek türetme: talebin AÇILIŞ yaşı (künyedeki "açıldı 12 dk önce").
 *
 * Satır yaşıyla aynı gerekçeyle sunucuda hesaplanır — istemcide `Date.now()` okumak hidrasyon
 * uyuşmazlığı demek (`TicketRowView.ageMinutes`).
 */
export type TicketDetailView = StaffTicketDetail & { openedAgoMinutes: number };

/** Web/mobil dallarının ORTAK sözleşmesi — durum ağacı client kökünde, sunum burada çatallanır. */
export interface TicketsViewProps {
  data: TicketsData;
  urlState: TicketsUrlState;
  /** Süzgeç/seçim turu sürüyor — çip iyimser vurgulanır, kuyruk soluklaşır. */
  navPending: boolean;
  /** Yazma işlemi sürüyor (cevap, durum, devral, iade) — düğmeler kilitlenir. */
  busy: boolean;
  /** Son yazma denemesinin reddi; ekranın müşteriye değil OPERATÖRE söyleyeceği cümle. */
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onFilter: (f: TicketFilterKey) => void;
  onSelect: (id: string) => void;
  /** Mobilde alt tabakayı kapatır (adresten seçimi düşürür). */
  onCloseDetail: () => void;
  /** Cevabı gönderir; `true` dönerse yazma kutusu temizlenir (gönderilmiş metni silmemek için). */
  onReply: (body: string) => Promise<boolean>;
  onStatus: (to: TicketStatus) => void;
  onTakeOver: () => void;
  onTriggerReturn: () => void;
  onNewTicket: () => void;
}

/**
 * Elle talep açma formu (`admin-talepler.md §3`).
 *
 * Alanlar arka ucun beklediğinden TÜRETİLDİ (`openTicket`), çünkü pencerenin içi çizilmemiş —
 * karar `design/BACKLOG.md`'de bekliyor. İşaretli kalemler bilerek yok: brief "müşteri + varsa
 * sipariş" diyor, kalem işaretlemek müşterinin şikâyetini somutlaştırma aracıdır ve operatör
 * telefonda konuşurken kalem kimliğiyle uğraşmaz — gerekirse siparişten görülür.
 */
export const ManualTicketSchema = z.object({
  customerId: z.string().uuid(),
  type: TicketTypeEnum,
  /** Operatörün konuşmadan aktardığı anlatım — talebin ilk mesajı. Boş olamaz. */
  body: z.string().trim().min(1),
  /** Başlık isteğe bağlı: müşteri yazmaz, operatör konuşmayı bir cümleyle etiketleyebilir. */
  subject: z.string().trim().max(200).optional(),
  orderId: z.string().uuid().nullish(),
});

/**
 * Elle talep penceresindeki sipariş seçicisinin kapı sınırı.
 *
 * Seçici SAYFALI DEĞİL ve bilerek: bu bir liste ekranı değil, telefonda konuşurken açılan bir
 * seçicidir — operatör "geçen haftaki sipariş" diyor, üç ay öncesini aramıyor.
 *
 * Sayı BURADA duruyor çünkü iki taraf da onu kullanıyor: kapı listeyi bu sayıyla kesiyor, pencere
 * de "son 20 sipariş" diye YAZIYOR. Ayrı ayrı yazılsalardı biri değiştiğinde ekrandaki cümle sessizce
 * yalan olurdu (`CLAUDE.md §1`).
 */
export const TICKET_ORDER_OPTION_LIMIT = 20;

/** Elle talep penceresindeki sipariş seçicisinin bir satırı. */
export interface TicketOrderOption {
  id: string;
  /** Müşterinin bildiği numara ("LZA-2451"); henüz üretilmemişse kimliğin başı. */
  label: string;
  /** İkinci satır — teslim günü ve durumu; aynı müşterinin iki siparişini ayırt eder. */
  hint: string;
}
