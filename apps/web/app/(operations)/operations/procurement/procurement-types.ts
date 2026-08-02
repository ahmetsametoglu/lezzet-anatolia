import { z } from 'zod';
import { SupplierInsertSchema, type KeysetCursor, type PurchaseOrderStatus } from '@lezzet/types';

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
  note: string | null;
  /** null = peşin çalışılır. */
  paymentTermDays: number | null;
  /** Türetilen borç (cent): Σ girişler − Σ ödemeler. */
  debtCents: number;
  /** Toplam alım (cent). Tasarım "bu yıl" istiyor — dönemli toplam arka uç talebinde (bilinçli sapma). */
  intakeTotalCents: number;
  /** Bu tedarikçiden yolda: gönderilmiş, henüz kapanmamış sipariş sayısı. */
  pendingOrderCount: number;
  isActive: boolean;
}

/**
 * Tedarikçi formunun girdisi — **varlık şemasından türetilir** (elle interface yazılmaz, CLAUDE.md §1).
 * `contact` serbest JSON'u formda üç adlı alana açılır; birleştirme `saveSupplierAction`'da.
 */
export const SupplierFormSchema = SupplierInsertSchema.omit({ contact: true }).extend({
  /** Boşsa yeni kayıt. */
  id: z.string().uuid().optional(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  isActive: z.boolean(),
});
export type SupplierFormInput = z.infer<typeof SupplierFormSchema>;

/**
 * Tedarik siparişi liste satırı — ham okuma (`PurchaseOrderRow`) + motorun özeti
 * (`summarizePurchaseOrder`) tek görünüm nesnesinde birleşmiş hâli.
 */
export interface PurchaseOrderRowView {
  id: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  /** Siparişin açıldığı an (ISO) — satırın tarihi ve keyset sıralaması bu alandan. */
  createdAt: string;
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
}
