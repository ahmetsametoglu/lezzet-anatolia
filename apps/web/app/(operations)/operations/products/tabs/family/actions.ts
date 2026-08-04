'use server';

import { revalidatePath } from 'next/cache';
import { ProductFamilyService, ProductService, serviceDb } from '@lezzet/database';
import type { LocalizedText } from '@lezzet/types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireAdmin } from '@/lib/guard';
import { PRODUCTS_PATH } from '../../products-paths';

// Ürün ailesi server action'ları (05.15) — guard ilk + servise devret + `{ data, error }`.
//
// **Aile bir ÜRÜN ÖZELLİĞİ değil, ürünlerin üstünde ince bir gruplama.** Üye = bugünkü ürün: kendi
// sayfası, kendi beyanı, kendi fiyatı var. Buradaki yazımların hiçbiri ürünü değiştirmiyor, yalnız
// hangi kümede durduğunu ve o kümedeki sırasını/etiketini söylüyor.

/**
 * Aileye katılabilecek ürünler — UZAK arama.
 *
 * Katalogun tamamını forma indirmenin karşılığı yok (141 ürün bugün, yarın daha çok). **Zaten bir
 * ailesi olanlar elenir** ve bu şemanın kuralının yüzü: bir ürün en çok bir ailede olabilir
 * (`family_id` kolonu). Elenmeselerdi operatör bir ürünü ikinci aileye ekler, ürün sessizce
 * birincisinden düşerdi — hiçbir yer hata vermezdi.
 */
export async function searchFamilyCandidatesAction(
  term: string,
): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  try {
    await requireAdmin();
    const trimmed = term.trim();
    if (trimmed.length < 2) return { data: [], error: null };

    const page = await new ProductService(serviceDb()).list({ filters: { query: trimmed }, limit: 20 });
    const free = page.rows.filter((product) => !product.familyId);

    return {
      data: free.map((product) => ({
        // Operasyon yüzeyi tek dilli (CLAUDE §2); yedekler katalog kaydı eksikse satırı adsız
        // bırakmasın diye.
        id: product.id,
        name: product.name.tr ?? product.name.fr ?? product.name.de ?? '—',
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Yeni aile — yalnız ad. Tek dilli, çünkü müşteriye görünmüyor (şemanın kendi kararı). */
export async function createFamilyAction(name: string): Promise<ActionResult<{ familyId: string }>> {
  try {
    await requireAdmin();
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: 'Aile adı boş bırakılamaz.' };

    const family = await new ProductFamilyService(serviceDb()).insert({ name: trimmed });
    revalidatePath(PRODUCTS_PATH);
    return { data: { familyId: family.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

export async function renameFamilyAction(familyId: string, name: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: 'Aile adı boş bırakılamaz.' };

    await new ProductFamilyService(serviceDb()).update({ id: familyId, name: trimmed });
    revalidatePath(PRODUCTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Üyeyi aileye KATAR ve aile içi etiketini yazar.
 *
 * **Etiket ZORUNLU** ve bunu veri kısıtı da söylüyor (`product_family_label_required`: `family_id`
 * doluyken `family_label` boş olamaz). Sebebi kartın kendisi: ürün adı "Limonlu kek", kartta okunan
 * "Limonlu" — kartlar yan yana dururken her birinde "kek" kelimesini tekrar etmek seçimi
 * zorlaştırır. Ad'dan türetilemez de: ortak eki kırpmak "Çilekli Kek" ile "Kek Dilimi"nde bozulur.
 *
 * Sıra sona eklenir: yeni üye listenin başına girip operatörün kurduğu sırayı bozmamalı.
 */
export async function addFamilyMemberAction(
  familyId: string,
  productId: string,
  label: LocalizedText,
): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    if (!label.tr?.trim() && !label.fr?.trim() && !label.de?.trim()) {
      return { data: null, error: 'Aile içi etiket en az bir dilde yazılmalı.' };
    }

    const products = new ProductService(serviceDb());
    const members = await products.listFamilyMembers(familyId);
    await products.update({
      id: productId,
      familyId,
      familyLabel: label,
      familyPosition: members.length,
    });

    revalidatePath(PRODUCTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Var olan üyenin etiketini günceller — üyelik ve sıra değişmez. */
export async function setMemberLabelAction(productId: string, label: LocalizedText): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    if (!label.tr?.trim() && !label.fr?.trim() && !label.de?.trim()) {
      return { data: null, error: 'Aile içi etiket en az bir dilde yazılmalı.' };
    }

    await new ProductService(serviceDb()).update({ id: productId, familyLabel: label });
    revalidatePath(PRODUCTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Üyeyi aileden çıkarır.
 *
 * **Etiket de silinir** — kısıtın tersi: ailesiz bir üründe aile etiketi anlamsız bir kalıntı olur
 * ve ürün bir gün başka bir aileye katıldığında eski kardeşlerine göre yazılmış bir adla görünür.
 *
 * Kalanların sırası SIKIŞTIRILIR: çıkarılan üye 2. sıradaysa 3 ve sonrası birer geri kayar, yoksa
 * sıra numaralarında delik kalır ve sonraki eklemeler yanlış yere düşer.
 */
export async function removeFamilyMemberAction(familyId: string, productId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const products = new ProductService(serviceDb());

    await products.update({ id: productId, familyId: null, familyLabel: null, familyPosition: 0 });

    const remaining = await products.listFamilyMembers(familyId);
    await products.reorderFamily(remaining.map((member, index) => ({ productId: member.id, position: index })));

    revalidatePath(PRODUCTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Aile sırası — **tüm aile birden** yazılır (şemanın `ProductFamilyOrder` künyesi).
 *
 * Kısmi güncelleme iki eşzamanlı sürüklemede sıralamada delik bırakırdı ve hiçbir yer hata
 * vermezdi: kartlar bir gün kendiliğinden başka sırada görünürdü.
 */
export async function reorderFamilyAction(productIds: string[]): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    await new ProductService(serviceDb()).reorderFamily(
      productIds.map((productId, index) => ({ productId, position: index })),
    );
    revalidatePath(PRODUCTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
