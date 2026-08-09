import { z } from 'zod';
import { TicketTypeEnum, type KeysetCursor, type TicketStatus } from '@lezzet/types';
import type { CustomerContextData } from '@/lib/customer/context';
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
   * Durum başına talep sayısı — **tüm kuyruk üzerinden** (`countTicketsByStatus`), yüklenmiş
   * sayfadan değil. Sayfadan saymak, kuyruk sayfalı olduğu için tam da sayının anlam kazandığı
   * yerde (kalabalık kuyrukta) yalan söylerdi.
   *
   * Çizimin üçüncü sayısı ("1 AI yürütüyor") HÂLÂ YOK ve bilerek: `16.5` inene kadar her talep
   * `human`, yani o sayaç daima 0 gösterirdi — ekranda "AI çalışmıyor" değil "AI yok" diye okunurdu
   * ve ikisi ayrı şeydir. Kırılım 16.5 ile birlikte gelir.
   */
  counts: Record<TicketStatus, number>;
  /** Seçili talebin detayı; seçim yoksa ya da talep silinmişse null. */
  detail: TicketDetailView | null;
  /**
   * Seçili talebin müşterisinin BAĞLAMI — ORTAK okuma (`lib/customer/context`), WhatsApp ekranı da
   * aynısını kullanıyor. Detayın içinde DEĞİL, yanında: `StaffTicketDetail` talebin kendi
   * sözleşmesidir ve müşteri geçmişini oraya sokmak, talep okumasını her açılışta genişletirdi.
   */
  context: CustomerContextData | null;
}

/**
 * Detay + tek türetme: talebin AÇILIŞ yaşı (künyedeki "açıldı 12 dk önce").
 *
 * Satır yaşıyla aynı gerekçeyle sunucuda hesaplanır — istemcide `Date.now()` okumak hidrasyon
 * uyuşmazlığı demek (`TicketRowView.ageMinutes`).
 */
export type TicketDetailView = StaffTicketDetail & { openedAgoMinutes: number };

/** Masaüstü görünümünün sözleşmesi — durum ağacı client kökünde. */
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
