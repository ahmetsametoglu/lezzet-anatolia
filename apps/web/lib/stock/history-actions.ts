'use server';

import { readVariantStockHistory, type VariantStockHistory } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';

/**
 * **Seçili ürünün stok geçmişi** (22.30) — satıra tıklandığında okunur.
 *
 * ── NEDEN SUNUCU EYLEMİ, SAYFA OKUMASI DEĞİL ────────────────────────────────
 * Geçmiş yalnız SEÇİLİ boy için anlamlı ve sayfa açılışında hangi boyun seçileceği bilinmiyor.
 * Listedeki her satır için önden okumak, bakılmayacak yirmi ürünün geçmişini her turda getirmek
 * olurdu — asıl maliyet orada olurdu, sorgunun kendisinde değil.
 *
 * ── KAPSAM BURADA DA SORULUYOR ──────────────────────────────────────────────
 * Geçmiş, personelin göremediği bir deponun partisini içeremez: okuma bağlamın depo kümesiyle
 * süzülüyor (`DOMAIN §17`). Kapsamsız personel hiçbir şey göremez — guard fail-closed.
 */
export async function readVariantHistoryAction(
  variantId: string,
  availableQty: number,
  /** Tablodaki depo süzgecinin KODU ('' = süzgeç yok) — satırla aynı evreni açmak için (22.32). */
  warehouseCode: string,
): Promise<ActionResult<VariantStockHistory>> {
  try {
    await requireWarehouseScope();
    const ctx = await readWarehouseContext();
    /**
     * **PANEL SATIRLA AYNI EVRENİ GÖSTERİR** (kullanıcı tespiti 14.08).
     *
     * Süzgeç aktifken satırın sayıları (kullanılabilir/elde/ayrılmış) zaten o deponundur — sayfa
     * okuması `available_stock`ı süzgeçle çekiyor. Panel ise kapsamın TAMAMINI okuyordu: aynı
     * pencerede başlık bir deponun, alttaki parti listesi bütün depoların gerçeğini gösteriyordu.
     * Bu bir tercih değil, iki evrenin tek panele karışmasıydı — ve "yeterlilik" hesabı ikisini
     * birden kullandığı için sayı da yanlıştı (payı süzülmüş, paydası süzülmemiş).
     *
     * Kod → kimlik çevrimi SUNUCUDA ve kapsama karşı doğrulanıyor (`warehouseFilterOf`, kural 7):
     * kapsam dışı bir kod süzgeç olarak geçemez, sessizce düşer ve bağlamın evreni kalır.
     */
    const filter = warehouseFilterOf(ctx, warehouseCode);

    const history = await readVariantStockHistory(serviceDb(), {
      variantId,
      // Sözleşme `WarehouseContext.warehouseIds`in kendisi: `undefined` = depo-üstü, dizi = o depolar.
      warehouseIds: filter.warehouseIds,
      // Yeterlilik hesabının payı EKRANDAKİ kullanılabilir adet: satır zaten aynı evrenle kurulmuş,
      // ikinci kez okumak aynı sayıyı iki yerden almak olurdu.
      availableQty,
      now: new Date(),
    });

    return { data: history, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
