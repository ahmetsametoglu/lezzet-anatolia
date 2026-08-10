import 'server-only';
import { CategoryService, CollectionService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * KUYRUKTAKİ FORMLARIN SEÇENEK HAVUZU (22.10).
 *
 * ── NEDEN AYRI BİR OKUMA ────────────────────────────────────────────────────
 * Gövde artık gerçek bir form (indirim kuralı) ve formun `Select` kutuları seçenek ister: kapsam
 * kategorisi, koleksiyon. Bunlar önerinin payload'ında YOKTUR ve olmamalı da — dilekçe hedefin
 * KİMLİĞİNİ taşır, kataloğun tamamını değil. Operatör kapsamı değiştirmek isterse (asistan
 * "Tatlı" demiş, o "Baklava" diyecek) listenin orada olması gerekir.
 *
 * ── TİPE ÖZEL DEĞİL, ORTAK ──────────────────────────────────────────────────
 * Havuz tek yerde çünkü sıradaki gövdeler de aynı iki listeyi isteyecek (ürün taslağının kategorisi,
 * paketin koleksiyonu). Tip başına ayrı okuma yazılsaydı aynı sorgu üç kez koşar ve biri bir gün
 * sıralamayı ötekinden farklı yapardı.
 *
 * ── SAYFALAMA YOK, VE BU KURALA UYGUN ───────────────────────────────────────
 * Kategori ve koleksiyon operatörün elle kurduğu, doğal tavanı olan kümeler (`CLAUDE §1`): tek turda
 * çekilir. Veriyle büyüyen bir küme olsaydı `Select` zaten yanlış kontrol olurdu.
 */
export interface AssistantFormOptions {
  categories: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
}

export async function readAssistantFormOptions(): Promise<AssistantFormOptions> {
  const db = serviceDb();
  const [categories, collections] = await Promise.all([
    new CategoryService(db).list(),
    new CollectionService(db).list(),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    collections: collections.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
  };
}
