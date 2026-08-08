import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireAdmin } from '@/lib/guard';
import { RecipesClient } from './recipes-client';
import { readRecipes } from './recipes-read';

/**
 * **Tarifler** (`/operations/recipes`) — tarif yönetimi (09.21).
 * Tasarım: `design/project/Operasyon - Tarifler.dc.html`.
 *
 * ── ZİNCİRDE KRİTİK YOL ─────────────────────────────────────────────────────
 * Tarif verisi BU ekrandan doğuyor: veri modeli (05.16) hazır, müşteri yüzeyi (08.24) bekliyor.
 * Seed'de tarif yok ve olmamalı — kurgu tarif, gerçek tarif gibi okunur.
 *
 * ── YALNIZ MASAÜSTÜ ─────────────────────────────────────────────────────────
 * Operasyon yüzeyinde `*.mobile` forku YAZILMAZ (kullanıcı kararı 06.08): personelin mobil
 * deneyimi native uygulamanın işi. Tarif yazmak zaten uzun metin işi, telefonun işi değil.
 *
 * ── SEÇİM ADRESTE ───────────────────────────────────────────────────────────
 * `?r=<id>`: bir tarifin bağlantısı paylaşılabilmeli. Seçim istemci durumu istemiyor — sunucu
 * zaten yalnız seçili tarifin kalemlerini okuyor, yani seçim bir OKUMA parametresi.
 */
interface RecipesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const admin = await guarded(requireAdmin);
  if (!admin.ok) {
    return <NoAccessPane title="Tarifler" reason="Tarif yönetimi yöneticinin işidir." />;
  }

  const params = await searchParams;
  // Dizi gelen parametre YOK SAYILIR (emsal `deliveries-url`): aynı anahtar iki kez yazılmış bir
  // adres, seçimi belirsiz bırakır ve ekran o hâlde hiçbir tarifi seçmemeli.
  const selectedId = typeof params.r === 'string' ? params.r : null;

  return <RecipesClient data={await readRecipes(selectedId)} selectedId={selectedId} />;
}
