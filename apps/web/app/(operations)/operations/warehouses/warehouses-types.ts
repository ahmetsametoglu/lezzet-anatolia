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
/**
 * Rotaya bağlı kod — kartların okuduğu şekil. Rota FORMU burada değil (kurulum Teslimat & Rota'ya
 * taşındı, 07.08); bu ekran yalnız okur, o yüzden yalnız tip kaldı.
 */
export type PostalCodePick = Pick<DeliveryZonePostalCode, 'country' | 'postalCode'>;

// ── Ölçüm noktası formları (19.28) ──────────────────────────────────────────

/**
 * Depo içi alan. `warehouseId` formda YOK — hangi tesise eklendiği seçili karttan belli ve onu
 * forma koymak, operatöre zaten verdiği cevabı ikinci kez sordurmaktı.
 *
 * Hedef aralık **metin** olarak alınıyor, sayı olarak değil: boş bırakılabilmesi gerek ("bu alanın
 * beklentisi yok") ve boş bir sayı alanı `0`a düşer — sıfır derece geçerli bir beklentidir, yani
 * boşluk sıfırdan ayırt edilemez hâle gelirdi (`CLAUDE §1`).
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
  /** Bu depoya yolda olan sevkiyat — karnede çizilmiyor (17.08), KAPATMA uyarısının girdisi. */
  inTransitIn: number;
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
  /**
   * Bölgenin AĞIRLIĞI (19.28, kullanıcı isteği 17.08) — kodlarının toplamı.
   *
   * Kart bugüne kadar yalnız TANIMI gösteriyordu (ad · gün · kod). Tanım "ne kurduk"u söyler,
   * ağırlık "ne getirdi"yi — ve ikisi yan yana durmadan bir bölge hakkında karar verilemez: teslim
   * günü eklemek mi, kod çıkarmak mı, hiç dokunmamak mı.
   *
   * Kaynak Rotalar'ın okuduğu RPC'nin aynısı (`analytics_postal_code_orders`): iki ekran aynı
   * soruyu iki farklı sayıyla cevaplamasın.
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
  /** Bu depoya yolda olan sevkiyat — karnede çizilmiyor (17.08), KAPATMA uyarısının girdisi. */
  inTransitIn: number;
  /** Bu depodan çıkacak, henüz teslim edilmemiş sipariş. */
  openOrderCount: number;
  /** En son mal girişi (parti doğuşu) — sessizleşmiş depo bir işarettir. `null` = hiç giriş yok. */
  lastIntakeAt: string | null;
}

/**
 * Etiket yazıcısı formu (23.7) — üçü BİRLİKTE dolu ya da BİRLİKTE boş: yarım ayar, basım anında
 * depocunun telefonunda patlayan bir hata demekti; ekran onu daha kaydederken reddeder. Üçü boş
 * kaydetmek yazıcıyı KALDIRIR (geçerli bir karar — depo etiketsiz çalışabilir, kutu akışı basımsız
 * da tamamlanır).
 */
/**
 * **YAZICI ENVANTERİ FORMU** (07.12 · 29.08) — `LabelPrinterFormSchema`ın halefi.
 *
 * Eski şema "üçü birlikte ya da üçü boş" diyordu, çünkü ayar TEK yazıcıyı tarif ediyordu ve
 * "boş = yazıcıyı kaldır" onun tek silme yoluydu. Tabloya geçince o kural anlamını yitirdi:
 * satır eklemek eklemektir, kaldırmak ayrı bir eylem (ve **silme değil kapatma** — cihazların
 * seçimi kimliğe bağlı).
 *
 * `name` zorunlu ve bu kozmetik değil: iki yazıcı arasında seçim yapan depocu `192.168.1.90` ile
 * `.91`i ayırt edemez.
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
  /**
   * Deponun YAZICILARI (07.12 · 29.08) — envanter, seçim değil. Boş dizi = tanımsız; telefon
   * basmayı hiç denemez ve kart önizleme olarak kalır.
   */
  printers: BoxPrinterContract[];
  /** Deponun kargo kutuları + benimsenmemiş sistem şablonları (07.12). */
  shippingBoxes: ShippingBoxesView;
  /** Ölçüm noktaları (19.28) — depo içi alanlar + bu tesise künyelenmiş araçlar. */
  points: MeasurePointView[];
  /**
   * Takvim okuması tavana çarptı mı (`TemperatureLogService.listRange`). Kesilen bir okumanın boş
   * günleri "ölçülmemiş" diye boyanırdı — yani altyapı sınırı bir hijyen ihlali gibi görünürdü.
   */
  measureTruncated: boolean;
}

/**
 * **Ölçüm noktası** — depo içi alan ya da araç, tek görünümde (19.28).
 *
 * Veride İKİ tablo (`storage_area` · `vehicle`, zorunlulukları farklı) ama ekranda tek liste:
 * operatörün sorusu "hangi noktalarım var ve ölçülüyor mu", tablo ayrımı değil. Ayrımı `kind`
 * taşıyor, çünkü düzenleme formu ona göre değişiyor (alanda hedef aralık, araçta plaka).
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
  /**
   * Günde kaç ölçüm beklendiği — takvimin "eksik gün" ölçütü (19.30). **0 = beklenmiyor** ve o
   * noktanın boş günleri eksik sayılmaz (oda sıcaklığı rafı, soğutucusuz araç).
   */
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
  /** Hijyen takvimi — eskiden yeniye, pencerenin her günü için tam bir kayıt (19.30). */
  days: MeasureDayView[];
}

/**
 * **Takvimin bir günü** (19.30) — hijyen defterinin bir satırı.
 *
 * Ölçümlerin kendisi de taşınıyor, yalnız hâli değil: takvimde bir güne gelen kişinin sorusu "ne
 * yazmıştık" — saat ve derece olmadan kırmızı bir kutu, cevabı olmayan bir uyarıdır.
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
  /**
   * ── `countriesWithoutShipping` ve `zoneDemand` KALKTI (17.08) ─────────────────────────────
   * İkisi de ekranın "Ağ geneli" bölümünü besliyordu ve o bölüm bu sayfanın sorusuna cevap
   * vermiyordu. Talep tablosunun gerekçesi burada yazılıydı — *"kararın verildiği yer burası"* —
   * ve 07.08'de geçerliliğini yitirdi: bölge kurulumu haritayla birlikte Teslimat & Rota'ya taşındı,
   * karar da onunla gitti. Gerekçesi biten bir alan, alan olarak kalmaz. Ayrıntı `19.27`.
   */
}

// ── Kargo kutusu (07.12) ────────────────────────────────────────────────────

/**
 * Kutu formu — `ShippingBoxInsertSchema`'dan TÜRER (elle alan yazılmaz, `CLAUDE §1`).
 *
 * `warehouseId` formda YOK: kutu her zaman AÇIK OLAN deponun listesine girer ve kimliği action'a
 * ayrı geçer. Form alanı olsaydı ekranda seçili olan depo ile forma yazılan depo ayrışabilirdi —
 * ve o ayrışma, kutuyu görünmeyen bir listeye yazardı.
 *
 * `isActive`/`sortOrder` de yok: ilki bir DÜĞMEDİR (satırda), ikincisi listenin sırasıdır.
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
