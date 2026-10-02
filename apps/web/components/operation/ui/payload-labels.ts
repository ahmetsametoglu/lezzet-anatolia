import type { Locale } from '@lezzet/i18n';
import {
  ALLERGEN_LABELS,
  DECLARATION_GAP_LABELS,
  type DeclarationGap,
  type ProductAllergen,
} from '@lezzet/types';
import { DOCUMENT_KIND_LABEL, VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';

/**
 * Dilekçe künyesinin sözlükleri; `payload-tree`nin saf yarısı. Ayrı dosyada durur çünkü depoda jsdom yok ve `.tsx` birim
 * testinden içe aktarılamaz: "operasyon yüzeyinde makine adı görünmez" sözü ancak burada sınanır.
 */

/**
 * Enum alanlarının okunur karşılığı alan adı + değer çiftiyle eşleşir, çünkü aynı değer başka alanda başka anlama gelir
 * ("type" hem hareket hem indirim türü). Sözlükte olmayan enum ham kalır: uydurma çeviri olmayan bir değeri varmış gibi gösterir.
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
  // belge
  kind: DOCUMENT_KIND_LABEL,
  vatRegime: VAT_REGIME_LABEL,
  source: { engine: 'Eşik altı eksiği', invoice: 'Tedarikçinin faturası' },
};

/**
 * Kimliğin adını taşıyan alanlar: ad künyede varsa kimlik satırı gizlenir. Yoksa kalıp `<x>Id → <x>Name` uygulanır;
 * varyantın kendi adı olmadığı, deponun adı koduyla geçtiği için kalıp tek başına yetmez.
 */
export const ID_TWIN: Record<string, readonly string[]> = {
  variantId: ['variantName', 'productName', 'product'],
  warehouseId: ['warehouseName', 'warehouseCode'],
  accountId: ['accountName'],
  counterAccountId: ['counterAccountName'],
  counterpartyId: ['counterpartyName'],
  supplierId: ['supplierName'],
  zoneId: ['zoneName'],
};

/**
 * Alan adlarının okunur karşılığı; sözlükte olmayan anahtar camelCase'den ayrılıp yazılır. İkizi olmayan kimlikler de burada
 * olmalı, yoksa İngilizce anahtar Türkçe operasyon yüzeyinde İngilizce kalır (`batchId` → "Batch id").
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
  counterpartyId: 'Cari kimliği',
  zoneId: 'Bölge kimliği',
  // ortak
  name: 'Ad',
  description: 'Açıklama',
  reason: 'Gerekçe',
  note: 'Not',
  // Eski para dilekçelerinin `category` alanı (bugün `nature`); kuyrukta durdukları sürece etiket kalır.
  category: 'Kategori',
  nature: 'Tür',
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
  netQuantity: 'Net miktar',
  netUnit: 'Birim',
  piecesCount: 'Adet (paket içi)',
  portionKind: 'Porsiyon türü',
  packedWeightG: 'Brüt ağırlık (g)',
  packedLengthMm: 'Uzunluk (mm)',
  packedWidthMm: 'Genişlik (mm)',
  packedHeightMm: 'Yükseklik (mm)',
  fields: 'Asistanın yazacakları',
  currentFields: 'Ürünün bugünkü hâli',
  uncertainFields: 'Net okunmayan',
  remainingGaps: 'Onay sonrası eksik',
  // fiyat / para
  offerPriceCents: 'Teklif fiyatı',
  listPriceCents: 'Liste fiyatı',
  amountCents: 'Tutar',
  totalAmountCents: 'Fatura toplamı',
  // belge / fatura
  vatAmountCents: 'KDV',
  vatRegime: 'KDV rejimi',
  dueOn: 'Vade',
  issuedOn: 'Belge tarihi',
  number: 'Belge no',
  kind: 'Belge türü',
  invoice: 'Fatura',
  source: 'Kaynak',
  unitPriceCents: 'Faturadaki birim fiyat',
  supplierItemKey: 'Tedarikçideki anahtar',
  supplierItemName: 'Tedarikçideki ad',
  mappingProposed: 'Eşleme önerisi',
  // tedarikçi kartı
  vatNumber: 'Vergi no',
  phone: 'Telefon',
  email: 'E-posta',
  address: 'Adres',
  paymentTermDays: 'Vade (gün)',
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
 * Kapalı kümelerin üye etiketleri: alerjen ve eksik beyan kalemleri veride slug olarak durur, künye onları çevirir.
 * Sözlükte olmayan üye ham kalır; uydurma çeviri olmayan bir değeri varmış gibi gösterir.
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
