import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { WarehouseChoicePane } from '@/components/operation/ui/warehouse-choice-pane';
import { AuthError } from '@/lib/guard';
import { readWarehouseContext, readWorkWarehouse } from '@/lib/warehouse/context';
import { PreparationClient } from './preparation-client';
import { readPreparation, readWarehouseChoices, readWarehouseWork } from './preparation-read';
import { WarehouseChoice } from './warehouse-choice';

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
 * ── BUGÜN BİR SÜZGEÇ DEĞİL, BİR EKSEN ───────────────────────────────────────
 * Gün SUNUCUDA belirleniyor ve adresten gün almak (`?date=`) bilerek yapılmadı: geçmiş günün
 * kuyruğunu açabilen bir adres, arşivi bu ekrana yığmanın ilk adımı olurdu.
 *
 * Ama gün artık bir EŞİTLİK SÜZGECİ değil (10.9, ölçüldü 19.08) — kuyruğun üç kulvara ayrıldığı
 * eksen: günü geçmiş → geciken · günü bugün → bugün · günü yok → kargo. Eskisi eşitlikti ve iki
 * şeyi birden düşürüyordu: teslim günü `NULL` olan kargo siparişini (eşitlik `NULL`u hiç tutmaz)
 * ve dünden kalan hazırlanmamış siparişi. Dışarıda kalan tek şey İLERİ tarihli sipariş.
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

  const today = new Date().toISOString().slice(0, 10);

  /**
   * **Depo seçilmemişken artık boş bir kapı DEĞİL, depo satırları** (10.8, kullanıcı isteği 19.08).
   *
   * Kural aynı — varsayılan depo yoktur, sistem operatörün yerine seçmez — ama uygulaması
   * değişti: eskiden koca bir alan tek cümleyle ("Önce depo seçin") duruyor ve çıkış yolunu başka
   * bir yere (üst bardaki seçici) gösteriyordu. Depo seçmek bir engel değil, bu sayfanın İLK
   * ADIMI; satırlar o adımı ekranın içine alıyor ve seçimi bilgiyle besliyor.
   *
   * `none` hâli AYRI kalıyor: seçilecek depo yokken satır çizmek boş bir liste göstermek olurdu ve
   * operatörün burada yapabileceği bir şey yok — çıkış yolu Depolar ekranı.
   */
  if (workplace.status === 'none') {
    return (
      <WarehouseChoicePane
        title="Hazırlık"
        hasOptions={false}
        reason="Kapsamınızdaki depoların tamamı kapalı."
      />
    );
  }

  /**
   * **Kapsamın TAMAMI — `visibleWarehouseIds` DEĞİL** (ölçüldü 19.08).
   *
   * `visibleWarehouseIds` bir depo seçiliyken **tek depoya daralır** (`context.ts:92` — kırılım
   * evreni: "tek depo seçiliyse yalnız o"). Süzgeç için doğru, şerit için yanlış: şeridin işi tam
   * olarak seçili OLMAYAN depoları da göstermek. Onunla beslendiğinde şerit tek çipe iner ve
   * `length > 1` koşuluna hiç takılmaz — yani sessizce hiç çizilmez.
   *
   * `warehouses` kapsamla süzülmüş depoların hepsidir; kapsam dışı depo zaten burada yoktur.
   */
  const { warehouses } = await readWarehouseContext();
  const scopeIds = warehouses.map((w) => w.id);

  if (workplace.status === 'needs_choice') {
    return <WarehouseChoice data={await readWarehouseChoices(scopeIds, today)} />;
  }

  /**
   * **Kuyruk + tesis şeridi** (kullanıcı kararı 19.08). İki okuma PARALEL: şerit kuyruğun bir
   * parçası değil, depolar-arası bir bağlam — sırayla okunsalardı ekran ikinci turu beklerdi.
   *
   * Kapsam tek depoluysa şerit hiç OKUNMUYOR: tek seçenekli bir seçici seçim değil süstür ve
   * uğruna iki sorgu atmak, hiç bakılmayacak bir veriyi her açılışta getirmek olurdu.
   */
  const [data, work] = await Promise.all([
    readPreparation({ id: workplace.warehouseId, name: workplace.name }, today),
    scopeIds.length > 1 ? readWarehouseWork(scopeIds, today) : null,
  ]);

  return <PreparationClient data={data} strip={work?.rows ?? []} />;
}
