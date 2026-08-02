import { z } from 'zod';
import {
  AddressSchema,
  CountryEnum,
  DeliveryZoneInsertSchema,
  WarehouseInsertSchema,
  type Country,
  type DeliveryZone,
  type Warehouse,
} from '@lezzet/types';

// Depolar ekranının (19.5) tipleri. Varlık şemaları `packages/types`'ta; burada YALNIZ görünümün
// eklediği türetmeler ve formun sözleşmesi var — hiçbir alan elle yeniden yazılmaz (CLAUDE.md §1).

// ── Deponun adresi ──────────────────────────────────────────────────────────
// `warehouse.address` veritabanında serbest `jsonb`: şekli kolon değil UYGULAMA belirler. Şekli
// burada MÜŞTERİ ADRESİNDEN türetiyoruz — üç alanın anlamı birebir aynı ve ikinci bir adres sözlüğü
// kurmak, bir gün "postalCode" ile "zip"in yan yana yaşadığı bir veri tabanı demekti.
//
// Ülke burada YOK: deponun ülkesi künyenin kendi alanıdır (`countryCode`) ve KDV modeli ona bağlı.
// Adresin içine ikinci bir ülke yazmak, ikisinin ayrışabileceği bir hâl yaratırdı.
export const WarehouseAddressSchema = AddressSchema.pick({ line1: true, postalCode: true, city: true });
export type WarehouseAddress = z.infer<typeof WarehouseAddressSchema>;

/** Ekranın okuduğu hâl — adres çözülmüş, kayıtsızsa `null` (uydurulmaz). */
export type WarehouseAddressView = WarehouseAddress | null;

// ── Künye formu ─────────────────────────────────────────────────────────────

/**
 * Depo ekleme/düzenleme formu. `WarehouseInsertSchema`'dan türer; `sortOrder` ve `isActive` formda
 * YOK ve bu bilinçli:
 * - sıra listeden sürüklenerek verilir (form alanı olsaydı iki yerden yönetilirdi),
 * - aktiflik bir düğme değil bir KARAR — kapatmanın dört sonucu var ve kendi penceresinde onaylanır.
 */
export const WarehouseFormSchema = WarehouseInsertSchema.pick({ code: true, name: true }).extend({
  countryCode: CountryEnum,
  shipsOnline: z.boolean(),
  address: WarehouseAddressSchema,
});
export type WarehouseFormInput = z.infer<typeof WarehouseFormSchema>;

// ── Bölge formu ─────────────────────────────────────────────────────────────

/**
 * Posta kodu SEÇİMİ — `(ülke, kod)` ikilisi, çünkü kod tek başına benzersiz değil (`67000` hem
 * Fransa'da hem Almanya'da geçerli). Bölge sınır ötesi olabildiği için ikisi de taşınır.
 */
export const PostalCodePickSchema = z.object({ country: CountryEnum, postalCode: z.string().min(1) });
export type PostalCodePick = z.infer<typeof PostalCodePickSchema>;

/**
 * Bölge formu — ad + teslim günleri + kodlar. `warehouseId` formda değil: bölge hangi deponun
 * kartından açıldıysa onundur, seçtirmek aynı kararı iki yerde sormak olurdu.
 *
 * `weekdays` boş kalabilir: kurulmuş ama günü henüz verilmemiş bölge geçerli bir ara hâldir
 * (kod listesi haritadan doldurulurken gün sonra konur). Kod listesi de boş kalabilir — bölge
 * kabuğu önce doğar, kodlar sonra biner.
 */
export const ZoneFormSchema = DeliveryZoneInsertSchema.pick({ name: true, weekdays: true, isActive: true })
  .required({ weekdays: true, isActive: true })
  .extend({ postalCodes: z.array(PostalCodePickSchema) });

// ── Görünüm satırları ───────────────────────────────────────────────────────

/**
 * Depo listesinin bir satırı — künye + o tesisin özet sayıları.
 *
 * Künye alanları varlıktan TÜRER (`Warehouse`), elle yeniden yazılmaz: `address` yalnız şekli
 * çözüldüğü için (`jsonb` → `WarehouseAddress`) yeniden tanımlanıyor, `createdAt` ise ekranın
 * sorusu değil.
 */
export type WarehouseRowView = Omit<Warehouse, 'address' | 'createdAt'> & {
  address: WarehouseAddressView;
  /** Bağlı bölge sayısı + o bölgelerin kod toplamı; pasif bölgeler ayrı sayılır. */
  zoneCount: number;
  activeZoneCount: number;
  postalCodeCount: number;
  staffCount: number;
  variantCount: number;
  batchCount: number;
  /** Karar bekleyen (yaklaşan tarihli / süresi geçmiş) parti sayısı. */
  attentionCount: number;
  inTransitIn: number;
  inTransitOut: number;
  /**
   * Kurulum eksikliği — **hiçbir siparişi alamayan** tesis. Ne bağlı aktif bölgesi ne kargo çıkışı
   * varsa posta kodu ona çözülmez, kargo yolu ondan geçmez: açık ama ulaşılamaz bir tesistir.
   * `null` = kurulum tam.
   */
  setupGap: string | null;
};

/** Bölge kartı — deponun hizmet alanı bölümünde. Kodlar bölgenin kendi tablosundan gelir. */
export type ZoneCardView = Pick<DeliveryZone, 'id' | 'name' | 'isActive' | 'weekdays'> & {
  postalCodes: PostalCodePick[];
};

/** Bağlı personel çipi — okunur; kapsam ataması Ayarlar'ın işi. */
export interface StaffChipView {
  id: string;
  name: string;
  roleText: string;
  /** Kapsamında YALNIZ bu depo var — kapatma onun kapısını kapatır. */
  onlyHere: boolean;
}

/**
 * Karne — deponun bugünkü hâli. **SAYAR, LİSTELEMEZ**: her sayı Stok'a o depo bağlamıyla giden bir
 * kapıdır, satırların kendisi orada yaşar.
 *
 * Ölçülemeyen alanlar `null` döner, sıfıra düşmez (CLAUDE.md §1): fiyatı girilmemiş partilerden
 * risk TUTARI çıkarılamaz ve `0 €` yazmak bozuk ölçümü sağlıklı gibi okuturdu.
 */
export interface ScorecardView {
  variantCount: number;
  batchCount: number;
  nearExpiryCount: number;
  expiredCount: number;
  riskCents: number | null;
  belowMinCount: number;
  inTransitIn: number;
  inTransitOut: number;
  /** Bu depodan çıkacak, henüz teslim edilmemiş sipariş. */
  openOrderCount: number;
  /** En son mal girişi (parti doğuşu) — sessizleşmiş depo bir işarettir. `null` = hiç giriş yok. */
  lastIntakeAt: string | null;
}

/** Seçili tesisin tam kartı. */
export interface WarehouseCardView {
  row: WarehouseRowView;
  zones: ZoneCardView[];
  staff: StaffChipView[];
  scorecard: ScorecardView;
}

/**
 * Kapatmanın bir sonucu. Dördü aynı ağırlıkta değil ve tek bir "emin misiniz?" cümlesine sıkışmaz —
 * ağırlık sıralamayı da rengi de belirler.
 */
export type ClosureWeight = 'hardest' | 'heavy' | 'pending';

export interface ClosureConsequence {
  weight: ClosureWeight;
  title: string;
  body: string;
}

/** Ekranın tüm okuması. */
export interface WarehousesData {
  rows: WarehouseRowView[];
  /** Seçili tesis (`?depo=<kod>`); yoksa liste görünümü. */
  card: WarehouseCardView | null;
  /**
   * Kargo çıkışı olmayan ülkeler — o ülkede bölge dışı müşteriye satış YAPILAMAZ (sipariş deposu
   * çözülemediği için hiç açılmaz). Listede görünür bir eksiklik hâlidir, sessiz bırakılmaz.
   */
  countriesWithoutShipping: Country[];
  /** Aktif deposu olan ülkeler — "yeni ülkede ilk depo" mali uyarısı bundan türer. */
  countriesWithWarehouse: Country[];
}
