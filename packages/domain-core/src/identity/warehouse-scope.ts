import type { UserRole } from '@lezzet/types';

/**
 * Depo kapsamı (19.3) — DOMAIN §17. **Rolün ikinci ekseni: ne yapar × NEREDE yapar.**
 *
 * ── FAIL-CLOSED ──────────────────────────────────────────────────────────────
 * Boş kapsam "hepsi" DEĞİL, "hiçbiri" demektir. Bu ayrım izin sisteminin en kolay delinen yeridir:
 * `warehouseIds.length === 0` gördüğünde "süzgeç yok, hepsini göster" diye yorumlayan tek bir satır,
 * kapsamı yanlışlıkla boşaltılmış bir depocuya tüm ağı açar. Doğru okuma tersidir — kapsamı
 * olmayan kapı kapalıdır.
 *
 * ── DEPO-ÜSTÜ ROLLER ─────────────────────────────────────────────────────────
 * Admin ve muhasebe depoya bağlı değildir: biri ağı yönetir, öteki defteri tutar. Onlarda kapsam
 * satırı ARANMAZ — boş olması normaldir ve "hiçbiri" anlamına gelmez. Ayrım rolde, kapsamda değil.
 *
 * Saf: kimin neyi göreceğine karar verir, veriyi çağıran getirir.
 */

/** Depoya bağlı roller — kapsamsız olamazlar (DB'de de CHECK ile zorlanır). */
const WAREHOUSE_BOUND_ROLES: readonly UserRole[] = ['warehouse', 'courier'];

/** Depo-üstü roller — kapsamları okunmaz, tüm ağı görürler. */
const WAREHOUSE_AGNOSTIC_ROLES: readonly UserRole[] = ['admin', 'accounting'];

export type WarehouseScope =
  /** Tüm depolar — admin/muhasebe. Süzgeç uygulanmaz. */
  | { kind: 'all' }
  /** Yalnız bu depolar. En az bir kimlik içerir (boşsa `none` olurdu). */
  | { kind: 'limited'; warehouseIds: readonly string[] }
  /** Hiçbir depo — kapalı kapı. Kapsamsız depocu/kurye ya da personel olmayan kişi. */
  | { kind: 'none' };

/**
 * Kişinin görebileceği depo kümesi.
 *
 * Depo-üstü rol kapsamı EZER: depo + muhasebe rolü olan kişi (seed'deki gibi) tüm ağı görür.
 * Tersi tercih edilseydi muhasebeci kendi deposunun defterini tutardı ve ağ toplamı kimsede
 * olmazdı — muhasebenin işi tam olarak o toplamdır.
 */
export function warehouseScope(roles: readonly UserRole[], warehouseIds: readonly string[]): WarehouseScope {
  if (roles.some((r) => WAREHOUSE_AGNOSTIC_ROLES.includes(r))) return { kind: 'all' };
  if (!roles.some((r) => WAREHOUSE_BOUND_ROLES.includes(r))) return { kind: 'none' };
  if (warehouseIds.length === 0) return { kind: 'none' };
  return { kind: 'limited', warehouseIds: [...warehouseIds] };
}

/** Bu kişi bu depoda iş yapabilir mi — guard'ın tek soru cümlesi. */
export function canAccessWarehouse(scope: WarehouseScope, warehouseId: string): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'none') return false;
  return scope.warehouseIds.includes(warehouseId);
}

/**
 * Ekranın depo seçicisinde hangi depolar listelenir.
 *
 * Seçenek TEK ise seçici gösterilmez — seçenek sunmak, olmayan bir kararı varmış gibi
 * göstermektir. Birden çoksa seçici gösterilir ama **varsayılan seçilmez** (C2: varsayılan depo
 * kavramı yok) — sistem onun yerine karar vermez.
 *
 * ── KAPSAM ≠ ELDEKİ DEPO: `allWarehouseIds` HER İKİ DALDA DA SÜZER ───────────
 * `allWarehouseIds` "bugün seçilebilir olanlar"dır (çağıran onu aktiflikle ve neyi listelediğiyle
 * belirler); kapsam ise "yetkim nereye yeter". İkisi ayrışır: iki depoya atanmış personelin
 * depolarından biri KAPATILMIŞSA kapsam hâlâ iki kimlik taşır, seçilebilir tek depo kalmıştır ve
 * doğru davranış SORMAMAKTIR.
 *
 * `limited` dalı 27.08'e kadar bu argümanı yok sayıyor, kapsamı olduğu gibi döndürüyordu — yani
 * kapatılmış tesisi de seçenek sayıyor ve o hâlde *"seç"* diyordu. Fonksiyon üretimde hiç
 * çağrılmadığı için arıza görünmüyordu; `03.12`de uygulama katmanındaki nüshayla karşılaştırılınca
 * çıktı (`apps/web/lib/warehouse/context.ts`, `readWorkWarehouse`). Kesişim aynı zamanda
 * argümanı ANLAMLI kılar: tek dalda kullanılan bir parametre, okuyanına yanlış söz verir.
 *
 * Sıra `allWarehouseIds`ten gelir, kapsamdan değil: ekranın listeleme sırası (`sort_order`)
 * çağıranın bileceği iştir, kapsam satırı ise rastgele sıralıdır.
 */
export function warehouseOptions(
  scope: WarehouseScope,
  allWarehouseIds: readonly string[],
): { options: readonly string[]; needsChoice: boolean } {
  const options =
    scope.kind === 'all'
      ? [...allWarehouseIds]
      : scope.kind === 'limited'
        ? allWarehouseIds.filter((id) => scope.warehouseIds.includes(id))
        : [];
  return { options, needsChoice: options.length > 1 };
}
