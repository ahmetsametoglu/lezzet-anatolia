'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, serviceDb } from '@lezzet/database';
import type { ProductDetailsUpdate } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';

// Ürün BEYANINI yazma yolu — asistan kuyruğunun ürün gövdesinin kapısı (22.14).
//
// Server action'lar kural gereği sayfa klasöründe kolokasyon eder (`CLAUDE §2`); bu eylem ürün
// sekmesinin `updateProductAction`ından ayrı duruyor çünkü İKİ AYRI İŞ yapıyorlar: ürün formu
// ürünün TAMAMINI yazar (ad, kategori, KDV, varyantlar, marj) ve varyantları senkronlar; kuyruk
// yalnız beyan alanlarına dokunur ve varyantlara hiç bakmaz. Kuyruğu ürün eylemine bağlamak,
// asistanın hiç bilmediği alanları (varyant listesi!) her onayda yeniden yazmak olurdu.

/** Ürün listesinin yolu; beyan yazılınca liste tazelenir (eksik-beyan rozetleri değişir). */
const PRODUCTS_PATH = '/operations/products';

/**
 * Ürünün beyan alanlarını yazar — **yalnız verilen alanlara dokunur.**
 *
 * `updateDetails` düz bir `update` ve sürüm tutmuyor: dolu bir açıklamanın üzerine yazmak geri
 * alınamaz. Bu yüzden hangi alanların yazılacağını ÇAĞIRAN seçer ve buraya yalnız onlar gelir —
 * `undefined` bir alan hiç gönderilmez, `null` ise "boşalt" demektir ve o da bilinçli bir karardır.
 *
 * `status` BU KAPIDAN GEÇMEZ ve geçmemeli: asistan beyanı doldurabilir ama ürünü satışa çıkaramaz
 * (`AI_ADMIN_ASSISTANT §6`). Yayın kararı katalog ekranının işi.
 *
 * **Boş girdi sessizce başarılı sayılmaz:** hiçbir alan seçilmediyse onay bir şey yapmayacak
 * demektir; kuyruk satırını "uygulandı" diye kapatmak, hiç yapılmamış bir işi yapılmış göstermek
 * olurdu.
 */
export async function saveProductDeclarationAction(
  productId: string,
  fields: ProductDetailsUpdate,
  /**
   * Asistan önerisinden gelindiyse o önerinin kimliği. Yoksa akış değişmez — eylem elle de
   * çağrılabilir ve o yol tek satır bile farklı koşmaz (`saveDiscountAction` ile aynı desen).
   */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    if (Object.keys(fields).length === 0) {
      return { data: null, error: 'Hiçbir alan seçilmedi — yazılacak bir şey yok.' };
    }

    const db = serviceDb();
    await withProposal(
      proposalId,
      staff.id,
      () => new ProductService(db).updateDetails(productId, fields),
      // ── HANGİ ALANLAR YAZILDI, KAYITTA DURUR ────────────────────────────
      // Operatör alan alan seçiyor (22.14) ve seçtiği küme dilekçeninkinden dar olabilir. Yalnız
      // `productId` yazsaydık arşiv "öneri uygulandı" der, hangi alanların gerçekten yazıldığını
      // hiçbir yerden okuyamazdık — üstelik ekran formu "hepsi seçili" hâliyle yeniden açtığı için
      // uygulanmamış alanlar uygulanmış GİBİ görünürdü.
      () => ({ productId, fields: Object.keys(fields).join(',') }),
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
