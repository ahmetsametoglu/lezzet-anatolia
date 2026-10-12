import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { WarehouseService, serviceDb } from '@lezzet/database';
import { canAccessWarehouse, warehouseOptions, type WarehouseScope } from '@lezzet/domain-core';
import type { Warehouse } from '@lezzet/types';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * Operasyon bağlamı ("hangi evrende çalışıyorum"): kalıcı tercih çerezde durur, URL'e yazılmaz, çünkü paylaşılan bağlantı alıcının
 * bağlamını ezmemeli. Çerezi istemci yazabildiği için her okumada kapsama karşı doğrulanır ve uymayan değer hata üretmeden düşer; yetkiyi
 * `requireWarehouseScope`, bağlamı bu kapı verir.
 */

/** Bağlam çerezi. Değeri `<uuid>` ya da `"all"` — müşterinin değil PERSONELİN tercihi. */
const COOKIE = 'lezzet.ops.warehouse';
const ALL = 'all';

/** Seçici komponentinin prop tipi olduğu için dışa açık. */
export interface WarehouseContext {
  scope: WarehouseScope;
  /**
   * Varsayılan liste — kapsamla süzülmüş tesisler; seçici, süzgeç ve yazma hedefi bunu kullanır. Araç bir depodur ama mal kabulün,
   * hazırlığın ve rotanın hedefi olamaz (`delivery_zone_warehouse_is_facility`, `warehouse_ship_country_guard`), bu yüzden aracı da
   * içeren liste adında bunu taşır (`warehousesWithVehicles`).
   */
  facilities: Warehouse[];
  /**
   * Araçları da içeren liste — yalnız kimlik → ad sözlüğü, stok kırılımı ("kurye arabasında ne var") ve transfer hedefi için. Seçenek
   * listesi olarak kullanılmaz; seçici, süzgeç ve yazma hedefi `facilities`tir.
   */
  warehousesWithVehicles: Warehouse[];
  /** Etkin bağlam; "tüm depolar" seçiliyken null. Kapsama karşı doğrulanmıştır. */
  activeWarehouseId: string | null;
  /**
   * Okumalara geçilecek süzgeç: `undefined` = depo-üstü, dizi = o depolar, boş dizi = hiçbiri. Dönüşüm burada yapılır ki her sayfa
   * `scope`'tan kendi kopyasını türetmesin.
   */
  warehouseIds: readonly string[] | undefined;
  /**
   * Aynı evrenin sayılmış hâli, daima dizi — süzgeç değil kırılım isteyen okumalar içindir. Süzgeç yerine konmaz: liste yalnız aktif
   * depolardır ve süzgeç gibi kullanılınca kapalı deponun geçmiş siparişlerini sessizce yok sayardı.
   */
  visibleWarehouseIds: readonly string[];
}

/**
 * İstek başına bağlam; `cache()` ile başlık seçicisi, liste ve sayaçlar aynı cevabı görür. Kapsamsız personelde `requireWarehouseScope`
 * zaten `forbidden` fırlatır.
 */
export const readWarehouseContext = cache(async (): Promise<WarehouseContext> => {
  const { scope } = await requireWarehouseScope();

  // Kapsam dışı depo hiçbir seçicide GÖRÜNMEZ (görüp de seçememek değil, hiç görmemek).
  const warehouses = await new WarehouseService(serviceDb()).list({
    activeOnly: true,
    warehouseIds: scope.kind === 'limited' ? scope.warehouseIds : undefined,
  });

  const facilities = warehouses.filter((w) => w.kind === 'facility');

  const raw = (await cookies()).get(COOKIE)?.value;
  // Çerezdeki kimlik kapsama ve tesis listesine karşı doğrulanır; geçmezse daha geniş ama yetkili "tüm depolar" görüşüne düşer, çünkü
  // kapsamı daraltılan personel çalışmaya devam edebilmeli ve araç bir seçenek değildir.
  const activeWarehouseId =
    raw && raw !== ALL && canAccessWarehouse(scope, raw) && facilities.some((w) => w.id === raw) ? raw : null;

  return {
    scope,
    facilities,
    warehousesWithVehicles: warehouses,
    activeWarehouseId,
    warehouseIds: warehouseIdsFor(scope, activeWarehouseId, warehouses),
    // Kırılım evreni: tek depo seçiliyse o, değilse görünen depoların hepsi — araç dahil, çünkü "kurye arabasında ne var" burada doğar.
    visibleWarehouseIds: activeWarehouseId ? [activeWarehouseId] : warehouses.map((w) => w.id),
  };
});

/**
 * İş deposu — okuma süzgeci değil yazma hedefi: kayıt bir kümeye değil tek kapıya yazılır ve varsayılan depo yoktur (CLAUDE §1).
 * `needs_choice` ile `none` ayrıdır, çünkü ekran operatör yerine seçmez ve kapalı depolarda boş seçici sunmaz; "tek seçenekte sorulmaz"
 * kuralı motordadır (`warehouseOptions`) ve motora aktif, araçsız tesis listesi verilir.
 */
type WorkWarehouse =
  | { status: 'ok'; warehouseId: string; name: string }
  | { status: 'needs_choice' }
  | { status: 'none' };

export async function readWorkWarehouse(): Promise<WorkWarehouse> {
  const ctx = await readWarehouseContext();

  const { options, needsChoice } = warehouseOptions(
    ctx.scope,
    ctx.facilities.map((w) => w.id),
  );
  if (options.length === 0) return { status: 'none' };

  // Seçili bağlam kazanır, yoksa motor "sorulmaz" diyorsa tek seçenek alınır. Bağlamda araç seçiliyse cevap `needs_choice` olur:
  // ekran tesisi sordurur, sessizce başka depoya yazmaz.
  const secilenId = ctx.activeWarehouseId ?? (needsChoice ? null : options[0]);
  const chosen = secilenId ? ctx.facilities.find((w) => w.id === secilenId) : null;

  if (chosen) return { status: 'ok', warehouseId: chosen.id, name: chosen.name };
  return { status: 'needs_choice' };
}

/**
 * Kimlik → depo, kapalılar dahil: bağlamın listesi bir yetki kümesidir, bu ise görüntü sözlüğüdür ve kapalı depodan çıkmış eski sipariş
 * de deposunun adını söylemelidir. Dönüş `Warehouse`'un kendisidir, çünkü kırpılmış görünüm tipi `filter.ts` ile döngü kurardı.
 */
export const readWarehouseLabels = cache(async (): Promise<Map<string, Warehouse>> => {
  const rows = await new WarehouseService(serviceDb()).list();
  return new Map(rows.map((w) => [w.id, w]));
});

/**
 * Bağlamı yazar — seçicinin tek yolu, okumayla aynı dosyada, çünkü çerez adı ve doğrulama aynı sözleşmedir. Yazarken de doğrulanır, yoksa
 * kapsam dışı seçim her okumada sessizce geri düşerdi; ömür bir yıldır, çünkü bağlam oturumlar arası hatırlanan tercihtir.
 */
export async function writeWarehouseContext(value: string): Promise<boolean> {
  const { scope } = await requireWarehouseScope();
  if (value !== ALL && !canAccessWarehouse(scope, value)) return false;

  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

/** Bağlam → süzgeç: seçili depo varsa yalnız o, `all` kapsamda süzgeç yok, `limited` kapsamda "tümü" kapsamdaki depolar demektir. */
function warehouseIdsFor(
  scope: WarehouseScope,
  activeWarehouseId: string | null,
  warehouses: readonly Warehouse[],
): readonly string[] | undefined {
  if (activeWarehouseId) return [activeWarehouseId];
  if (scope.kind === 'all') return undefined;
  // Pasif depo süzgece girmez: kapalı tesisin siparişi listede görünse operatör onu hazırlamaya çalışırdı.
  return warehouses.map((w) => w.id);
}
