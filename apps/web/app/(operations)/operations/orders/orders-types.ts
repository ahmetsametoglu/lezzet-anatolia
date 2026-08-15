// Sipariş ekranı view-model'leri (09.7) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: vadesi geçti mi, ne kadarı açık, izinli
// geçişler neler. Client yeniden hesaplasaydı "gecikmiş" tanımı iki yerde yaşardı — biri checkout
// frenine, biri ekrana ait iki ayrı gerçek.
//
// Para ekranda hep KURUŞ (STACK §8). Sipariş tutarları KDV DAHİL toplamdır (müşterinin ödediği).
import type {
  Channel,
  DeliveryType,
  KeysetCursor,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@lezzet/types';
import type { OrderDetailView } from './[id]/order-detail-types';
import type { OrdersUrlState } from './orders-url';

/** Satırın para yüzü — tek bakışta "bu siparişten para geldi mi, gelecek mi, ne zaman". */
export interface OrderPaymentView {
  status: PaymentStatus;
  method: PaymentMethod | null;
  /** Vadeli mi — vade bir yöntem değil, siparişin bayrağıdır (DOMAIN §7). */
  onAccount: boolean;
  /** Vadeli siparişin ödeme günü (YYYY-AA-GG); vadesiz siparişte `null`. */
  dueDate: string | null;
  /** Henüz tahsil edilmemiş tutar (kuruş) — motorun `openAmountCents` tanımı. */
  openCents: number;
  /** Vadesi geçmiş mi — checkout freniyle AYNI kural (`isOverdue`). */
  overdue: boolean;
}

/** Sipariş listesinin satırı. */
export interface OrderRow {
  id: string;
  /** Müşteriye söylenen numara. `null` = henüz üretilmedi (yalnız ilk kalıcı durumdan önce). */
  referenceNo: string | null;
  customerName: string;
  /** Şirket adı ya da telefon — aynı adlı iki müşteriyi ayırt etmenin en kısa yolu. */
  customerHint: string;
  channel: Channel;
  status: OrderStatus;
  source: OrderSource;
  /** Kalem sayısı ve toplam adet — "6 koli" yerine sistemin bildiği gerçek. */
  itemCount: number;
  unitCount: number;
  /** Paketten gelen kalem var mı — satırın içeriği tek tek alınmış gibi okunmasın (DOMAIN §13). */
  hasBundle: boolean;
  totalCents: number;
  deliveryType: DeliveryType;
  /** Rota günü (YYYY-AA-GG); kargoda `null`. */
  deliveryDate: string | null;
  /** Adresin sipariş anındaki kopyasından semt/şehir — nereye gittiği listede okunsun. */
  deliveryArea: string;
  /** Kurye atanmış mı — rota gününde "kim götürüyor" sorusu listede yanıtlanır. */
  courierId: string | null;
  courierName: string | null;
  payment: OrderPaymentView;
  /** Hediye sipariş (patron ikramı) — muhasebe export'una girmez, operasyonu normaldir. */
  isGift: boolean;
  createdAt: string;
  /** Bu durumdan gidilebilecek durumlar — motor söyler, ekran YALNIZ bunları sunar (ORDER_LIFECYCLE). */
  allowedNext: OrderStatus[];
  /**
   * Siparişin çıktığı depo (19.5) — bir sipariş tek depodan çıkar, istisnasız (DOMAIN §17).
   * `null` yalnız ad çözülemediğinde; satır o zaman depo söylemez, yanlış depo söylemez.
   */
  warehouse: { code: string; name: string } | null;
}

/** Listenin depo ekseni — sütun çizilir mi, süzgeç var mı, hangi depoya süzülü (19.5). */
export interface OrdersWarehouseView {
  /** Satırlarda depo sütunu görünür mü (kural 4: yalnız çok depolu bakışta). */
  showColumn: boolean;
  /** Süzgeç kontrolü çizilir mi (kural 2: yalnız bağlam "tüm depolar" iken). */
  available: boolean;
  /** Süzgeç uygulandıysa hangi depo. */
  active: { id: string; code: string; name: string } | null;
  /** Adresten gelen ama bağlama uymadığı için düşen kod (kural 7) — sessiz düşme yok. */
  dropped: string | null;
  options: Array<{ id: string; code: string; name: string }>;
}

/**
 * Başlık sayaçları ve alt şerit — **süzgecin TAMAMINA** aittir, yüklenmiş sayfaya değil
 * (`order_counts()`). Sayfadan sayılsaydı liste uzadıkça yalan söylerdi.
 */
export interface OrderCountsView {
  /** Duruma göre adet; sekmede sıfırsa anahtar hiç yoktur. */
  byStatus: Partial<Record<OrderStatus, number>>;
  total: number;
  totalCents: number;
  /** Kapıda tahsil edilecek tutar ve kaç siparişte olduğu. */
  codCount: number;
  codOpenCents: number;
}

/**
 * Hızlı bakışın satırda OLMAYAN kısmı — açılınca çekilir.
 *
 * Detay view-model'inden TÜRETİLİR, kopyalanmaz: pencerede görünen adres ile sayfada görünen adres
 * aynı okumadan gelmezse, ikisi bir gün ayrışır.
 */
export type OrderPeek = Pick<
  OrderDetailView,
  'lines' | 'payment' | 'delivery' | 'customer' | 'links' | 'fulfillmentSettled'
>;

/** RSC'nin client'a geçirdiği tüm veri. */
export interface OrdersData {
  rows: OrderRow[];
  nextCursor: KeysetCursor | null;
  counts: OrderCountsView;
  warehouse: OrdersWarehouseView;
}

/** orders-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir. */
export interface OrdersViewProps {
  rows: OrderRow[];
  counts: OrderCountsView;
  warehouse: OrdersWarehouseView;
  urlState: OrdersUrlState;
  onFilter: (patch: Partial<OrdersUrlState>) => void;
  search: string;
  onSearch: (q: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * `loadingMore`dan AYRI: o listenin KUYRUĞU, bu listenin TAMAMININ yenilenmesi.
   */
  navPending: boolean;
  onLoadMore: () => void;
  /** Satırın hızlı bakış diyaloğunu aç. */
  onOpen: (orderId: string) => void;
}
