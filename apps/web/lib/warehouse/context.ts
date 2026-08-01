import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { WarehouseService, serviceDb } from '@lezzet/database';
import { canAccessWarehouse, type WarehouseScope } from '@lezzet/domain-core';
import type { Warehouse } from '@lezzet/types';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * Operasyon bağlamı (19.14) — **"hangi evrende çalışıyorum"** sorusunun tek cevabı.
 *
 * Tasarım bağlamı kalıcı ve oturumlar arası hatırlanan bir tercih olarak tanımlıyor, ama URL'e
 * YAZILMIYOR: paylaşılan bir bağlantı alıcının bağlamını ezmemeli. Sayfalar RSC olduğu için
 * bağlamı render anında bilmek zorundalar — o yüzden çerez.
 *
 * ── ÇEREZ HER OKUMADA KAPSAMA KARŞI DOĞRULANIR ───────────────────────────────
 * Çerezi istemci yazabilir. Doğrulanmayan bir bağlam **yetki atlatmadır**: depocu çereze başka
 * deponun kimliğini yazar ve o deponun stoğunu okur. Doğrulama tek satır (`canAccessWarehouse`),
 * ama asıl mesele o satırın HER okumada çalışması — yani tek kapıdan geçmesi. Bu dosya o kapı.
 *
 * Uymayan değer sessizce DÜŞER, hata ekranı üretmez: kapsamı sonradan daraltılan personel bir
 * arıza görmemeli, sadece daha azını görmeli.
 *
 * ── GUARD YETKİYİ, KAPI BAĞLAMI VERİR ────────────────────────────────────────
 * `requireWarehouseScope` "bu kişi personel mi, kapsamı ne" sorusunu cevaplar. Bu kapı onun
 * üstünde durur ve "bugün hangi depoya bakıyor" sorusunu cevaplar. İkisi ayrı sorular; guard'a
 * bağlam eklemek, yetki kontrolünü bir tercihe bağlamak olurdu.
 */

/** Bağlam çerezi. Değeri `<uuid>` ya da `"all"` — müşterinin değil PERSONELİN tercihi. */
const COOKIE = 'lezzet.ops.warehouse';
const ALL = 'all';

/**
 * Bugün dışa AÇILMIYOR: çağıranlar alanları destructuring ile alıyor ve tipe adıyla ihtiyaç duyan
 * yok. Seçici komponenti (19.5) prop tipi olarak isteyince export edilir — o güne kadar açık
 * durması, kimsenin kullanmadığı bir sözleşmeyi kamuya açmak olurdu.
 */
interface WarehouseContext {
  scope: WarehouseScope;
  /** Kapsamla SÜZÜLMÜŞ depolar — seçiciyi çizmeye yeter (ad + kod). Kapsam dışı depo burada yoktur. */
  warehouses: Warehouse[];
  /** Etkin bağlam; "tüm depolar" seçiliyken null. Kapsama karşı doğrulanmıştır. */
  activeWarehouseId: string | null;
  /**
   * Okumalara geçilecek süzgeç — `OrderListFilters.warehouseIds`, `listAvailableAcross`,
   * `WarehouseService.list` hepsi bu sözleşmeyi kullanır: `undefined` = depo-üstü ·
   * dizi = o depolar · boş dizi = hiçbiri.
   *
   * Dönüşüm BURADA yapılır, çağıranlarda değil: her sayfanın `scope`'tan diziyi kendi türetmesi
   * aynı mantığın beş kopyası olurdu ve biri bir gün `none`'ı boş dizi yerine `undefined` yapardı
   * — o da "hepsi" demek.
   */
  warehouseIds: readonly string[] | undefined;
}

/**
 * İstek başına bağlam. `cache()` ile tek tur: aynı render'da başlık seçicisi, liste ve sayaçlar
 * üç kez sorsa da bir kez çözülür — ve daha önemlisi ÜÇÜ AYNI cevabı görür.
 *
 * Kapsamsız personelde `requireWarehouseScope` zaten `forbidden` fırlatır; buraya gelen herkesin
 * en az bir deposu vardır.
 */
export const readWarehouseContext = cache(async (): Promise<WarehouseContext> => {
  const { scope } = await requireWarehouseScope();

  // Kapsam dışı depo hiçbir seçicide GÖRÜNMEZ (görüp de seçememek değil, hiç görmemek).
  const warehouses = await new WarehouseService(serviceDb()).list({
    activeOnly: true,
    warehouseIds: scope.kind === 'limited' ? scope.warehouseIds : undefined,
  });

  const raw = (await cookies()).get(COOKIE)?.value;
  // Çerezdeki kimlik kapsama karşı doğrulanır. Geçmezse "tüm depolar"a düşer — kapalı kapı değil,
  // daha geniş ama YETKİLİ bir görüş: kapsamı daraltılan personel çalışmaya devam edebilmeli.
  const activeWarehouseId =
    raw && raw !== ALL && canAccessWarehouse(scope, raw) && warehouses.some((w) => w.id === raw) ? raw : null;

  return {
    scope,
    warehouses,
    activeWarehouseId,
    warehouseIds: warehouseIdsFor(scope, activeWarehouseId, warehouses),
  };
});

/**
 * Bağlam → süzgeç. Üç hâl, üç ayrı anlam:
 *
 * - Tek depo seçili → yalnız o.
 * - "Tüm depolar" + `all` kapsam → süzgeç YOK (admin gerçekten her şeyi görür).
 * - "Tüm depolar" + `limited` kapsam → **kapsamdaki depolar**. Tasarımın kuralı: çok kapsamlı
 *   personel için "tümü" demek "kapsamımdaki depolar" demektir, ağın tamamı değil.
 */
function warehouseIdsFor(
  scope: WarehouseScope,
  activeWarehouseId: string | null,
  warehouses: readonly Warehouse[],
): readonly string[] | undefined {
  if (activeWarehouseId) return [activeWarehouseId];
  if (scope.kind === 'all') return undefined;
  // `limited`: kapsamdaki AKTİF depolar. Pasif depo süzgece girmez — kapalı tesisin siparişi
  // listede görünse operatör onu hazırlamaya çalışırdı.
  return warehouses.map((w) => w.id);
}
