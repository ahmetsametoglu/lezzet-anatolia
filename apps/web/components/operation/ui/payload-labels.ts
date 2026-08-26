import type { Locale } from '@lezzet/i18n';
import {
  ALLERGEN_LABELS,
  DECLARATION_GAP_LABELS,
  type DeclarationGap,
  type ProductAllergen,
} from '@lezzet/types';

/**
 * DİLEKÇE KÜNYESİNİN SÖZLÜKLERİ — `payload-tree`nin saf yarısı (26.08'de ayrıldı).
 *
 * ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
 * Ayrım bir düzen tercihi değil, TEST edilebilirlik: bu depoda jsdom yok ve bilinçle yok
 * (`vitest.config.ts` künyesi), yani `.tsx` bir dosya birim testinden import EDİLEMİYOR. Künyenin
 * dili bir görünüm ayrıntısı değil bir sözdür — *"operasyon yüzeyinde makine adı görünmez"* — ve
 * söz ancak sınanabildiği yerde durur. Bileşen bu dosyayı import ediyor; kural tek yerde.
 *
 * Sözlüklerin İÇERİĞİ burada YENİDEN yazılmıyor: alerjen ve eksik-beyan karşılıkları
 * `@lezzet/types`ten geliyor (`CLAUDE §1`) — aynı kelimeler müşteri yüzeyinde de görünmeli.
 */

/**
 * Şema ENUM'larının okunur karşılığı — **alan adı + değer** çiftiyle eşleşir (12.08).
 *
 * Künye "dilekçenin okunur hâli" diyor ama enum alanlarını ham basıyordu: para hareketinde
 * "Yön: out", "Tür: expense" yazıyor, hemen üstündeki künye satırı ise aynı şeye "Hesaptan çıktı"
 * diyordu — aynı ekranda iki dil. Eşleşme yalnız değere bakmıyor, çünkü aynı kelime başka bir
 * alanda başka anlama gelebilir ("type" hem hareket türü hem indirim türü).
 *
 * Sözlükte olmayan enum ham kalır ve bu bilinçli: uydurma bir çeviri, olmayan bir alanı varmış
 * gibi gösterirdi. Karşılıklar formların kendi sözlüklerinden geliyor (`MANUAL_TYPE_VIEW`,
 * `discount-form`) — burada yeniden ADLANDIRMA yapılmıyor, aynı kelimeler kullanılıyor.
 */
export const ENUM_LABEL: Record<string, Record<string, string>> = {
  direction: { in: 'Hesaba girdi', out: 'Hesaptan çıktı' },
  type: {
    // para hareketi (`MANUAL_TYPE_VIEW` ile aynı kelimeler)
    expense: 'Gider',
    capital: 'Sermaye',
    misc: 'Sınıflandırılmadı',
    transfer: 'Transfer',
    // indirim
    percent: 'Yüzde',
    fixed: 'Sabit tutar',
  },
  trigger: { coupon: 'Kupon kodu', automatic: 'Otomatik' },
  scope: { cart: 'Sepetin tamamı', category: 'Kategori', collection: 'Koleksiyon' },
  target: { category: 'Kategori', collection: 'Koleksiyon', bundle: 'Paket' },
};

/**
 * Kimliğin ADINI hangi alan taşıyor — künye satırının gizlenip gizlenmeyeceğini bu belirler (26.08).
 *
 * Varsayılan kalıp `<x>Id → <x>Name` ve çoğu payload'da doğru; burada yalnız SAPMALAR duruyor.
 * Varyantın kendi adı yok (ürünün adı + boy etiketi), deponun adı künyelerde koduyla geçiyor.
 * Kalıp tek başına yetmediği için ekranda `Variant id 9a955167…` satırları görünüyordu — hemen
 * altlarında aynı şeyi söyleyen `Ürün` satırıyla birlikte.
 */
export const ID_TWIN: Record<string, readonly string[]> = {
  variantId: ['variantName', 'productName', 'product'],
  warehouseId: ['warehouseName', 'warehouseCode'],
  accountId: ['accountName'],
  counterAccountId: ['counterAccountName'],
  supplierId: ['supplierName', 'counterpartyName'],
  zoneId: ['zoneName'],
};

/**
 * Alan adlarının okunur karşılığı — sözlükte olmayan anahtar kelimelere ayrılıp yazılır.
 *
 * **Kimlik alanları da burada ve olmaları şart (26.08):** türetme camelCase'i ayırmakla yetiniyor
 * (`batchId` → "Batch id"), yani sözlükte olmayan bir İNGİLİZCE anahtar ekranda İngilizce kalıyor.
 * Operasyon yüzeyi Türkçe (`CLAUDE §2`) ve türetme bunu kendiliğinden sağlayamaz. İkizi olan
 * kimlikler zaten gizleniyor; buradakiler ikizi OLMAYANLAR için — görünürlerse Türkçe görünsünler.
 */
const FIELD_LABEL: Record<string, string> = {
  // kimlikler (ikizi olmayan; ikizi olanlar `ID_TWIN` ile gizleniyor)
  id: 'Kimlik',
  batchId: 'Parti kimliği',
  variantId: 'Varyant kimliği',
  warehouseId: 'Depo kimliği',
  supplierId: 'Tedarikçi kimliği',
  categoryId: 'Kategori',
  productId: 'Ürün kimliği',
  orderId: 'Sipariş kimliği',
  accountId: 'Hesap kimliği',
  counterAccountId: 'Hedef hesap kimliği',
  zoneId: 'Bölge kimliği',
  // ortak
  name: 'Ad',
  description: 'Açıklama',
  reason: 'Gerekçe',
  note: 'Not',
  category: 'Kategori',
  categoryName: 'Kategori',
  scopeName: 'Kapsam',
  warehouseCode: 'Depo',
  supplierName: 'Tedarikçi',
  accountName: 'Hesap',
  counterAccountName: 'Hedef hesap',
  counterpartyName: 'Karşı taraf',
  productName: 'Ürün',
  zoneName: 'Bölge',
  country: 'Ülke',
  qty: 'Adet',
  lines: 'Kalemler',
  items: 'Kalemler',
  // ürün / beyan
  ingredients: 'İçindekiler',
  storageInstructions: 'Saklama',
  nutrition: 'Besin künyesi',
  allergens: 'Alerjenler',
  traces: 'İzler',
  dateType: 'Tarih tipi',
  shelfLifeDays: 'Raf ömrü (gün)',
  vatRate: 'KDV (%)',
  shippable: 'Kargo izni',
  variants: 'Boylar',
  label: 'Etiket',
  netWeightG: 'Net ağırlık (g)',
  piecesCount: 'Adet (paket içi)',
  fields: 'Asistanın yazacakları',
  currentFields: 'Ürünün bugünkü hâli',
  uncertainFields: 'Net okunmayan',
  remainingGaps: 'Onay sonrası eksik',
  // fiyat / para
  offerPriceCents: 'Teklif fiyatı',
  listPriceCents: 'Liste fiyatı',
  amountCents: 'Tutar',
  totalAmountCents: 'Fatura toplamı',
  unitCostCents: 'Birim alış',
  lastPurchasePriceCents: 'Son alış',
  minBasketCents: 'Asgari sepet',
  totalPrice: 'Paket fiyatı',
  allocatedUnitPrice: 'Kaleme düşen',
  percent: 'Oran (%)',
  direction: 'Yön',
  type: 'Tür',
  publicLabel: 'Müşteri metni',
  code: 'Kupon kodu',
  trigger: 'Tetik',
  scope: 'Kapsam türü',
  firstOrderOnly: 'Yalnız ilk sipariş',
  maxUses: 'Kullanım tavanı',
  perCustomerLimit: 'Kişi başı tavan',
  validFrom: 'Başlangıç',
  validTo: 'Bitiş',
  valueDate: 'Değer tarihi',
  // stok / tedarik
  expiryDate: 'SKT',
  lotNumber: 'Lot',
  physicalQty: 'Partide',
  documentNo: 'Belge no',
  date: 'Belge tarihi',
  purchaseOrderId: 'Bağlı sipariş',
  postalCodes: 'Posta kodları',
  postalCode: 'Kod',
  placeName: 'Yer',
  requestCount: 'Talep',
  waitingCount: 'Bekleyen',
  // vitrin / tarif
  target: 'Hedef türü',
  isFeatured: 'Vitrine',
  currentlyFeaturedCount: 'Vitrinde',
  steps: 'Hazırlanış',
  serves: 'Porsiyon',
  duration: 'Süre',
  meal: 'Öğün',
  pantry: 'Evinizden',
};

/** Çok dilli nesneden seçili dilin metni — boşsa boş dizge (satır "—" ile çizilir). */
export function textOf(obj: Record<string, unknown>, lang: Locale): string {
  const raw = obj[lang];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Kapalı kümelerin ÜYE etiketleri — dizi DEĞERLERİ de çevrilir (26.08).
 *
 * Alerjenler ve eksik beyan kalemleri veride slug olarak durur (`sut` · `sert_kabuklu` ·
 * `nutrition`) ve künye onları HAM basıyordu: Türkçe bir listenin ortasında `gluten · sut ·
 * sert_kabuklu` ve `nutrition · ingredients`. İki sözlük de zaten vardı — eksik olan çağrıydı.
 *
 * Sözlükte olmayan üye HAM kalır: uydurma bir çeviri, olmayan bir değeri varmış gibi gösterirdi
 * (`ENUM_LABEL`in aynı kuralı).
 */
export function memberLabel(key: string, member: string, lang: Locale): string {
  if (key === 'allergens' || key === 'traces') {
    const label = ALLERGEN_LABELS[member as ProductAllergen];
    return label ? textOf(label as unknown as Record<string, unknown>, lang) || member : member;
  }
  if (key === 'uncertainFields' || key === 'remainingGaps' || key === 'declarationGaps') {
    return DECLARATION_GAP_LABELS[member as DeclarationGap] ?? member;
  }
  return member;
}

/** Anahtarı okunur bir başlığa çevirir — sözlükte yoksa camelCase ayrılır. */
export function labelOf(key: string): string {
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
