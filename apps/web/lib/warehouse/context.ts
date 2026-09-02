import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { WarehouseService, serviceDb } from '@lezzet/database';
import { canAccessWarehouse, warehouseOptions, type WarehouseScope } from '@lezzet/domain-core';
import type { Warehouse } from '@lezzet/types';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * Operasyon bağlamı (19.14) — **"hangi evrende çalışıyorum"** sorusunun tek cevabı.
 *
 * Tasarım bağlamı kalıcı ve oturumlar arası hatırlanan bir tercih olarak tanımlıyor, ama URL'e
 * YAZILMIYOR: paylaşılan bir bağlantı alıcının bağlamını ezmemeli. Sayfalar RSC olduğu için
 * bağlamı render anında bilmek zorundalar — o yüzden çerez.
 *
 * ── ÇEREZ HER OKUMADA KAPSAMA KARŞI DOĞRULANIR ───────────────────────────────
 * Çerezi istemci yazabilir. Doğrulanmayan bir bağlam **yetki atlatmadır**: depocu çereze başka
 * deponun kimliğini yazar ve o deponun stoğunu okur. Doğrulama tek satır (`canAccessWarehouse`),
 * ama asıl mesele o satırın HER okumada çalışması — yani tek kapıdan geçmesi. Bu dosya o kapı.
 *
 * Uymayan değer sessizce DÜŞER, hata ekranı üretmez: kapsamı sonradan daraltılan personel bir
 * arıza görmemeli, sadece daha azını görmeli.
 *
 * ── GUARD YETKİYİ, KAPI BAĞLAMI VERİR ────────────────────────────────────────
 * `requireWarehouseScope` "bu kişi personel mi, kapsamı ne" sorusunu cevaplar. Bu kapı onun
 * üstünde durur ve "bugün hangi depoya bakıyor" sorusunu cevaplar. İkisi ayrı sorular; guard'a
 * bağlam eklemek, yetki kontrolünü bir tercihe bağlamak olurdu.
 */

/** Bağlam çerezi. Değeri `<uuid>` ya da `"all"` — müşterinin değil PERSONELİN tercihi. */
const COOKIE = 'lezzet.ops.warehouse';
const ALL = 'all';

/** Seçici komponenti (19.5) prop tipi olarak istedi → dışa açıldı (dosyanın kendi notu gereği). */
export interface WarehouseContext {
  scope: WarehouseScope;
  /**
   * **VARSAYILAN LİSTE — kapsamla süzülmüş TESİSLER.** Seçici, süzgeç ve yazma hedefi bunu kullanır.
   *
   * Araç bir depodur (`0031`) — içindeki mal gerçek partidir, transferi ve stoğu vardır — ama
   * operatörün "hangi depodayım" seçiminde bir seçenek DEĞİLDİR: mal kabulün, satın almanın,
   * hazırlığın ve rotanın hedefi bir tesis olmak zorunda. Kural veritabanında zaten yazılıydı
   * (`delivery_zone_warehouse_is_facility`, `warehouse_vehicle_never_ships`,
   * `available_stock_total`'ın `kind = 'facility'` birleşimi) — eksik olan EKRANDI.
   *
   * ── ADLANDIRMA BİR SAVUNMADIR (02.09) ────────────────────────────────────────
   * Bu alan bir kez `warehouses` adını taşıyordu ve araçları da içeriyordu; her ekran doğru olanı
   * yapmak için ARAÇLARI ELEMEYİ HATIRLAMAK zorundaydı. Hatırlamayan çoktu: mal kabul, satın alma,
   * hazırlık şeridi, rota çıkış deposu, üstteki süzgeç çubuğu ve başlıktaki seçicinin hepsi aracı
   * gösteriyordu. Bir düzeltme turu daha yapmak yerine **varsayılan güvenli** yapıldı: tehlikeli
   * olan liste artık adında ne olduğunu söylüyor (`warehousesWithVehicles`) ve derleyici onu
   * isteyen her yeri tek tek saydırıyor. Unutmanın sonucu artık yanlış ekran değil, kırmızı build.
   */
  facilities: Warehouse[];
  /**
   * **ARAÇLARI DA İÇEREN liste** — yalnız aracın gerçekten bir cevap olduğu üç soru için:
   * *(a)* kimlik → ad sözlüğü (araçtan çıkmış bir kayıt adını söyleyebilmeli), *(b)* stok kırılımı
   * (*"kurye arabasında ne var"* gerçek bir sorudur, `data-model/depo.md`), *(c)* transfer hedefi
   * (aracı yüklemek bir transferdir).
   *
   * Bunu SEÇENEK listesi olarak kullanma. Seçici, süzgeç ve yazma hedefi `facilities`tir.
   */
  warehousesWithVehicles: Warehouse[];
  /** Etkin bağlam; "tüm depolar" seçiliyken null. Kapsama karşı doğrulanmıştır. */
  activeWarehouseId: string | null;
  /**
   * Okumalara geçilecek süzgeç — `OrderListFilters.warehouseIds`, `listAvailableAcross`,
   * `WarehouseService.list` hepsi bu sözleşmeyi kullanır: `undefined` = depo-üstü ·
   * dizi = o depolar · boş dizi = hiçbiri.
   *
   * Dönüşüm BURADA yapılır, çağıranlarda değil: her sayfanın `scope`'tan diziyi kendi türetmesi
   * aynı mantığın beş kopyası olurdu ve biri bir gün `none`'ı boş dizi yerine `undefined` yapardı
   * — o da "hepsi" demek.
   */
  warehouseIds: readonly string[] | undefined;
  /**
   * Aynı evrenin SAYILMIŞ hâli — daima dizi. `listAvailableAcross` gibi süzgeç değil **kırılım**
   * isteyen okumalar içindir: "hangi depoların satırını çizeceğim".
   *
   * ⚠ Bunu bir süzgeç yerine KOYMA. `undefined` süzgeç "hiç süzme" demektir ve kapalı deponun
   * geçmiş kaydını da kapsar; buradaki liste yalnız AKTİF depolardır. Sipariş listesinde ikisini
   * karıştırmak, kapatılmış bir depodan çıkmış eski siparişleri sessizce yok sayardı — geçmiş
   * kaybolmaz, yalnız satılabilir stok kapanır. Tip de bu yönü korur: süzgeç alanı `undefined`
   * kabul eder, bu alan etmez.
   */
  visibleWarehouseIds: readonly string[];
}

/**
 * İstek başına bağlam. `cache()` ile tek tur: aynı render'da başlık seçicisi, liste ve sayaçlar
 * üç kez sorsa da bir kez çözülür — ve daha önemlisi ÜÇÜ AYNI cevabı görür.
 *
 * Kapsamsız personelde `requireWarehouseScope` zaten `forbidden` fırlatır; buraya gelen herkesin
 * en az bir deposu vardır.
 */
export const readWarehouseContext = cache(async (): Promise<WarehouseContext> => {
  const { scope } = await requireWarehouseScope();

  // Kapsam dışı depo hiçbir seçicide GÖRÜNMEZ (görüp de seçememek değil, hiç görmemek).
  const warehouses = await new WarehouseService(serviceDb()).list({
    activeOnly: true,
    warehouseIds: scope.kind === 'limited' ? scope.warehouseIds : undefined,
  });

  const facilities = warehouses.filter((w) => w.kind === 'facility');

  const raw = (await cookies()).get(COOKIE)?.value;
  // Çerezdeki kimlik kapsama karşı doğrulanır. Geçmezse "tüm depolar"a düşer — kapalı kapı değil,
  // daha geniş ama YETKİLİ bir görüş: kapsamı daraltılan personel çalışmaya devam edebilmeli.
  //
  // Doğrulama TESİS listesine karşı (02.09): seçici artık aracı sunmuyor, dolayısıyla çerezde bir
  // araç kimliği ancak eski bir seçimden ya da elle düzenlemeden gelir — ikisi de "tüm depolar"a
  // düşmeli. Kapsam denetiminin (`canAccessWarehouse`) yerini almaz, üstüne biner.
  const activeWarehouseId =
    raw && raw !== ALL && canAccessWarehouse(scope, raw) && facilities.some((w) => w.id === raw) ? raw : null;

  return {
    scope,
    facilities,
    warehousesWithVehicles: warehouses,
    activeWarehouseId,
    warehouseIds: warehouseIdsFor(scope, activeWarehouseId, warehouses),
    // Kırılım evreni: tek depo seçiliyse yalnız o, değilse görünen depoların hepsi — ARAÇ DAHİL.
    // Süzgeç seçeneği değil kırılım evreni: "kurye arabasında ne var" satırı burada doğuyor.
    visibleWarehouseIds: activeWarehouseId ? [activeWarehouseId] : warehouses.map((w) => w.id),
  };
});

/**
 * **İŞ deposu** — okuma süzgeci değil, YAZMA hedefi (10.7).
 *
 * Depo ekranları (hazırlık · mal kabul · stoktan düş) bağlamın `warehouseIds` süzgecini
 * KULLANAMAZ: o bir küme ve "hepsi" hâli var; bu ekranlar ise tek bir depoya YAZIYOR. Kayıt bir
 * kümeye yazılamaz, bir kapıya yazılır — `@lezzet/application`'ın üç depo kapısı da bu yüzden
 * `warehouseId`'yi zorunlu istiyor (CLAUDE §1: *"varsayılan depo YOKTUR"*).
 *
 * Üç hâl, üç ayrı cevap — ve `needs_choice` ile `none` BİLEREK ayrı:
 * - **`ok`** — bağlamda seçili depo var, ya da kapsamda zaten tek depo var (seçilecek bir şey yok).
 * - **`needs_choice`** — kapsam çok depolu ve operatör henüz seçmedi. Ekran onun yerine SEÇMEZ;
 *   "ilkini al" bir varsayılandır ve malı yanlış kapıdan sokar.
 * - **`none`** — kapsamdaki depoların hepsi kapatılmış. Operatörü "depo seçin" diye boş bir
 *   seçiciye göndermek, çözemeyeceği bir iş vermek olurdu.
 *
 * Tek seçenekte seçim SORULMAZ ve bu kural **motorundur** (`warehouseOptions`): *"seçenek sunmak,
 * olmayan bir kararı varmış gibi göstermektir"*. 27.08'e kadar burada ELLE yeniden yazılmıştı —
 * künye motoru alıntılıyor, kod kendi nüshasını çalıştırıyordu (`03.12`). Artık motora soruluyor.
 *
 * **Motora ne veriliyor, önemli:** `ctx.facilities` — yani AKTİF, kapsamla süzülmüş ve ARAÇSIZ
 * liste; ham kapsam değil. Motorun ikinci argümanı *"bugün seçilebilir olanlar"* demek; oraya ağın
 * tamamını vermek kapatılmış bir tesisi seçenek yapardı, `warehouses`ı vermek de aracı. Burası
 * tanımı gereği YAZMA hedefi (künyenin ilk satırı) ve araca mal kabul edilmez, araçtan sipariş
 * hazırlanmaz — araç yalnız transferle dolar. Kapsam denetimi zaten `readWarehouseContext`te
 * yapıldı, burada ikinci kez sorulmaz.
 *
 * Yan etkisi istenen bir sadeleşme: kapsamı "STR + araç" olan kuryede seçilecek tek tesis kalır,
 * yani `needs_choice` hiç doğmaz — motorun *"seçenek sunmak, olmayan bir kararı varmış gibi
 * göstermektir"* kuralı burada kendiliğinden işler.
 */
type WorkWarehouse =
  | { status: 'ok'; warehouseId: string; name: string }
  | { status: 'needs_choice' }
  | { status: 'none' };

export async function readWorkWarehouse(): Promise<WorkWarehouse> {
  const ctx = await readWarehouseContext();

  const { options, needsChoice } = warehouseOptions(
    ctx.scope,
    ctx.facilities.map((w) => w.id),
  );
  if (options.length === 0) return { status: 'none' };

  // Seçili bağlam kazanır; yoksa motor "sorulmaz" diyorsa tek seçenek alınır. Kapsam doğrulaması
  // `readWarehouseContext` içinde yapıldı — burada ikinci kez sorulmaz, yoksa aynı kuralın iki
  // kopyası olurdu.
  //
  // Bağlamda ARAÇ seçiliyse `find` boş döner ve cevap `needs_choice` olur — doğrusu bu: operatör
  // araca bakarken "mal kabul et" derse ekran ona tesisi sordurur, sessizce başka bir depoya
  // yazmaz (varsayılan depo YOKTUR, CLAUDE §1).
  const secilenId = ctx.activeWarehouseId ?? (needsChoice ? null : options[0]);
  const chosen = secilenId ? ctx.facilities.find((w) => w.id === secilenId) : null;

  if (chosen) return { status: 'ok', warehouseId: chosen.id, name: chosen.name };
  return { status: 'needs_choice' };
}

/**
 * Kimlik → ad/kod, TÜM depolar için (KAPALI olanlar dahil).
 *
 * Bağlamın `warehouses`'ı yalnız aktif ve kapsam içi depoları taşır — o bir YETKİ kümesidir.
 * Buradaki harita bir GÖRÜNTÜ sözlüğü: kapatılmış bir depodan çıkmış eski sipariş listede durmaya
 * devam eder ve deposunun adını söylemek zorundadır. Geçmiş, tesis kapandı diye isimsizleşmez.
 *
 * Tablo fiziksel tesis sayısı kadardır (birkaç satır); `cache()` ile istek başına tek tur.
 *
 * Dönüş `Warehouse`'un kendisidir, kırpılmış bir kopyası değil: kırpmak `filter.ts`'in görünüm
 * tipine bağımlılık kurar ve iki dosya birbirini içe aktarır (döngü, `boundaries` reddeder).
 * Okuyanlar zaten yalnız ihtiyaç duydukları alanları yapısal olarak istiyor.
 */
export const readWarehouseLabels = cache(async (): Promise<Map<string, Warehouse>> => {
  const rows = await new WarehouseService(serviceDb()).list();
  return new Map(rows.map((w) => [w.id, w]));
});

/**
 * Bağlamı YAZ — seçicinin tek yolu. Okuma ile aynı dosyada, çünkü çerezin adı, "all" sabiti ve
 * kapsam doğrulaması aynı sözleşmenin parçası: ikisi ayrı dosyaya düşseydi biri değişip öteki
 * kalabilirdi.
 *
 * **Yazarken de doğrulanır.** Okuma zaten doğruluyor (uymayan değer düşer), ama kapsam dışı bir
 * kimliği çereze YAZMAK sessiz bir hâl bırakırdı: kullanıcı seçtiğini sanır, her okumada geri
 * düşer ve "seçimim tutmuyor" der. Reddi burada vermek o hâli baştan engeller.
 *
 * Ömür: 1 yıl. Bağlam "oturumlar arası hatırlanan tercih" olarak tanımlı (tasarım sözleşmesi §2);
 * oturum çerezi olsaydı her sabah yeniden seçilirdi.
 */
export async function writeWarehouseContext(value: string): Promise<boolean> {
  const { scope } = await requireWarehouseScope();
  if (value !== ALL && !canAccessWarehouse(scope, value)) return false;

  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

/**
 * Bağlam → süzgeç. Üç hâl, üç ayrı anlam:
 *
 * - Tek depo seçili → yalnız o.
 * - "Tüm depolar" + `all` kapsam → süzgeç YOK (admin gerçekten her şeyi görür).
 * - "Tüm depolar" + `limited` kapsam → **kapsamdaki depolar**. Tasarımın kuralı: çok kapsamlı
 *   personel için "tümü" demek "kapsamımdaki depolar" demektir, ağın tamamı değil.
 */
function warehouseIdsFor(
  scope: WarehouseScope,
  activeWarehouseId: string | null,
  warehouses: readonly Warehouse[],
): readonly string[] | undefined {
  if (activeWarehouseId) return [activeWarehouseId];
  if (scope.kind === 'all') return undefined;
  // `limited`: kapsamdaki AKTİF depolar. Pasif depo süzgece girmez — kapalı tesisin siparişi
  // listede görünse operatör onu hazırlamaya çalışırdı.
  return warehouses.map((w) => w.id);
}
