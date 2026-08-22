// Sipariş DETAYI view-model'leri (09.7 · tasarım "Operasyon - Siparis Detay").
//
// Sözleşmenin ilk maddesi burada karşılığını bulur: **türetilmiş alan yazılmaz**. Satır tutarı,
// kalan, ödeme durumu, iade tutarı — hepsi hesaplanır ve view-model'e hesaplanmış hâliyle girer;
// ekranda formül yoktur, operatör onaylar.
//
// Para her yerde KURUŞ (STACK §8).
import type { OrderDecision } from '@lezzet/domain-core';
import type {
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDisposition,
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
  /** Satır tutarı — sipariş edilen adet üzerinden, indirim düşülmüş (KDV dahil taban). */
  lineTotalCents: number;
  /** Paketten geldiyse paketin kimliği; tek tek alınmış kalemde `null` (DOMAIN §13). */
  bundleId: string | null;
  /** İade edildiyse malın akıbeti — stok hareketini besleyen karar. */
  returnDisposition: ReturnDisposition | null;
  /**
   * **Teslim sonrası iadede varsayılan İMHA mı** (16.08) — `product.storage_type === 'frozen'`.
   *
   * `DOMAIN §8` bunu baştan yazıyordu (*"teslim edilmiş ve sonra iade edilen donuk ürün, soğuk
   * zinciri belgelenemediği için varsayılan olarak imha edilir — restok yalnız admin istisnasıdır"*)
   * ama kural UYGULANAMIYORDU: hangi ürünün donuk olduğunu söyleyen bir alan yoktu ve iade penceresi
   * her kalemde `restock`tan başlıyordu — kuralın tam tersi. Saklama rejimi alanı (`0005`) o boşluğu
   * kapattı.
   *
   * Karar motorun (`defaultsToDiscardOnReturn`), ekranın değil: eşiğin `frozen` olduğu tek yerde
   * yazılı kalsın.
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
   * `sum` = ara toplam · `deduction` = düşülen (eksi, amber) · `note` = hesaba GİRMEYEN bilgi
   * satırı (içindeki KDV) · `grand` = sipariş toplamı · `refund` = toplamdan sonra geri ödenen
   * (eksi, kırmızı). Sonuncusu bilinçli olarak toplamın ALTINDA: iade siparişin tutarını değil,
   * paranın akıbetini anlatır.
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
 * Zaman çizelgesi adımı. `skipped` olan gerçekleşmemiştir ama görünür kalır.
 *
 * Çizelge yalnız DURUM geçişlerinden ibaret değil: siparişe açılan talep de kaydın başına gelen bir
 * şeydir ve zaman içinde yerini bulmalı — "teslim edildi"nin bir gün sonrasına düşen bir şikâyet,
 * ayrı bir kartta durduğunda sıradan koparılmış olurdu.
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
 * "Bağlar" kartının satırı — bu siparişin BAŞKA bir kayda değdiği yer: açılmış talep, çıkmış parti.
 *
 * İki ayrı kart yerine tek kart, çünkü operatörün sorusu tek: "bu siparişin başka nereye dokunduğu
 * var mı?" Talep ile parti izi ayrı kartlarda dursaydı, ikisi de boşken sağ rayda iki boşluk kalır,
 * ikisi de doluyken hangisine önce bakılacağı ekranın değil kartların sırasına bağlı olurdu.
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

/**
 * "Finansal" kartının satırı — satış, gider, kâr. Rol kapılı kart (bkz. `OrderFinanceView`).
 * Gider satırları POZİTİF taşınır; eksi işareti gösterimin işidir.
 */
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
 * Tek siparişin kâr okuması — **merkezî kârlılık motorunun (`orderContribution`, 12.6) ekran
 * karşılığı**. Sipariş detayı kendi kâr formülünü YAZMAZ: yazsaydı aynı siparişin kârı bu sayfada
 * bir, kârlılık raporunda başka çıkardı ve hangisinin doğru olduğu tartışılırdı.
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
 * Teslim kanıtı — "eksik geldi" ihtilafının dayanağı.
 *
 * **Alanlar 07.08'de DEĞİŞTİ ve sebebi bir arızaydı** (arka uç şeridinin ölçümü): bu görünüm
 * `signature` · `photos[]` · `note` · `by` okuyordu, yazan taraf ise `kind` · `imageKey` ·
 * `receivedBy` · `courierId` yazıyordu. Ortak tek alan `at` idi — yani `parts` her zaman boş,
 * `by` her zaman `null` ve **kanıt görseli hiç açılamıyordu.** İki taraf da kendi içinde tutarlı
 * olduğu için hiçbir yerde hata vermiyordu; ekran "kanıt var" diyor, neyin var olduğunu
 * söyleyemiyordu. Açılamayan bir sigorta, olmayan sigortadır.
 *
 * Şekil artık tek kaynakta (`DeliveryProofRecordSchema`) ve okuma tek kapıdan (`readDeliveryProof`);
 * yanlış alan adı bugün derleme hatası.
 */
export interface DeliveryProofView {
  when: string | null;
  /** Kapıda teslim ALAN kişi — B2B'de "kim imzaladı" ihtilafın asıl cevabıdır. */
  receivedBy: string | null;
  /** Kanıt türü — imza çizimi mi kapı fotoğrafı mı. */
  kind: 'signature' | 'photo';
  /**
   * SÜRELİ imzalı adres (15 dk, private kova). `null` = kova yapılandırılmamış ya da anahtar ölü.
   * Kalıcı bir bağlantı DEĞİL: ekranda saklanmaz, paylaşılmaz.
   */
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
  };
  movements: OrderMovementView[];

  timeline: OrderTimelineStep[];
  /** Motorun izin verdiği geçişler — ekran YALNIZ bunları sunar. */
  allowedNext: OrderStatus[];
  /** Motorun izin verdiği KARARLAR (`allowedDecisions`) — geçişten ayrı eksen. */
  decisions: OrderDecision[];
  /** İade kararının para yolları; iade açık değilse boş. */
  refundRoutes: RefundRouteView[];

  delivery: {
    type: 'route' | 'shipping';
    date: string | null;
    address: string;
    /**
     * Adrese GİDEN kişi — sipariş anındaki kopyadan (`address_snapshot.recipient`), hesap sahibi
     * DEĞİL. Kargo künyesi adsız üretilemez (taşıyıcıların hepsinde zorunlu alan) ve teslim
     * noktasında kimlik BU adla karşılaştırılır; hediye ya da iş adresinde o ad hesabınkinden
     * başkasıdır ve yanlış ad paketi iade ettirir.
     *
     * `fromAccount: true` = adreste alıcı yazılı değil, hesap sahibinin adına düşüldü. Bayrak
     * EKRANDA yazılır: geri düşüşü sessizce yapmak, tahmin edilmiş bir adı ölçülmüş gibi
     * okuturdu (CLAUDE §1). `phone` yalnız ADRESİN telefonudur — hesabınkine düşmez, çünkü kapıda
     * aranacak numara hesap sahibininki olmak zorunda değil; yoksa satır hiç çizilmez.
     *
     * Tümü `null`: ne kopyada alıcı var ne hesabın adı çözülebildi.
     */
    recipient: { name: string; phone: string | null; fromAccount: boolean } | null;
    courierName: string | null;
    /** Hangi GERÇEKLEŞEN seferle gitti (18.08) — SF kodu; `null` = henüz sefere bağlanmadı. */
    runReference: string | null;
    proof: DeliveryProofView | null;
    /**
     * Siparişin çıktığı depo — KÜNYE bilgisidir, kontrol değil (19.5): sipariş tek depodan çıkar ve
     * o depo adresten türemiştir, buradan değiştirilmez. `null` yalnız ad çözülemediğinde.
     */
    warehouse: { code: string; name: string } | null;
  };

  customer: CustomerContextView;
  links: OrderLinkView[];
  /**
   * Kâr okuması — **rol kapılı**. Bugün sayfanın kendi kapısı `requireAdmin` olduğu için kart
   * yönetici dışına zaten çıkmıyor; sayfa depo/kurye rollerine açıldığı gün kapı BURAYA taşınır
   * (alan `null` gelir, ekran kartı hiç çizmez).
   */
  finance: OrderFinanceView | null;
}
