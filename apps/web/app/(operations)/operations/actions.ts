'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { writeWarehouseContext } from '@/lib/warehouse/context';
import { OPERATIONS_PREFIX } from '@/lib/operations-request';

// Operasyon KABUĞUNUN eylemleri — tek bir sayfaya ait olmayan, sidebar'dan çağrılanlar.
//
// Depo bağlamı bir sayfanın durumu değil, bütün yüzeyin durumudur (`design/pages/operasyon-depo-
// ekseni.md §2`: "kimlik/ortam düzeyi, rol gibi"). Bu yüzden eylemi de bir sayfa klasörüne değil
// kabuğun köküne koyuyoruz.

/**
 * Depo bağlamını değiştir — sidebar'daki seçicinin tek yolu.
 *
 * **Bütün operasyon yüzeyi tazelenir**, yalnız açık sayfa değil: bağlam sayfadan sayfaya taşınan
 * bir evrendir ve sidebar layout'ta durur. `'layout'` kapsamı olmadan seçicinin kendisi eski
 * değeri gösterirdi — kullanıcı seçer, ekran değişir, seçici değişmez.
 *
 * Süzgecin temizlenmesi (sözleşme kural 2) burada DEĞİL, çağıran taraftadır: URL'i yalnız istemci
 * değiştirebilir ve hangi süzgecin depoya ait olduğunu sayfa bilir.
 */
export async function setWarehouseContextAction(value: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const accepted = await writeWarehouseContext(value);
    // Kapsam dışı bir kimlik reddedilir — sessizce "tüm depolar"a düşmek, kullanıcıya seçtiğini
    // sanma hakkı verirdi.
    if (!accepted) return { data: null, error: 'Bu depo kapsamınızda değil.' };

    revalidatePath(OPERATIONS_PREFIX, 'layout');
    return { data: { ok: true }, error: null };
  } catch (e) {
    return { data: null, error: getErrorMessage(e) };
  }
}
