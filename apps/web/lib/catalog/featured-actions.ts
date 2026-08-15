'use server';

import { revalidatePath } from 'next/cache';
import { BundleService, CategoryService, CollectionService, serviceDb } from '@lezzet/database';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { withProposal } from '@/lib/assistant/handoff';

const PRODUCTS_PATH = '/operations/products';

/**
 * Hedef türünün servisi — üç varlık da aynı dar YAZMA yüzeyini taşıyor (`setFeatured`).
 *
 * Okuma yüzeyi ise ortak DEĞİL (`list` ↔ `listAll`), o yüzden ayrıca veriliyor: tipleri tek imzada
 * birleştirmek için servislere yeni bir metod eklemek, üç varlığı bu kapının ihtiyacına göre
 * yeniden adlandırmak olurdu.
 */
function gridFor(target: 'category' | 'collection' | 'bundle'): {
  list: () => Promise<Array<{ id: string; isFeatured: boolean }>>;
  setFeatured: (id: string, on: boolean) => Promise<unknown>;
} {
  const db = serviceDb();
  if (target === 'category') {
    const svc = new CategoryService(db);
    return { list: () => svc.list(), setFeatured: (id, on) => svc.setFeatured(id, on) };
  }
  if (target === 'collection') {
    const svc = new CollectionService(db);
    return { list: () => svc.list(), setFeatured: (id, on) => svc.setFeatured(id, on) };
  }
  const svc = new BundleService(db);
  return { list: () => svc.listAll(), setFeatured: (id, on) => svc.setFeatured(id, on) };
}

/**
 * **ÖNERİDEN VİTRİN IZGARASI** — asistan kuyruğunun kendi kapısı (22.35).
 *
 * ── NEDEN TEK KAYIT DEĞİL, IZGARANIN TAMAMI ─────────────────────────────────
 * `setCatalogFeaturedAction` tek bir bayrağı çeviriyor ve katalog ekranı için doğrusu o: orada her
 * satırın kendi anahtarı var. Kuyrukta ise karar BİRLEŞİK — "bunu ekle" demek çoğu zaman "şunu
 * çıkar" demektir, çünkü ızgaranın kontenjanı var. İki ayrı çağrıya bölmek, arada düşen bir istekte
 * ızgarayı yarım bırakırdı: yeni kayıt eklenmiş ama yer açılmamış.
 *
 * Fark HESAPLANIR, çağıranın beyanına güvenilmez: istemci "şunlar vitrinde olsun" der, kapı bugünkü
 * hâlle karşılaştırıp yalnız DEĞİŞENLERE dokunur. Değişmeyen kayda yazmak, `updated_at`i sebepsiz
 * oynatır ve "kim ne zaman değiştirdi" izini kirletir.
 *
 * Yetki `requireStaff` — katalog ekranının kapısıyla AYNI. Kuyruktan gelmek yetkiyi atlatmaz.
 */
export async function setFeaturedGridFromProposalAction(input: {
  target: 'category' | 'collection' | 'bundle';
  /** Vitrinde OLMASI istenen kimlikler — ızgaranın tamamı. */
  featuredIds: string[];
  proposalId: string;
}): Promise<ActionResult<{ changed: number }>> {
  try {
    const staff = await requireStaff();
    const grid = gridFor(input.target);

    const changed = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        const rows = await grid.list();
        const wanted = new Set(input.featuredIds);
        const diff = rows.filter((row) => row.isFeatured !== wanted.has(row.id));
        for (const row of diff) await grid.setFeatured(row.id, wanted.has(row.id));
        return diff.length;
      },
      // `ApplyResult` metin taşır (`Record<string, string | undefined>`): kuyruk satırının sonucu
      // insan tarafından okunacak bir künyedir, sayısal bir dönüş değeri değil.
      (count) => ({ featuredChanged: String(count) }),
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: { changed }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
