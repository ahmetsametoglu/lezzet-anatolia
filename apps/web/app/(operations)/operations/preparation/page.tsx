import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { WarehouseChoicePane } from '@/components/operation/ui/warehouse-choice-pane';
import { AuthError } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { PreparationClient } from './preparation-client';
import { readPreparation } from './preparation-read';

/**
 * **Hazırlık masası** (`/operations/preparation`) — 10.1–10.3.
 * Tasarım: `design/project/Operasyon - Depo Hazirlik.dc.html` (*"· web"* karesi).
 *
 * ── DEPO KAPSAMI GUARD'IN, DEPO SEÇİMİ BAĞLAMIN İŞİ ─────────────────────────
 * Depocu yalnız kendi deposunun kuyruğunu görür; kapsamsız personel hiçbir şey görmez
 * (fail-closed — boş kapsam "hepsi" değildir). **Varsayılan depo YOKTUR**: kapsam tek depoysa
 * cevap bellidir, çok depoluysa operatör üst bardaki seçiciden söyler.
 *
 * **Çok depoluda artık süzgeçsiz okuma YAPILMIYOR** (10.7). Eskiden yapılıyordu ve iki kusuru
 * vardı: (1) üst bardaki depo seçicisi bu ekranda ÖLÜYDÜ — operatör "Strasbourg" seçse de kuyruk
 * değişmiyordu, çünkü sayfa çerezi hiç okumuyordu; (2) birleşik kuyruk bir yazma ekranında
 * karşılıksızdır — onay tek bir depoya yazılır ve ekranın hangisi olduğunu söylemesi gerekirdi.
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
  // `guarded` KULLANILMIYOR: imzası `() => Promise<AuthUser>` ve bağlam kapısı kapsamı da
  // çözüyor. Guard'ı imzaya uydurmak aynı profili iki kez okumak olurdu — reddi burada yakalamak
  // hem tek okuma hem daha az dolaylı.
  let workplace;
  try {
    workplace = await readWorkWarehouse();
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Hazırlık"
        reason="Hazırlık masası depo personeline açıktır. Bir depoya atanmamış hesap bu kuyruğu göremez."
      />
    );
  }

  if (workplace.status !== 'ok') {
    return (
      <WarehouseChoicePane
        title="Hazırlık"
        hasOptions={workplace.status === 'needs_choice'}
        reason={
          workplace.status === 'none'
            ? 'Kapsamınızdaki depoların tamamı kapalı.'
            : 'Hazırlık kuyruğu tek bir deponun işidir — onay o deponun partilerine yazılır.'
        }
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <PreparationClient data={await readPreparation({ id: workplace.warehouseId, name: workplace.name }, today)} />
  );
}
