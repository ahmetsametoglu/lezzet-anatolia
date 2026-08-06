import type { CourierStop } from '@/lib/courier/day';
import type { Order, OrderItem } from '@lezzet/types';

// Kapıdaki tek durağın görünüm modeli (11.2/11.3/11.4).

/**
 * Kalem satırı — **şemadan türetilir, elle yazılmaz** (CLAUDE.md §1). Alan adları `OrderItem`'ınkiyle
 * BİREBİR aynı kalıyor ve bu bilinçli: ekran tahsil edilecek tutarı motora sorarken bu satırları
 * olduğu gibi veriyor (`derivePaymentStatusForOrder`). Adları burada güzelleştirseydik (ör.
 * `lineDiscountCents`) çağrıdan önce bir eşleme yazmak gerekirdi — motorun künyesi de tam bunu
 * yasaklıyor: "girdi EŞLEMESİ motorda durur, çağıranlarda değil".
 */
export type DeliveryLineView = Pick<
  OrderItem,
  'id' | 'qty' | 'fulfilledQty' | 'unitPriceCents' | 'lineDiscountAmountCents'
> & {
  /** "Fıstıklı Baklava · 1 kg" — operasyon künyesi (ortak `readVariantTitles`). */
  title: string;
};

/** Kapıda seçilebilen üç yöntem. Online ve havale kuryenin eline HİÇ girmez (11.3). */
export type DoorMethod = 'cash' | 'card' | 'cheque';

export interface DeliveryStopView {
  /** Gün listesindeki durağın kendisi — adres, telefon, "yoldayım", kanal. İkinci kez okunmaz. */
  stop: CourierStop;
  /** Rota sırası (0 tabanlı) — kurye "kaçıncı duraktayım" diye düşünür, sipariş numarasıyla değil. */
  index: number;
  referenceNo: string | null;
  /**
   * Motorun türetim için istediği sipariş alanları — fazlası YOK. Maliyet, kâr, marj ve müşterinin
   * borç durumu bu modele hiç girmiyor (tasarım §6): ekran isteseydi bile gösteremez.
   */
  order: Pick<Order, 'shippingFeeCents' | 'status' | 'totalCents'>;
  /** Bugüne kadar tahsil edilmiş / iade edilmiş net (**cent**) — türetimin ikinci girdisi. */
  amounts: { collectedCents: number; refundedCents: number };
  lines: DeliveryLineView[];
  /**
   * Bu kanalda imza/fotoğraf zorunlu mu — **ekranın kararı değil, GÖSTERİMİ**. Gerçek kapı
   * `confirmDoorDelivery`'nin içindedir ve orada yeniden sorulur; buradaki kopya yalnız kuryeye
   * kapıya varmadan "burada imza istenecek" diyebilmek için.
   */
  proofRequired: boolean;
  /** Nakit yasal uyarı eşiği (**cent**) — canlı uyarı için; engel değil (DOMAIN §7). */
  cashLimitCents: number;
  /** Kapı tahsilatının yazılacağı hesap. Ayarda seçilmemişse `null` — tahsilat yazılamaz. */
  doorAccountId: string | null;
}

/**
 * Kapıdaki ekranın sözleşmesi. **Tip burada durur, istemcide değil:** düzen dosyası tipi istemciden
 * alsaydı istemci de düzeni içe aktardığı için halka doğardı (`boundaries`/`no-circular`).
 */
export interface DeliveryViewProps {
  view: DeliveryStopView;
  /** Kalem başına kapıda VERİLEN adet — yazılmamış satır bugünkü karşılananı sürdürür. */
  given: Record<string, number>;
  onGiven: (lineId: string, qty: number) => void;
  method: DoorMethod;
  onMethod: (method: DoorMethod) => void;
  /** Kutudaki tutar (euro) — türetilen tutarla başlar, kurye değiştirebilir. */
  amountEuros: number;
  /** `null` → "tutara dön": kutu yeniden motorun türetimini izler. */
  onAmount: (euros: number | null) => void;
  /** Motorun türettiği tahsil edilecek tutar (**cent**) — ekranda HESAPLANMAZ. */
  dueCents: number;
  /** Sipariş yolda mı; değilse kapıdaki hiçbir sonuç yazılamaz. */
  onTheWay: boolean;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onConfirm: () => void;
  onUndelivered: (outcome: 'unreachable' | 'refused', note: string | null) => void;
}
