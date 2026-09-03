import { StockService, StorageAreaService } from '@lezzet/database';
import type { StorageAreaKind } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Partinin alanı = SON GÖRÜLDÜĞÜ YER** (kullanıcı kararı 03.09).
 *
 * ── ÖLÇÜLEN GERÇEK ──────────────────────────────────────────────────────────
 * Parti tek alanda durur (`stock.storage_area_id`) ve depo içinde taşıma diye bir işlem yoktu:
 * hareket türleri arasında "alan değişti" yok, kolonu güncelleyen yazıcı yok. Kabulde bir kez
 * yazılıyor, sonra hiç değişmiyordu. Sahada ise elli paketin onu soğuk odadan dondurucuya gidiyor
 * ve sistem kâğıt üstünde ellisini hâlâ soğuk odada sanıyordu.
 *
 * ── NEDEN TAŞIMA KAYDI DEĞİL ────────────────────────────────────────────────
 * Kullanıcının kararı: *"her şeyi kusursuz yazılıma dökmek sahayı zorlaştırır… kurye aynı zamanda
 * depocuysa gereksiz prosedüre döner."* Kontrolün gerçek hedefi üç şey (fire, son tarih, geri
 * çağırma) ve üçü de PARTİYE bağlı, alan-adet dağılımına değil. Alan yalnız "nerede bulurum"
 * sorusuna yarar. O bilgi için ayrı bir kayıt istemek, korumadığı bir şey için saha yükü demekti.
 *
 * Bunun yerine sistem yeri ZATEN YAPILAN işten öğreniyor: depocu sayımda hangi dolabın önünde
 * durduğunu bir kez söyler, orada okuttuğu/seçtiği parti oraya yazılır. Adet BÖLÜNMEZ (elli paket
 * tek parti kalır), hareket defterine satır düşmez — değişen tek şey partinin adresi.
 *
 * ── BEDELİ SÖYLENDİ ─────────────────────────────────────────────────────────
 * Sistem "dondurucu 1 boşalıyor, doldur" diyemez; tek depocu bunu gözle görüyor. Çok vardiyalı
 * büyük depoda alan-adet tablosu gerekir ve bu yapı o kapıyı kapatmaz.
 *
 * ── TEK YAZICI ──────────────────────────────────────────────────────────────
 * Alanı yazan yer BURASI. Sayım da düşüm de aynı kapıdan geçer; ikinci bir yol açılırsa "alanın
 * bu deponun olduğu" denetimi bir gün yalnız birinde kalır.
 */

export interface WarehouseArea {
  id: string;
  name: string;
  kind: StorageAreaKind;
  sortOrder: number;
}

/**
 * **Deponun açık alanları** — seçicinin envanteri, operatörün sırasıyla.
 *
 * Yalnız AÇIK satırlar: kapatılmış bir dolabı "buradayım" listesine koymak, sökülmüş bir dolaba
 * parti yazdırmaktır. Depo süzgeci ÇAĞIRANDAN (jeton) — servisin kendi kuralı da bunu ister.
 */
export async function listWarehouseAreas(db: SupabaseClient, warehouseId: string): Promise<WarehouseArea[]> {
  const rows = await new StorageAreaService(db).listByWarehouse(warehouseId, { activeOnly: true });
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, sortOrder: row.sortOrder }));
}

export type MarkBatchSeenOutcome =
  /** `changed: false` = parti zaten oradaydı; yazım yok, cevap yine `ok` (çift dokunuş hata değil). */
  | { status: 'ok'; changed: boolean; storageAreaName: string }
  /**
   * Alan bu deponun değil ya da kapatılmış. "Kapsam dışı parti" ile AYNI ŞEY DEĞİL ve ayrı
   * söyleniyor: biri "bu partiye dokunamazsın", öteki "bu dolap burada yok" — düzeltmesi başka.
   */
  | { status: 'invalid_area' }
  /** Parti başka deponun — hiçbir şey yazılmadı (CLAUDE §1'in kapsam kuralı). */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'not_found' };

/**
 * **Parti bu alanda görüldü.** Depocunun aktif alanı partinin kayıtlı alanından farklıysa kayıt
 * güncellenir; aynıysa yazım yok. Çift dokunuş, yeniden okutma, "aynı dolapta iki parti" hepsi
 * aynı cevabı alır: `ok`.
 *
 * Alan ve parti AYNI DEPONUN olmalı ve ikisi de burada sınanır — parti kimliği başka şehrin
 * partisini gösterebilir, alan kimliği başka şehrin dolabını. İkisi de sessizce kabul edilseydi
 * Strasbourg'daki parti Kehl'in dolabına yazılırdı ve hiçbir kısıt bunu yakalamazdı
 * (`stock.storage_area_id` yalnız "var olan bir alan" der, "aynı deponun alanı" demez).
 */
export async function markBatchSeen(
  db: SupabaseClient,
  input: { warehouseId: string; stockId: string; storageAreaId: string },
): Promise<MarkBatchSeenOutcome> {
  const stock = new StockService(db);
  const [batch] = await stock.listByIds([input.stockId]);
  if (batch === undefined) return { status: 'not_found' };
  if (batch.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };

  const [area] = await new StorageAreaService(db).listByIds([input.storageAreaId]);
  if (area === undefined || area.warehouseId !== input.warehouseId || !area.isActive) return { status: 'invalid_area' };

  if (batch.storageAreaId === area.id) return { status: 'ok', changed: false, storageAreaName: area.name };

  await stock.setStorageArea(batch.id, area.id);
  return { status: 'ok', changed: true, storageAreaName: area.name };
}
