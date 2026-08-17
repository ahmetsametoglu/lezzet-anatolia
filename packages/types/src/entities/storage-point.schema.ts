import { z } from 'zod';
import { dbNumericNullable } from '../primitives/db-numeric';

/**
 * ÖLÇÜM NOKTALARI — depo içi stoklama alanı + araç (19.28 · `0045_storage_area_vehicle.sql`).
 *
 * Soğuk zincirin iki fiziksel yeri var: **depodaki dolap** ve **yoldaki araç**. İkisi de aynı
 * denetim sorusuna cevap veriyor ("ölçüldü mü, beklenen aralıkta mıydı"), o yüzden tek dosyada
 * duruyorlar; ama iki AYRI tablo (kullanıcı kararı 17.08), çünkü zorunlulukları farklı — dolabın
 * deposu zorunlu, aracınki değil; plaka araçta benzersiz, alanda karşılığı yok.
 *
 * Bu ikisi gelene kadar `temperature_log.location` **serbest metindi** ve üç şeyi birden
 * bozuyordu: nokta grupları yazıma göre bölünüyordu, "bu nokta genelde şu kadar okuyor" uyarısı o
 * bölünen geçmişe dayanıyordu, ve **ölçülmeyen tespit edilemiyordu** — var olduğu bilinmeyen bir
 * dolabın eksik ölçümü de bilinemez.
 */

/**
 * Alanın türü — kapalı küme. İlk üçü ürünün saklama rejimiyle (`ProductStorageType`) BİLEREK aynı
 * kelimeler: "donuk ürün donuk alanda durur" cümlesi ancak iki taraf aynı dili konuşursa kurulur.
 * `staging` bir saklama rejimi değil GEÇİŞ yeri (mal kabul / sevk) — hedef aralığı olmaması normal.
 */
/**
 * Günlük ölçüm sayısının tavanı — bir iş kuralı değil, parmak kayması kalkanı: günde 12'den çok
 * elle ölçüm bir tur değil yazım hatasıdır. Kısıt veritabanında da yazılı (`0045`).
 */
export const DAILY_CHECKS_MAX = 12;

export const STORAGE_AREA_KINDS = ['frozen', 'chilled', 'ambient', 'staging'] as const;
export const StorageAreaKindEnum = z.enum(STORAGE_AREA_KINDS);
export type StorageAreaKind = z.infer<typeof StorageAreaKindEnum>;

export const StorageAreaSchema = z.object({
  id: z.string().uuid(),
  /** Alan fiziksel olarak TEK tesistedir — zorunlu, ve kayıtları varken deposu silinemez. */
  warehouseId: z.string().uuid(),
  name: z.string(),
  kind: StorageAreaKindEnum,
  /**
   * Beklenen aralık — sapmanın ÖLÇÜTÜ. İkisi birlikte null olabilir (rafta beklenti yoktur) ama
   * tek başına asla: tek uçlu aralık "üstü serbest mi altı mı" sorusunu okuyana bırakırdı.
   *
   * Bu alan gelmeden önce ekran beklentiyi geçmiş ortalamadan TAHMİN ediyordu; tahmin ilk günlerde
   * susar ve yanlış girilmiş bir seri kendini normal ilan eder.
   */
  targetMinC: dbNumericNullable,
  targetMaxC: dbNumericNullable,
  /**
   * Günde kaç ölçüm beklendiği — takvimin "eksik gün" ölçütü (19.30). **0 geçerli:** oda sıcaklığı
   * rafından günlük ölçüm beklenmez ve o noktanın boş günü eksik sayılmaz.
   */
  expectedDailyChecks: z.number().int().min(0).max(DAILY_CHECKS_MAX),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type StorageArea = z.infer<typeof StorageAreaSchema>;

export const StorageAreaInsertSchema = StorageAreaSchema.omit({ id: true, createdAt: true })
  .partial({ kind: true, isActive: true, sortOrder: true, targetMinC: true, targetMaxC: true, expectedDailyChecks: true })
  .extend({ name: z.string().min(1) });
export type StorageAreaInsert = z.infer<typeof StorageAreaInsertSchema>;

export const StorageAreaUpdateSchema = StorageAreaSchema.partial().required({ id: true });
export type StorageAreaUpdate = z.infer<typeof StorageAreaUpdateSchema>;

/**
 * ARAÇ — bir kez tanımlanıp (0031) tüketeni olmadığı için düşürülmüştü (03.08). O günün künyesi
 * *"gerçekten gerekince geri gelir ve o gün doğru soruyu sorarız: araç bir depoya mı, bir güne mi,
 * bir kuryeye mi bağlanır"* diyordu. Cevap: **araç bir ölçüm noktasıdır.**
 *
 * `warehouseId` nullable ve hiçbir yerde zorlanmıyor — bir aidiyet değil adres ("genelde buradan
 * yükler"). K8'in itirazı bağın KISIT olmasınaydı; kurye günü ve gün kapanışı kurye/gün ekseninde
 * aynen duruyor (`DOMAIN §7`), araç ne bir güne ne bir kuryeye bağlanıyor.
 */
export const VehicleSchema = z.object({
  id: z.string().uuid(),
  /** Benzersiz: iki kayıt aynı aracı gösterirse soğuk zincir geçmişi ikiye bölünür. */
  plate: z.string(),
  label: z.string().nullable(),
  warehouseId: z.string().uuid().nullable(),
  /**
   * Varsayılanı **0** (alandakinden farklı): soğutuculu araç da var sıradan araç da ve ayrım veride
   * tutulmuyor — her araçtan günlük ölçüm beklemek yarısı için her gün yalancı eksik üretirdi.
   */
  expectedDailyChecks: z.number().int().min(0).max(DAILY_CHECKS_MAX),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const VehicleInsertSchema = VehicleSchema.omit({ id: true, createdAt: true })
  .partial({ label: true, warehouseId: true, isActive: true, sortOrder: true, expectedDailyChecks: true })
  .extend({ plate: z.string().min(1) });
export type VehicleInsert = z.infer<typeof VehicleInsertSchema>;

export const VehicleUpdateSchema = VehicleSchema.partial().required({ id: true });
export type VehicleUpdate = z.infer<typeof VehicleUpdateSchema>;
