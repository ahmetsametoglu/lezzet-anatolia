import type { StorageAreaKind } from '@lezzet/types';

// Sıcaklık kaydının görünüm modeli (10.6 · noktalar 19.28).
//
// Bu dosya eskiden stoktan düşme masasının tip evi de olduğu için beş tip taşıyordu; düşüm Stok
// ekranına taşınınca (22.26) geriye yalnız ölçüm noktası kaldı.

/** Noktanın türü — depo içi alan mı, araç mı. İkisi ayrı tabloda yaşıyor (`0045`). */
export type TemperaturePointKind = 'area' | 'vehicle';

/** Sapmanın SEBEBİ — ekran ikisini ayrı cümleye çeviriyor; `null` = sapma yok ya da ölçülemedi. */
export type TemperatureDeviation = 'target' | 'habit';

/**
 * Ölçüm noktası ve BUGÜNKÜ hâli (10.6).
 *
 * ── KÜME ARTIK TANIMDAN GELİYOR, GEÇMİŞTEN DEĞİL (19.28) ────────────────────
 * Nokta listesi eskiden `listLocations()` ile **daha önce kaydı geçmiş** metinlerden türüyordu ve
 * dosyanın kendi künyesi sınırı zaten yazmıştı: *"hiç kaydı olmayan yepyeni bir dolap ilk ölçümüne
 * kadar listede görünmez."* Bu sınır tasarımın ana vaadini boşa çıkarıyordu — *"ölçülmemiş nokta
 * amber görünür kalır"* ancak noktanın VAR OLDUĞU biliniyorsa mümkündür. Bugün küme `storage_area`
 * + `vehicle` tanımlarından geliyor: hiç ölçülmemiş bir dolap da listede, ilk günden amber.
 *
 * `temperatureC: null` = **bugün ölçülmedi** — sıfır değil (`CLAUDE §1`).
 */
export interface TemperaturePoint {
  /** Noktanın kimliği — `kind` ile birlikte hangi tabloya bakılacağını söyler. */
  id: string;
  kind: TemperaturePointKind;
  /** Ekranda okunan ad: alanın adı ya da aracın plakası (+ etiketi). */
  name: string;
  /** Alanın saklama rejimi — araçta `null`. Ekran rozeti bundan doğar. */
  areaKind: StorageAreaKind | null;
  /**
   * Beklenen aralık — sapmanın BİRİNCİL ölçütü. İkisi birlikte `null` olabilir (rafta beklenti
   * yoktur); tek başına asla (`storage_area_target_pair` kısıtı).
   */
  targetMinC: number | null;
  targetMaxC: number | null;
  /** Günün SON ölçümü (°C); bugün ölçülmediyse `null`. */
  temperatureC: number | null;
  /** Son ölçümün anı (ISO); ölçülmediyse `null`. */
  recordedAt: string | null;
  /**
   * Bu noktanın ALIŞKANLIĞI (°C) — geçmiş ölçümlerinin ortancası. `null` = yeterli geçmiş yok,
   * yani "sıra dışı mı" sorusuna geçmişten cevap veremiyoruz. Sıfır değil, bilinmiyor.
   */
  usualC: number | null;
  /**
   * Sapma ve sebebi. `target` = beklenen aralığın dışında (kesin ölçüt) · `habit` = aralık
   * tanımlı değil ama kendi alışkanlığından toleransı aşacak kadar sapmış (tahmini ölçüt).
   * Bir UYARIDIR, kayıt zaten yazılmıştır.
   */
  deviation: TemperatureDeviation | null;
}

/**
 * Ekranın notları.
 *
 * `newPoint` KALKTI (19.28): "listede olmayan bir nokta adını yazabilirsiniz" cümlesi serbest metin
 * girişinin künyesiydi ve tam da kapattığımız hatayı davet ediyordu — ilk yazım hatası kalıcı bir
 * seçenek hâline geliyordu. Nokta artık Depolar ekranından tanımlanıyor; ekran oraya yönlendiriyor.
 */
export const TEMPERATURE_NOTES = {
  hint: 'Nokta seçin, dereceyi yazın. Sıra dışı değer uyarır ama kaydı engellemez.',
  empty: 'Bu tesiste tanımlı ölçüm noktası yok — Depolar ekranından dolap, soğuk oda ya da araç ekleyin.',
  /** Ölçülmemiş nokta bir EKSİKLİKTİR ve sayılır: denetimin ilk sorusu budur. */
  pending: (count: number): string => `${count} nokta bugün ölçülmedi`,
  allDone: 'Bugün tüm noktalar ölçüldü',
} as const;
