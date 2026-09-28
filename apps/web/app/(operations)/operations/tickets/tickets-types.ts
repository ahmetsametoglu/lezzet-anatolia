import { z } from 'zod';
import { TicketTypeEnum, type KeysetCursor, type TicketHandler, type TicketStatus } from '@lezzet/types';
import type { CustomerContextData } from '@/lib/customer/context';
import type { StaffTicketDetail, TicketQueueItem } from '@/lib/ticket/ticket-types';
import type { TicketFilterKey, TicketsUrlState } from './tickets-url';

// Kuyruk satırı ve detay tipleri burada yeniden yazılmaz: `lib/ticket/ticket-types` iki yüzeyin ortak sözleşmesidir, ekran
// üstüne yalnız sunum bilgisini ekler.

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
   */
  counts: Record<TicketStatus, number>;
  /** Çizimin "N AI'da" sayısı: cevabı insanın yazmadığı (ai + hibrit) kapanmamış talepler. */
  aiCount: number;
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
  /** Yürütücü modu: human · hybrid · ai. */
  onMode: (mode: TicketHandler) => void;
  /** Hibrit taslağı tüket — `send=false` metni döndürür, ekran cevap kutusuna taşır. */
  onConsumeDraft: (send: boolean) => Promise<string | null>;
  /** Taslağı istek üzerine üret — hibritte taslak yokken. */
  onSuggestDraft: () => void;
  onTakeOver: () => void;
  onTriggerReturn: () => void;
  onNewTicket: () => void;
}

/**
 * Elle talep açma formu; pencerenin içi çizilmediği için alanlar `openTicket`in beklediğinden türetildi. Kalem işaretleme yok,
 * çünkü telefonda konuşan operatör kalem kimliğiyle uğraşmaz; gerekirse siparişten görülür.
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
 * Elle talep penceresindeki sipariş seçicisinin sınırı; seçici sayfalı değil, çünkü telefondaki operatör son siparişleri arar. Sayı
 * burada, çünkü kapı listeyi bununla keser ve pencere "son 20 sipariş" diye yazar.
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
