// Sipariş detayının view-model'leri: satır tutarı, kalan, ödeme durumu ve iade tutarı hesaplanmış hâliyle girer, ekranda formül
// yoktur. Para her yerde kuruş.
import type { OrderBoxTrace } from '@lezzet/application';
import type { OrderDecision } from '@lezzet/domain-core';
import type { TrustView } from '@/lib/customer/trust';
import type {
  DeliveryType,
  DoorCheck,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDisposition,
  ShipmentStatus,
  VatTreatment,
} from '@lezzet/types';

/** Kalem satırı — paket grubunun içindeyse `bundleId` dolu gelir. */
export interface OrderLineView {
  id: string;
  title: string;
  /** Boy etiketi ya da ürün notu; yoksa boş. */
  sub: string;
  /** Ürün görseli (public URL) — görselsiz üründe `null`, ekran yer tutucu ikon çizer. */
  imageUrl: string | null;
  /**
   * Müşteri ürün sayfasının slug'ı — YALNIZ satıştaki (aktif) üründe dolu. Pasif/aday ürünün
   * müşteri sayfası yoktur (404); köprüsüz kalem ad olarak düz metin kalır.
   */
  productSlug: string | null;
  /** Ürünün çözülmüş adı — kalemdeki LOT köprüsünün stok arama anahtarı (stok adla arar). */
  productName: string;
  qty: number;
  /** Fiziksel olarak giden adet — `qty`'den azsa eksik gitmiştir. */
  fulfilledQty: number;
  unitPriceCents: number;
  /** Sepet indiriminin bu kaleme düşen payı (kalemin TAMAMI için, kuruş). */
  lineDiscountCents: number;
  vatRate: number;
  /** Satır tutarı — SİPARİŞ EDİLEN adet üzerinden, indirim düşülmüş. Eksik gitmişse ÜSTÜ ÇİZİLİR. */
  lineTotalCents: number;
  /**
   * Satırın ödenecek tutarı — karşılanan adet üzerinden, indirim payı o orana bölünmüş. Ayrı alan, çünkü ekran sipariş edileni
   * üstü çizili ve ödeneceği yanında gösterir; tek sayı ikisinden birini kaybettirirdi.
   */
  payableCents: number;
  /** Paketten geldiyse paketin kimliği; tek tek alınmış kalemde `null` (DOMAIN §13). */
  bundleId: string | null;
  /** İade edildiyse malın akıbeti — stok hareketini besleyen karar. */
  returnDisposition: ReturnDisposition | null;
  /**
   * Teslim sonrası iadede varsayılan imha mı: donuk ürünün soğuk zinciri belgelenemediği için imha edilir (DOMAIN §8). Karar
   * motorun (`defaultsToDiscardOnReturn`), ki eşiğin `frozen` olduğu tek yerde yazılı kalsın.
   */
  defaultsToDiscard: boolean;
  /** Hangi partilerden çıktı (geri çağırma izi); hazırlanmamış siparişte boş. */
  batchNos: string[];
}

/** Paket grubu — kalemleri kendi başlığı altında toplar. */
export interface OrderBundleGroup {
  bundleId: string;
  name: string;
  lineIds: string[];
  totalCents: number;
}

/** Toplam satırı — ekran hesaplamaz, hazır gelir. */
export interface OrderTotalLine {
  label: string;
  amountCents: number;
  /**
   * `sum` ara toplam · `deduction` düşülen · `note` hesaba girmeyen bilgi (içindeki KDV) · `grand` sipariş toplamı · `refund`
   * geri ödenen. İade toplamın altında, çünkü siparişin tutarını değil paranın akıbetini anlatır.
   */
  kind: 'sum' | 'deduction' | 'note' | 'grand' | 'refund';
}

/** Para hareketi — tahsilat ya da iade; hangi hesaptan, ne zaman. */
export interface OrderMovementView {
  id: string;
  when: string;
  /** "Tahsilat" · "İade" — hareketin türü müşteri diliyle. */
  kind: string;
  accountName: string;
  amountCents: number;
  /** İade mi (ekranda eksi ve kırmızı). */
  isRefund: boolean;
}

/**
 * Zaman çizelgesi adımı; `skipped` olan gerçekleşmemiştir ama görünür kalır. Siparişe açılan talep de çizelgeye girer, ki
 * teslimden sonra gelen şikâyet sırasından koparılmasın.
 */
export interface OrderTimelineStep {
  key: string;
  label: string;
  /** Geçişi yapan kişi; sistem olayında boş. */
  who: string;
  /** Gerçekleşme anı; atlanan adımda boş. */
  when: string | null;
  skipped: boolean;
  /** Ana hattın dışına çıkan adım (iptal/iade) — çizelgede sapma olarak durur. */
  offPath: boolean;
  /** Dikkat isteyen ama sapma olmayan olay (açılan talep) — amber. */
  warn: boolean;
  /** Kaydın ŞU AN durduğu adım; kapanmış siparişte hiçbiri. */
  current: boolean;
}

/**
 * "Bağlar" kartının satırı — bu siparişin başka bir kayda değdiği yer. Tek kart, çünkü operatörün sorusu tek: bu sipariş başka
 * nereye dokunuyor.
 */
export interface OrderLinkView {
  key: string;
  /** Kaydın kısa kimliği — talep türü ya da parti numarası (mono, sönük). */
  ref: string;
  /** Durum rozeti metni ve tonu. */
  state: string;
  tone: 'amber' | 'olive' | 'slate' | 'red';
  title: string;
  /** Bağın NE İŞE YARADIĞINI söyleyen tek satır; boşsa satır çizilmez. */
  note: string;
  /** Kayda giden yol. Hedef ekran HENÜZ YOKSA `null` — olmayan sayfaya davet edilmez. */
  href: string | null;
  cta: string;
}

/** "Finansal" kartının satırı (rol kapılı, `OrderFinanceView`); gider satırları pozitif taşınır, eksi işareti gösterimin işidir. */
export interface OrderFinanceRow {
  label: string;
  amountCents: number;
  /**
   * `estimate` = henüz sabitlenmemiş, **kâra girmeyen** maliyet (parti alışından tahmin). Ayrı bir
   * tür, çünkü kapanışta yazılacak sayıyla aynı güvende değil ve ekran ikisini aynı gösteremez.
   */
  kind: 'sale' | 'expense' | 'estimate';
}

/**
 * Tek siparişin kâr okuması — merkezî kârlılık motorunun (`orderContribution`) ekran karşılığı. Sipariş detayı kendi kâr formülünü
 * yazmaz, yoksa aynı siparişin kârı bu sayfada ve raporda ayrı çıkardı.
 */
export interface OrderFinanceView {
  rows: OrderFinanceRow[];
  /** Katkı payı: ciro − doğrudan giderler. Maliyetler kapanışta sabitlenmemişse `null`. */
  profitCents: number | null;
  /** Katkı payının ciroya oranı (%) — kârlılık raporuyla AYNI tanım. Kâr yoksa `null`. */
  marginPercent: number | null;
  /** Kâr neden hesaplanmıyor — kart susmaz, bilmediğini söyler. Hesaplanıyorsa `null`. */
  costNote: string | null;
}

/**
 * Teslim kanıtı — "eksik geldi" ihtilafının dayanağı. Şekil tek kaynakta (`DeliveryProofRecordSchema`), okuma tek kapıdan
 * (`readDeliveryProof`), ki yazan ile okuyan alan adlarında ayrışamasın.
 */
export interface DeliveryProofView {
  when: string | null;
  /** Kapıda teslim ALAN kişi — B2B'de "kim imzaladı" ihtilafın asıl cevabıdır. */
  receivedBy: string | null;
  /** Kanıt türü — imza çizimi · kapı fotoğrafı · kutu okutması (görselsiz, kodların kendisi kanıt). */
  kind: 'signature' | 'photo' | 'box_scan';
  /** Süreli imzalı adres (15 dk, private kova); kalıcı bağlantı değil, saklanmaz. `null` = kova yok ya da anahtar ölü. */
  imageUrl: string | null;
}

/** Sağ rayın müşteri kartı: kim, ne kadar borcu var, limiti ne. */
export interface CustomerContextView {
  id: string;
  name: string;
  meta: string;
  /** Ham numara — WhatsApp ve arama bağlantısı bundan kurulur (biçimlemek ekranın işi değil). */
  phone: string | null;
  isCompany: boolean;
  /** Vade tanımlıysa dolu; peşin müşteride `null` (kart o zaman yalnız kimliği taşır). */
  credit: {
    openBalanceCents: number;
    limitCents: number | null;
    /** Gecikme varsa gün sayısı ve vade günü; yoksa `null`. */
    overdueDays: number | null;
    dueDate: string | null;
  } | null;
}

/**
 * İadenin çıkacağı yol — **gerçek hesaplardan** kurulur, uydurma bir menüden değil.
 *
 * Varsayılan "paranın girdiği hesap"tır: iade kuralı zaten öyle diyor (`lib/order/refund`), ekran
 * onu yeniden karar vermez, yalnız gösterir ve gerekirse saptırır.
 */
export interface RefundRouteView {
  accountId: string;
  label: string;
  sub: string;
  /** Para bu hesaptan girmişti — seçim buradan başlar. */
  isDefault: boolean;
  /** Yolun bugün yapamadığı şey (ör. karta dönüş çağrısı yok); yoksa boş. */
  caveat: string;
}

/** Siparişin tam kaydı — sayfanın tek veri kaynağı. */
export interface OrderDetailView {
  id: string;
  referenceNo: string | null;
  invoiceNo: string | null;
  customerName: string;
  channel: 'b2c' | 'b2b';
  status: OrderStatus;
  source: OrderSource;
  isGift: boolean;
  placedAt: string;

  lines: OrderLineView[];
  bundles: OrderBundleGroup[];
  totals: OrderTotalLine[];
  /**
   * Hazırlık kesinleşti mi (`isFulfillmentSettled`). **Kalem tablosunun okunuşunu bu belirler:**
   * `false` iken `fulfilledQty` bir eksiklik değil, henüz yazılmamış bir sayıdır — ekran "eksik
   * gitti" diyemez, "hazırlanmadı" der.
   */
  fulfillmentSettled: boolean;

  payment: {
    status: PaymentStatus;
    method: PaymentMethod | null;
    onAccount: boolean;
    totalCents: number;
    collectedCents: number;
    refundedCents: number;
    /** Tahsil edilmeyi bekleyen tutar — kısmi karşılamada düşmüş hâli (motor hesabı). */
    openCents: number;
    /** Peşin ödenmişse iade edilecek fark. */
    refundDueCents: number;
    dueDate: string | null;
    overdue: boolean;
    /**
     * Siparişin KDV rejimi — tutarın hangi tabanda okunacağını söyler: B2B fiyatı KDV hariçtir, ters yükümlülükte vergi hiç
     * yoktur. Etiket kanal ve rejim ikilisinden `moneyCells`te kurulur.
     */
    vatTreatment: VatTreatment;
  };
  movements: OrderMovementView[];

  timeline: OrderTimelineStep[];
  /** Motorun izin verdiği geçişler — ekran YALNIZ bunları sunar. */
  allowedNext: OrderStatus[];
  /** Motorun izin verdiği kararlar (`allowedDecisions`) — geçişten ayrı eksen. */
  decisions: OrderDecision[];
  /** İade kararının para yolları; iade açık değilse boş. */
  refundRoutes: RefundRouteView[];

  delivery: {
    /**
     * Geniş küme, `pickup` dahil: yerinde satış da bir sipariştir. Dar bırakılsaydı ekran tezgâh satışına olmayan bir teslimat günü
     * ve kurye alanı gösterirdi.
     */
    type: DeliveryType;
    date: string | null;
    address: string;
    /**
     * Adresin kapısı doğrulandı mı — sipariş anındaki kopyadan okunur, adres kaydından değil, çünkü sipariş eski hâliyle yola
     * çıktı. Sevkiyat masası aynı olguyu sayı olarak gösterir; eylemin yeri burası, operatör telefonu buradan açar.
     */
    doorCheck: DoorCheck;
    /**
     * Adrese giden kişi, sipariş anındaki kopyadan; hesap sahibi değil, çünkü kapıda kimlik bu adla karşılaştırılır. `fromAccount`
     * hesap adına düşüldüğünü ekranda söyler; `phone` yalnız adresin telefonudur, `null` = ad çözülemedi.
     */
    recipient: { name: string; phone: string | null; fromAccount: boolean } | null;
    courierName: string | null;
    /** Hangi gerçekleşen seferle gitti — SF kodu; `null` = henüz sefere bağlanmadı. */
    runReference: string | null;
    proof: DeliveryProofView | null;
    /**
     * Siparişin çıktığı depo — künye bilgisidir, kontrol değil: depo adresten türemiştir, buradan değiştirilmez. `null` yalnız ad
     * çözülemediğinde.
     */
    warehouse: { code: string; name: string } | null;
    /**
     * Kutu izi — mühür, yükleme ya da devir, kapıda okutma; kaynak paketin `listOrderBoxes` kapısı, ki mobil de aynı yerden okusun.
     * Boş dizi = kutu açılmadı; işlem burada yok, kutu mobilde açılır ve kapanır.
     */
    boxes: OrderBoxTrace[];
    /**
     * Kargo gönderisi, müşteri yüzeyiyle aynı kapıdan (`readOrderTracking`), ki iki taraf aynı numarayı görsün; `null` = rota
     * siparişi ya da duyurulmamış kargo. Boş `parcels` = duyuruldu ama taşıyıcı numarayı henüz atamadı.
     */
    shipment: {
      carrierName: string | null;
      /** Gönderi durumu; elle girilen numarada `null` — o yolda gönderi satırı yok. */
      status: ShipmentStatus | null;
      parcels: ReadonlyArray<{ boxNo: number; totalBoxes: number; trackingNumber: string; trackingUrl: string | null }>;
    } | null;
  };

  customer: CustomerContextView;
  /** Müşterinin güven puanı ve son hareketleri — tavsiyedir, hiçbir kararı kendisi vermez. */
  trust: TrustView;
  links: OrderLinkView[];
  /**
   * Kâr okuması, rol kapılı: bugün sayfanın kendisi yalnız yöneticiye açık. Sayfa başka rollere açılırsa kapı buraya taşınır, alan
   * `null` gelir ve kart çizilmez.
   */
  finance: OrderFinanceView | null;
}
