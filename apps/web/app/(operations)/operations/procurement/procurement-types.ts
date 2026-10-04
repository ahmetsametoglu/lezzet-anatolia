import type { Business, KeysetCursor, PurchaseOrderStatus } from '@lezzet/types';

// Tedarik ekranının görünüm modelleri — sunucu okur ve bu biçime indirger, ekran yalnız çizer.

/** Eşik altına düşmüş bir kalem — hangi deponun eşiği olduğunu SÖYLER (eşik depo bazlı, DOMAIN §17). */
export interface SuggestionLineView {
  variantId: string;
  /** "Fıstıklı Baklava · 500g" — ürün adı + boy etiketi. */
  title: string;
  /** Tedarikçideki sipariş kodu; eşleme yoksa null (satır yine listelenir — eksik olan eşlemedir). */
  supplierCode: string | null;
  /** Eşiği bu depoda deldi — belge/çip kodu (`STR`). */
  warehouseCode: string;
  availableQty: number;
  minStockQty: number;
  /** Eşiğe çıkaracak öneri (koli katına yuvarlı) — öneridir, sipariş admin'in. */
  suggestedQty: number;
  /** **Yolda**: gönderilmiş siparişlerden bu depoya bekleyen adet. Öneri bunu zaten düşmüştür. */
  incomingQty: number;
  /** **Taslakta**: açılmış ama GÖNDERİLMEMİŞ adet. Eşiğe girmez — satırın neden durduğunu açıklar. */
  draftQty: number;
  /** Hedefi yazılmamış açık siparişlerdeki adet — hiçbir depoya sayılmaz ama gizlenmez de. */
  unassignedQty: number;
  /**
   * Aynı varyantın başka depolardaki kullanılabilir miktarı, "sipariş yerine transfer" seçeneği için. Yargı taşınmaz, çünkü öteki
   * deponun eşiği bilinmez ve oradan mal çekmek onu eksiğe düşürebilir; boş dizi başka depoda yok demektir.
   */
  elsewhere: Array<{ code: string; qty: number }>;
}

/** Tedarikçiye gruplu öneri kartı — "tek dokunuş taslak" bu gruptan açılır. */
export interface SuggestionGroupView {
  /** null = tedarikçisi eşlenmemiş kalemler; sipariş açılamaz (motor reddeder), görünür kalır. */
  supplierId: string | null;
  supplierName: string;
  /** Bize tanınan vade (gün); null = peşin. Eşlenmemiş grupta null. */
  paymentTermDays: number | null;
  /** Satırların dokunduğu depo sayısı — kart metası ("2 depo"). */
  warehouseCount: number;
  lines: SuggestionLineView[];
}

/** Tedarikçi kartı — az sayıda beklenir (dev CRM değil, sayfa sözleşmesi §2). */
export interface SupplierCardView {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  vatNumber: string | null;
  /** ISO iki harf; bilinmiyorsa `null`. Faturanın KDV rejimi bundan önerilir. */
  country: string | null;
  note: string | null;
  /** null = peşin çalışılır. */
  paymentTermDays: number | null;
  /** Belgelerinin varsayılan işi; `null` iki işe birden satıyor demektir. */
  defaultBusiness: Business | null;
  /** Türetilen borç (cent): Σ alım − Σ ödeme; alım faturalardan okunur (`SupplierService.debt`). */
  debtCents: number;
  /** Bu yılki alım (cent) — faturalar + faturası henüz girilmemiş kabuller (`purchasedCents`, dönemli çağrı). */
  purchasedCents: number;
  /** Bu tedarikçiden yolda: gönderilmiş, henüz kapanmamış sipariş sayısı. */
  pendingOrderCount: number;
  isActive: boolean;
}

// Tedarikçi formunun şeması ortak bileşendedir (`components/operation/form/supplier-form/schema.ts`), çünkü asistanın tedarikçi
// önerisi aynı formu açar.

/**
 * Tedarik siparişi liste satırı — ham okuma (`PurchaseOrderRow`) + motorun özeti
 * (`summarizePurchaseOrder`) tek görünüm nesnesinde birleşmiş hâli.
 */
export interface PurchaseOrderRowView {
  id: string;
  /** Tedarikçi KİMLİĞİ — telefon/kart eşleşmesi adla değil bununla yapılır (ad tekil değildir). */
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  /** Siparişin açıldığı an (ISO) — satırın tarihi ve keyset sıralaması bu alandan. */
  createdAt: string;
  /** Gönderim damgası (ISO); null = henüz gönderilmedi. "Kaç gündür yolda" bundan okunur. */
  sentAt: string | null;
  itemCount: number;
  receivedItemCount: number;
  /** Σ adet × birim fiyat (cent). `missingPriceCount > 0` ise EKSİKTİR — ekran "≈" der. */
  totalCents: number;
  missingPriceCount: number;
  /** Malın fiilen indiği depolar — çoktan aza (motor sırası korunur). */
  byWarehouse: Array<{ code: string; qty: number }>;
}

/**
 * Ürün–kod eşlemesi (`supplier_product`) — tedarik siparişinin **tedarikçinin diliyle** yazılmasını
 * sağlayan satır (`DOMAIN §16`). Bizim varyantımız ↔ onun kodu, onun adı, kolisi, son alışı.
 */
export interface SupplierProductRowView {
  id: string;
  variantId: string;
  /** BİZİM adımız — "Fıstıklı Baklava · 500g". Eşleşmenin hangi ürüne ait olduğu buradan okunur. */
  title: string;
  /** ONUN kodu — sipariş listesinin anahtarı. */
  supplierCode: string;
  /** ONUN kataloğundaki adı; boş bırakılabilir (liste o zaman yalnız kodu taşır). */
  nameAtSupplier: string | null;
  /** Koli içi adet — "12 adet = 1 koli" çevirisi; boşsa liste yalnız adet yazar. */
  packQty: number | null;
  /** Son alış (cent) — mal kabulde güncellenir, elle girilmez. */
  lastPurchaseCents: number | null;
  /** Bir varyantın birden çok kaynağı olabilir; öneri TERCİHLİ olanı seçer. */
  isPreferred: boolean;
}

/** Eşleme formunda varyant seçicisinin seçeneği — dar okuma (fiyat/maliyet taşımaz, burada gereksiz). */
export interface VariantPickOption {
  variantId: string;
  title: string;
}

/**
 * Siparişin TEK KALEMİ — hem taslak düzenleyicisinin satırı hem kabul ilerlemesinin satırı.
 *
 * İkisi tek tip: aynı kalemin iki hâli (düzenlenebilir / okunur), iki ayrı tip yazmak aynı satırın
 * iki tanımını doğururdu ve biri gün gelip ötekinden ayrışırdı.
 */
export interface OrderLineView {
  /** `purchase_order_item.id` — düzenleme ve silme bu kimliğe bağlanır. */
  itemId: string;
  variantId: string;
  /** BİZİM adımız — "Fıstıklı Baklava · 500g". */
  title: string;
  /** ONUN kodu (sipariş anında donmuş eşlemeden); yoksa liste bizim adımızla gider. */
  supplierCode: string | null;
  qty: number;
  /** Beklenen alış (cent); null = fiyat girilmemiş — tutar EKSİKTİR (ekran "≈" der). */
  unitPriceCents: number | null;
  /** Hedef depo kodu; niyet beyanıdır, kısıt değil. `null` hedefsiz sipariş. */
  targetWarehouseCode: string | null;
  /** Fiilen giren adet (`purchase_order_progress`, ölçü `initial_qty`). */
  receivedQty: number;
  /** Hâlâ bekleyen adet; 0 = bu kalem kapandı. Fazla gelmişse de 0 (eksik sayılmaz). */
  missingQty: number;
}

/**
 * Sipariş penceresinin tam okuması, kalem kalem; kalemler ve tedarikçiye gidecek metin tek turda gelir, çünkü iki eylem iki
 * gidiş-geliş ve iki kez boş kalan pencere demekti.
 */
export interface OrderDetailView {
  id: string;
  supplierId: string;
  supplierName: string;
  /** WhatsApp yolunun anahtarı — tedarikçi KARTINDAN, satırın adından değil. */
  supplierPhone: string | null;
  status: PurchaseOrderStatus;
  createdAt: string;
  sentAt: string | null;
  note: string | null;
  lines: OrderLineView[];
  /**
   * Tedarikçiye kopyalanacak temiz liste (`printableList` + biçim) — metni SUNUCU kurar: kopyala,
   * WhatsApp ve yazdır aynı metni taşımalı, üç yerde biçimlenseydi üç farklı liste giderdi.
   */
  message: string;
}

/** Süzgeç ve elle sipariş için dar tedarikçi listesi — kart okuması (borç türetimi) burada fazla. */
export interface SupplierOption {
  id: string;
  name: string;
}

/** Elle siparişin hedef depo seçeneği — bağlam evreninden (kapsam dışı depo hiç görünmez). */
export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

export interface ProcurementData {
  /** Yalnız `suggestions` sekmesinde dolu (okuma sekmeye bağlı). */
  suggestions: SuggestionGroupView[] | null;
  /** Yalnız `suppliers` sekmesinde dolu. */
  suppliers: SupplierCardView[] | null;
  /** Yalnız `orders` sekmesinde dolu — ilk sayfa; devamı action ile eklenir. */
  orders: PurchaseOrderRowView[] | null;
  /** Sonraki sayfanın imleci (`null` = liste bitti). URL'e YAZILMAZ (CLAUDE.md §1). */
  ordersCursor: KeysetCursor | null;
  /** Gönderilmiş ve henüz kapanmamış sipariş sayısı — başlık altı ("yolda ne var"). */
  pendingOrderCount: number | null;
  /**
   * Tedarikçi seçenekleri, sipariş sekmesinin süzgeci ve elle sipariş penceresi için; kart okumasından ayrıdır, çünkü kart borç türetir
   * ve süzgeç yalnız ad ister.
   */
  supplierOptions: SupplierOption[] | null;
  /** Elle siparişin hedef depo seçenekleri — yalnız sipariş sekmesinde okunur. */
  warehouseOptions: WarehouseOption[] | null;
  /**
   * Sunucunun günü (YYYY-AA-GG) — "kaç gündür yolda" bundan sayılır.
   *
   * İstemcide `new Date()` çağrılmaz: client bileşen sunucuda da render ediliyor ve gece yarısını
   * geçen bir istekte iki taraf farklı gün üretir (sipariş ekranının `today` deseni).
   */
  today: string;
}
