import { z } from 'zod';

// Proje-geneli enum'lar — DATA_MODEL "Enum'lar (özet)" listesinin karşılığı (01-types görevi 01.2).
// Ölçüt: birden çok varlık kullanıyorsa BURAYA; tek varlığa özgüyse o varlığın şemasında kalır
// (ör. ProductAllergen yalnız üründe → product.schema.ts).
//
// Liste artımlı büyür: bir enum, onu kullanan ilk varlık yazılırken eklenir.

/** Kanal — *kim* alıyor. `Price`, `Order`, `Customer` türetimi ve `Discount` kapsamı kullanır. */
export const ChannelEnum = z.enum(['b2b', 'b2c']);
export type Channel = z.infer<typeof ChannelEnum>;

/** Para birimi. Tek pazar (FR/DE) → tek değer; çoklu döviz Faz 1'de yok. */
export const CurrencyEnum = z.enum(['EUR']);
export type Currency = z.infer<typeof CurrencyEnum>;

/** Sipariş durumu — geçiş kuralları `ORDER_LIFECYCLE.md`, motor: domain-core/order. */
export const OrderStatusEnum = z.enum([
  'draft',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'returned',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/** Sipariş kaynağı — *nereden kapandı*. Kanaldan BAĞIMSIZ eksen (DOMAIN §3, CHANNELS §2). */
export const OrderSourceEnum = z.enum(['web', 'whatsapp', 'door', 'manual']);
export type OrderSource = z.infer<typeof OrderSourceEnum>;

/** KDV işleme tipi — siparişe yazılır, muhasebe export'u bunu okur (DOMAIN §5). */
export const VatTreatmentEnum = z.enum(['domestic', 'intra_eu_b2b_reverse_charge']);
export type VatTreatment = z.infer<typeof VatTreatmentEnum>;

/** Teslimat ülkesi — DE B2C için OSS eşiği izlemi (DOMAIN §5). */
export const CountryEnum = z.enum(['FR', 'DE']);
export type Country = z.infer<typeof CountryEnum>;

/** Teslimat tipi — rota içi kapı teslimi / kargo (DOMAIN §6). */
export const DeliveryTypeEnum = z.enum(['route', 'shipping']);
export type DeliveryType = z.infer<typeof DeliveryTypeEnum>;

/**
 * Ödeme yöntemi. **`on_account` (vadeli) BU LİSTEDE DEĞİLDİR** — vade bir yöntem değil, siparişin
 * bir özelliğidir (`Order.on_account`); tahsilat sonradan havaleyle yapılır (DOMAIN §7).
 */
export const PaymentMethodEnum = z.enum(['online', 'cash', 'card', 'cheque', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/**
 * İçerik dili. `packages/i18n` aynı üçlüyü ARAYÜZ tarafı için `LOCALES` olarak tutar — bilerek
 * ayrı: `types` hiçbir iç pakete bağlanmaz (STACK §4), bu yüzden ikisi birbirinden import edemez.
 * Değerler değişirse İKİSİ birden güncellenir.
 */
export const PreferredLanguageEnum = z.enum(['tr', 'fr', 'de']);
export type PreferredLanguage = z.infer<typeof PreferredLanguageEnum>;

/** Müşteri tipi — kanal türetiminin kaynağı (DOMAIN §3). */
export const CustomerTypeEnum = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof CustomerTypeEnum>;

/** İndirim tetikleyicisi: kupon (kod girilir) / otomatik kampanya (DOMAIN §5). */
export const DiscountTriggerEnum = z.enum(['coupon', 'automatic']);
export type DiscountTrigger = z.infer<typeof DiscountTriggerEnum>;

/** İndirim biçimi: yüzde / sabit tutar. */
export const DiscountTypeEnum = z.enum(['percent', 'fixed']);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;

/** İndirim kapsamı — kupon daima `cart` düzeyindedir (DOMAIN §5). */
export const DiscountScopeEnum = z.enum(['cart', 'category', 'collection']);
export type DiscountScope = z.infer<typeof DiscountScopeEnum>;

/**
 * Ödeme durumu — **türetilir, elle set edilmez** (DOMAIN §7): net tahsilat (tahsil − iade) ile
 * karşılanan tutar karşılaştırılır. `partial` PARA eksenidir ("net, karşılanandan az"); siparişin
 * eksik karşılanması ayrı eksendir (`fulfilled_qty`). Fazla tahsilat yeni değer açmaz — durum
 * `paid` kalır, fark iade borcu olarak türetilir.
 */
export const PaymentStatusEnum = z.enum(['pending', 'paid', 'partial', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * İade edilen kalemin MALA ne olduğu (DOMAIN §8). Para tarafı üçünde de aynıdır (iade hareketi);
 * ayrışan stok ve maliyet tarafıdır:
 * - `restock`  — mal depoya girdi, tekrar satılabilir → ayrılmıştan serbest
 * - `discard`  — mal döndü ama satılamaz (soğuk zincir belgelenemez) → imha kaydı; donuk üründe VARSAYILAN
 * - `goodwill` — **mal müşteride kaldı** ("paranızı iade ettik, ürün sizde kalsın") → stok ve
 *   `fulfilled_qty` DEĞİŞMEZ; maliyet kayıtlarda kalır, kâr raporunda jest gideri olarak görünür
 */
export const ReturnDispositionEnum = z.enum(['restock', 'discard', 'goodwill']);
export type ReturnDisposition = z.infer<typeof ReturnDispositionEnum>;
