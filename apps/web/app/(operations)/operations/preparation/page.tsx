import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { AuthError, requireWarehouseScope } from '@/lib/guard';
import { PreparationClient } from './preparation-client';
import { readPreparation } from './preparation-read';

/**
 * **Hazırlık masası** (`/operations/preparation`) — 10.1–10.3.
 * Tasarım: `design/project/Operasyon - Depo Hazirlik.dc.html` (*"· web"* karesi).
 *
 * ── DEPO KAPSAMI GUARD'IN İŞİ ───────────────────────────────────────────────
 * Depocu yalnız kendi deposunun kuyruğunu görür; kapsamsız personel hiçbir şey görmez
 * (fail-closed — boş kapsam "hepsi" değildir). **Varsayılan depo YOKTUR**: kapsam tek depoysa o
 * depo süzülür, çok depoluysa (yönetici) süzgeç uygulanmaz.
 *
 * ── BUGÜN, SADECE BUGÜN ─────────────────────────────────────────────────────
 * Kuyruk teslim gününe göre süzülüyor ve gün SUNUCUDA belirleniyor. Adresten gün almak
 * (`?date=`) bilerek yapılmadı: tasarımın kuralı *"liste yalnız bugünün işi"* ve geçmiş günün
 * kuyruğunu açabilen bir adres, arşivi bu ekrana yığmanın ilk adımı olurdu.
 *
 * ── YALNIZ MASAÜSTÜ ─────────────────────────────────────────────────────────
 * Operasyon web'i masaüstü-yalnız (kullanıcı kararı 06.08). Raf karşısındaki toplama akışı native
 * uygulamanın işi (`21.11`) ve tasarım da bunu söylüyor: *"bu ekran deponun masasıdır"*.
 */
export default async function PreparationPage() {
  // `guarded` KULLANILMIYOR: imzası `() => Promise<AuthUser>` ve bu guard kapsamı da döndürüyor.
  // Guard'ı imzaya uydurmak için kapsamı ikinci bir çağrıyla almak, aynı profili iki kez okumak
  // olurdu — sarmalayıcı yerine reddi burada yakalamak hem tek okuma hem daha az dolaylı.
  let scope;
  try {
    ({ scope } = await requireWarehouseScope());
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Hazırlık"
        reason="Hazırlık masası depo personeline açıktır. Bir depoya atanmamış hesap bu kuyruğu göremez."
      />
    );
  }

  // Tek depolu kapsamda o depo süzülür; `all` (yönetici) ve çok depolu kapsamda süzgeç yok —
  // "ilkini seç" gibi bir varsayılan, depocuya yanlış deponun işini gösterirdi (`DOMAIN §17`).
  const warehouseId = scope.kind === 'limited' && scope.warehouseIds.length === 1 ? (scope.warehouseIds[0] ?? null) : null;

  const today = new Date().toISOString().slice(0, 10);
  return <PreparationClient data={await readPreparation(warehouseId, today)} />;
}
