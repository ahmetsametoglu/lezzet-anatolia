import type { Carrier, DeliveryType, OrderStatus } from '@lezzet/types';

// Sevkiyatçının gün planının görünüm modeli (09.15) — `design/pages/admin-teslimat.md`.

/** Hazırlık kademeleri. `returned` bir hazırlık hâli değil ama satırın AKIBETİ ve gizlenmemeli. */
export type PrepStage = 'not_started' | 'preparing' | 'ready' | 'delivered' | 'returned';

/**
 * Günün bir çıkışı. **Rota ve kargo AYNI tipi paylaşıyor** çünkü ikisi de aynı soruya cevap veriyor:
 * "bugün bu müşteriye ne gidiyor, hazır mı, kimde". Ayrıştıkları yer alanların DOLULUĞU — kargoda
 * taşıyıcı/takip dolu ve kapıda tahsilat hiç yok (K37), rotada tersi. İki ayrı tip yazmak, ortak
 * olan on alanı iki kez yazmak olurdu.
 */
export interface DispatchStopView {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  address: string | null;
  deliveryType: DeliveryType;
  status: OrderStatus;
  /**
   * Hazırlık kademesi — DÖRT hâl, iki değil (tasarımın kendi sözlüğü: Hazır · Hazırlanıyor · Hazır
   * değil · Teslim). İkiye indirmek "hiç başlanmamış" ile "depoda hazırlanıyor"u aynı gösterirdi;
   * oysa sevkiyatçının kararı tam olarak bu farkta: biri beklemeye değer, öteki müdahale ister.
   *
   * Hazırlık DEPO ekranının işi; burada yalnız OKUNUR (tasarım §6).
   */
  prep: PrepStage;
  courierId: string | null;
  /** Atanmamışsa `null`; gün başında normal, araç çıkarken kalmamalı. */
  courierName: string | null;
  /** Kapıda tahsil edilecek (**cent**); `null` = önceden ödenmiş. Kargoda HER ZAMAN null (K37). */
  dueAmountCents: number | null;
  /**
   * Kaç kalem. **Kalem DÖKÜMÜ bilerek yok:** kutuyu araçtan alan kurye ve onun ekranı zaten taşıyor
   * (`CourierStop.contentSummary`). Aynı cümleyi burada ikinci kez kurmak, `day.ts`'teki özetleyicinin
   * kopyası olurdu — ve sevkiyatçının sorusu içerik değil: "hazır mı, kimde, hangi bölgeden".
   */
  itemCount: number;
  /** Kargo künyesi — yalnız OKUNUR; girişi hazırlık ekranının kaydıdır (07.12, tasarım §2). */
  carrier: Carrier | null;
  trackingNumber: string | null;
}

/** Günün servis edilen bölgesi — satırların altında toplandığı başlık. */
export interface DispatchZoneView {
  id: string;
  name: string;
  warehouseName: string;
  stops: DispatchStopView[];
}

export interface DispatchDayView {
  date: string;
  /** Sunucunun "bugün"ü — gün seçicinin etiketleri buna göre ("Bugün"/"Yarın"). */
  today: string;
  /** Araçla giden — bölgeye göre gruplu. Bölgesi çözülemeyenler son gruba düşer. */
  zones: DispatchZoneView[];
  /**
   * **Kargo KUYRUĞU — günün listesi değil.** `delivery_date` kargoda şema gereği NULL'dur
   * (`0012_order.sql`: *"rota günü; kargoda null"*), çünkü kargoda teslim tarihi bizim vaadimiz
   * değil taşıyıcınındır. Gün süzgeciyle okunsaydı bu bölüm hiçbir zaman satır döndürmezdi — ölü
   * bir bölüm, üstelik "bugün kargo yok" diye YALAN söyleyen bir bölüm olurdu.
   *
   * Doğrusu bir kuyruk: **hazırlanmış ve henüz taşıyıcıya verilmemiş** paketler. Tasarım §2 farkı
   * zaten yazıyor ("kargonun günü rotanınkinden farklı çalışır… ekran bu farkı gizlemez") — ekran
   * da gizlemiyor, kuyruk olduğunu söylüyor.
   */
  shipping: DispatchStopView[];
  /** Kuyruk tavana dayandı mı — sessiz kırpma yok, ekran "daha var" diyebilmeli. */
  shippingTruncated: boolean;
  /** Atama listesi — `listByRole('courier')`. */
  couriers: { id: string; name: string }[];
  summary: {
    total: number;
    ready: number;
    /** Yalnız ROTA çıkışlarında anlamlı: kargonun kuryesi olmaz. */
    unassigned: number;
    doorCents: number;
    doorCount: number;
  };
  /**
   * Kesim saatinin o güne etkisi (tasarım §2): **liste kesinleşti mi, hâlâ büyüyebilir mi.**
   * Saat ayarlardan gelir ve burada DEĞİŞTİRİLMEZ; ekran yalnız etkisini gösterir.
   */
  cutoff: { time: string; settled: boolean };
  /** Siparişin taşınabileceği yaklaşan günler — motordan (`upcomingDeliveryDates`), bölge başına. */
  moveDatesByZone: Record<string, string[]>;
}

export interface DispatchViewProps {
  day: DispatchDayView;
  /** Toplu atama için seçili sipariş kimlikleri. */
  selected: string[];
  onToggle: (orderId: string) => void;
  onSelectZone: (zoneId: string) => void;
  onAssign: (courierId: string | null) => void;
  onMove: (orderId: string, date: string) => void;
  onDate: (date: string) => void;
  busy: boolean;
  error: string | null;
}
