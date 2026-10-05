import { z } from 'zod';
import {
  AddressSchema,
  CountryEnum,
  DAILY_CHECKS_MAX,
  type DeliveryZonePostalCode,
  StorageAreaInsertSchema,
  VehicleInsertSchema,
  WarehouseInsertSchema,
  PrinterPurposeEnum,
  type BoxPrinterContract,
  type Country,
  type DeliveryZone,
  type StorageAreaKind,
  type Warehouse,
} from '@lezzet/types';
import { ShippingBoxInsertSchema, type ShippingBox } from '@lezzet/types';
import type { MeasureDayState, TemperatureDeviation } from './measure-rules';

// Depolar ekranının tipleri: varlık şemaları `packages/types`'ta, burada yalnız görünümün eklediği türetmeler ve formun
// sözleşmesi var.

// ── Deponun adresi ──────────────────────────────────────────────────────────
// `warehouse.address` serbest `jsonb`; şekli müşteri adresinden türer, çünkü üç alanın anlamı aynıdır ve ikinci bir adres
// sözlüğü "postalCode" ile "zip"i yan yana yaşatırdı. Ülke burada yok: deponun ülkesi künyenin kendi alanıdır ve KDV ona bağlı.
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
  /** Gel-al noktası: izinli müşteri hazır siparişini buradan alır; adresi müşteriye görünür. */
  pickupEnabled: z.boolean(),
  address: WarehouseAddressSchema,
  /**
   * Deponun noktası, rotanın çıpası; nokta yoksa o deponun rotaları sıralanamaz (`no_start`). Metin olarak alınır, çünkü boş
   * bırakılabilmeli ve boş sayı alanı `NaN` üretir; boşsa kapı adresten çözer, doluysa operatörün değeri kazanır.
   */
  lat: z.string().trim(),
  lng: z.string().trim(),
});
export type WarehouseFormInput = z.infer<typeof WarehouseFormSchema>;

// ── Bölge formu ─────────────────────────────────────────────────────────────

/**
 * Posta kodu SEÇİMİ — `(ülke, kod)` ikilisi, çünkü kod tek başına benzersiz değil (`67000` hem
 * Fransa'da hem Almanya'da geçerli). Bölge sınır ötesi olabildiği için ikisi de taşınır.
 */
/** Rotaya bağlı kod, kartların okuduğu şekil; rota formu Teslimat & Rota ekranındadır, bu ekran yalnız okur. */
export type PostalCodePick = Pick<DeliveryZonePostalCode, 'country' | 'postalCode'>;

// ── Ölçüm noktası formları ──────────────────────────────────────────────────

/**
 * Depo içi alan; `warehouseId` formda yok, çünkü tesis seçili karttan bellidir. Hedef aralık metin olarak alınır: boş bir sayı alanı
 * `0`a düşer ve sıfır derece geçerli bir beklenti olduğu için boşluk sıfırdan ayırt edilemezdi.
 */
/**
 * Günlük beklenen ölçüm — formda METİN, çünkü `<select>` metin döndürür ve sayıya zorlanan boş bir
 * alan `0`a düşer; sıfır burada GEÇERLİ bir cevap ("bu noktadan ölçüm beklenmiyor"), yani boşlukla
 * karışması ölçülmeyeni ölçülmüş gibi okuturdu (`CLAUDE §1`).
 */
const DailyChecksField = z.coerce.number().int().min(0).max(DAILY_CHECKS_MAX);

export const StorageAreaFormSchema = StorageAreaInsertSchema.pick({ name: true, kind: true }).extend({
  targetMinC: z.string(),
  targetMaxC: z.string(),
  expectedDailyChecks: DailyChecksField,
});
export type StorageAreaFormInput = z.infer<typeof StorageAreaFormSchema>;

/** Araç. Plaka kimlik, etiket okunurluk — ikincisi boş bırakılabilir. */
export const VehicleFormSchema = VehicleInsertSchema.pick({ plate: true }).extend({
  label: z.string(),
  expectedDailyChecks: DailyChecksField,
});
export type VehicleFormInput = z.infer<typeof VehicleFormSchema>;


// ── Görünüm satırları ───────────────────────────────────────────────────────

/**
 * Depo listesinin bir satırı — künye + o tesisin özet sayıları.
 *
 * Künye alanları varlıktan TÜRER (`Warehouse`), elle yeniden yazılmaz: `address` yalnız şekli
 * çözüldüğü için (`jsonb` → `WarehouseAddress`) yeniden tanımlanıyor, `createdAt` ise ekranın
 * sorusu değil.
 */
/* `vehicleId` atılır, çünkü ekran onu okumuyor: kart araçları deponun ev bağından bulur (`VanLoadRow`). */
export type WarehouseRowView = Omit<Warehouse, 'address' | 'createdAt' | 'vehicleId'> & {
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
  /** Bu depoya yolda olan sevkiyat; karnede çizilmez, kapatma uyarısının girdisidir. */
  inTransitIn: number;
  /**
   * Kurulum eksikliği: ne aktif bölgesi ne kargo çıkışı olan tesis hiçbir siparişi alamaz, açık ama ulaşılamazdır. `null` kurulum tam
   * demektir.
   */
  setupGap: string | null;
};

/** Bölge kartı — deponun hizmet alanı bölümünde. Kodlar bölgenin kendi tablosundan gelir. */
export type ZoneCardView = Pick<DeliveryZone, 'id' | 'name' | 'isActive' | 'weekdays'> & {
  postalCodes: PostalCodePick[];
  /**
   * Bölgenin ağırlığı, kodlarının toplamı: tanım "ne kurduk"u, ağırlık "ne getirdi"yi söyler ve bölge kararı ikisi yan yana durunca
   * verilir. Kaynak Rotalar'ın okuduğu RPC'dir (`analytics_postal_code_orders`), iki ekran aynı soruya iki sayı vermesin.
   */
  orderCount: number;
  revenueCents: number;
  /** Bu bölgenin kodlarında haber bekleyen kişi (`zone_notice`) — talebin kimlikli ayağı. */
  waitingCount: number;
  /**
   * Sıradaki teslim günü (ISO tarih); `null` = bölgenin günü yok ya da pasif, yani dağıtıma çıkmaz.
   * Gün listesinden TÜRETİLİR, ayrı bir yerde tutulmaz.
   */
  nextDeliveryDate: string | null;
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
 * Karne, deponun bugünkü hâli: sayar, listelemez; her sayı Stok'a o depo bağlamıyla giden bir kapıdır. Ölçülemeyen alan `null` döner,
 * çünkü fiyatı girilmemiş partiden risk tutarı çıkarılamaz ve `0 €` bozuk ölçümü sağlıklı okuturdu.
 */
export interface ScorecardView {
  variantCount: number;
  batchCount: number;
  nearExpiryCount: number;
  expiredCount: number;
  riskCents: number | null;
  belowMinCount: number;
  /** Bu depoya yolda olan sevkiyat; karnede çizilmez, kapatma uyarısının girdisidir. */
  inTransitIn: number;
  /** Bu depodan çıkacak, henüz teslim edilmemiş sipariş. */
  openOrderCount: number;
  /** En son mal girişi (parti doğuşu) — sessizleşmiş depo bir işarettir. `null` = hiç giriş yok. */
  lastIntakeAt: string | null;
}

/**
 * Etiket yazıcısı formu: üç alan birlikte dolu ya da birlikte boş, çünkü yarım ayar basım anında depocunun telefonunda patlardı. Üçü boş
 * kaydetmek yazıcıyı kaldırır; depo etiketsiz de çalışır.
 */
/**
 * Yazıcı envanteri formu: satır eklemek eklemektir, kaldırmak ayrı bir eylemdir ve silme değil kapatmadır, çünkü cihazların seçimi
 * kimliğe bağlı. `name` zorunlu, çünkü iki yazıcı arasında seçim yapan depocu onları yalnız IP adresinden ayırt edemez.
 */
export const WarehousePrinterFormSchema = z.object({
  warehouseId: z.string().uuid(),
  name: z.string().trim().min(1),
  purpose: PrinterPurposeEnum,
  address: z.string().trim().min(1),
  model: z.string().trim().min(1),
  labelSize: z.string().trim().min(1),
});
export type WarehousePrinterFormInput = z.infer<typeof WarehousePrinterFormSchema>;

/** Seçili tesisin tam kartı. */
export interface WarehouseCardView {
  row: WarehouseRowView;
  zones: ZoneCardView[];
  staff: StaffChipView[];
  scorecard: ScorecardView;
  /** Deponun yazıcıları, envanter; boş dizi tanımsız demektir, telefon basmayı denemez ve kart önizleme olarak kalır. */
  printers: BoxPrinterContract[];
  /** Deponun kargo kutuları ve benimsenmemiş sistem şablonları. */
  shippingBoxes: ShippingBoxesView;
  /** Ölçüm noktaları: depo içi alanlar ve bu tesise künyelenmiş araçlar. */
  points: MeasurePointView[];
  /**
   * Bu tesisin araçlarında ne var; `null` araçta bir şey yok demektir. Karnenin altında tek satırdır, araç kartında `null` döner,
   * çünkü aracın karnesi onu zaten sayar.
   */
  vanLoad: VanLoadCardView | null;
  /**
   * Takvim okuması tavana çarptı mı (`TemperatureLogService.listRange`). Kesilen bir okumanın boş
   * günleri "ölçülmemiş" diye boyanırdı — yani altyapı sınırı bir hijyen ihlali gibi görünürdü.
   */
  measureTruncated: boolean;
}

/**
 * Karnenin altındaki araç satırı; paneldeki araç satırıyla aynı motordan (`readFacilityVanSummary`) beslenir ama sunumu farklıdır:
 * kart araç araç yazar, panel tek satırda toplar.
 */
export interface VanLoadCardView {
  /** Araç başına satır: "VAN-1 · 40 adet · 6 üründen". Araç yoksa boş dizi. */
  vans: { code: string; name: string; summary: string; href: string }[];
  /** "5 kutu · 3 sipariş" — TESİS düzeyinde (kutu araç kimliği taşımıyor); yoksa `null`. */
  boxes: string | null;
}

/**
 * Ölçüm noktası, depo içi alan ya da araç tek görünümde: veride iki tablo var ama operatörün sorusu "hangi noktalarım var ve ölçülüyor
 * mu". Ayrımı `kind` taşır, çünkü düzenleme formu ona göre değişir.
 */
export interface MeasurePointView {
  id: string;
  kind: 'area' | 'vehicle';
  /** Alanın adı ya da aracın plakası. */
  name: string;
  /** Aracın okunur etiketi ("Küçük kamyonet"); alanda `null`. */
  label: string | null;
  /** Alanın saklama rejimi; araçta `null`. */
  areaKind: StorageAreaKind | null;
  targetMinC: number | null;
  targetMaxC: number | null;
  /** Günde kaç ölçüm beklendiği, takvimin "eksik gün" ölçütü; 0 beklenmiyor demektir ve o noktanın boş günü eksik sayılmaz. */
  expectedDailyChecks: number;
  /** Noktanın doğum anı — öncesindeki günler "ölçülmedi" değil, nokta henüz yoktu. */
  createdAt: string;
  isActive: boolean;
  /**
   * Bu noktanın son ölçümü **takvim penceresi içinde** (son 3 ay) — `null` = pencerede kayıt yok.
   *
   * "Hiç ölçülmemiş" DEĞİL ve ekran da öyle yazmıyor: dört ay önce ölçülmüş bir dolap için "hiç"
   * yanlış olurdu — ölçemediğimiz bir şeyi yokluk diye göstermek (`CLAUDE §1`).
   */
  lastRecordedAt: string | null;
  /** Hijyen takvimi; pencerenin her günü için en eski günden en yeniye bir kayıt. */
  days: MeasureDayView[];
}

/**
 * Takvimin bir günü, hijyen defterinin bir satırı; ölçümlerin kendisi de taşınır, çünkü güne gelen kişinin sorusu "ne yazmıştık"tır.
 */
export interface MeasureDayView {
  /** `2026-08-17` — UTC gün anahtarı (`measure-rules.dayKeyOf` künyesi). */
  date: string;
  state: MeasureDayState;
  /** O günün ölçümleri, saat sırasında. */
  readings: Array<{ at: string; temperatureC: number; deviation: TemperatureDeviation | null }>;
  /** O gün kaç ölçüm bekleniyordu — tooltipte "2 bekleniyordu, 1 alınmış" cümlesinin kaynağı. */
  expected: number;
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
  /** Aktif deposu olan ülkeler — "yeni ülkede ilk depo" mali uyarısı bundan türer. */
  countriesWithWarehouse: Country[];
}

// ── Kargo kutusu ────────────────────────────────────────────────────────────

/**
 * Kutu formu, `ShippingBoxInsertSchema`'dan türer. `warehouseId` formda yok, çünkü kutu açık olan deponun listesine girer ve form alanı
 * ekranda seçili depoyla ayrışabilirdi; `isActive` satırdaki düğmedir, `sortOrder` listenin sırasıdır.
 */
export const ShippingBoxFormSchema = ShippingBoxInsertSchema.omit({ warehouseId: true, isActive: true, sortOrder: true });
export type ShippingBoxFormInput = z.infer<typeof ShippingBoxFormSchema>;

/**
 * Ekranın okuduğu hâl: deponun kutuları + HENÜZ BENİMSENMEMİŞ şablonlar.
 *
 * Şablonlar süzülmüş geliyor (benimsenenler listeden düşüyor): operatöre zaten listesinde olan
 * bir kutuyu "ekle" diye sunmak, tıklandığında reddedilen bir davettir (ad depo içinde benzersiz).
 */
export interface ShippingBoxesView {
  boxes: readonly ShippingBox[];
  adoptable: readonly ShippingBox[];
}
