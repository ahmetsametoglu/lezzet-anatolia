/**
 * **Vitrin seçimi — üç bölümün TEK kuralı** (08.26 · veri zemini 05.18).
 *
 * Ana sayfa üç seçki çiziyor (kategori · koleksiyon · paket) ve üçü de aynı soruyu soruyor:
 * *"operatör hangilerini vitrine işaretledi, kaç tanesi sığıyor?"* Kural üç dosyaya ayrı ayrı
 * yazılsaydı biri gün gelip ötekilerden ayrışırdı — ve ayrışma sessiz olurdu: her bölüm kendi
 * içinde tutarlı görünür, yalnız ana sayfanın bütünü çelişirdi.
 *
 * ── İŞARET SEÇİMDİR, SIRA DEĞİL ──────────────────────────────────────────────
 * `is_featured` "vitrinde göster" der; sıra mevcut `sort_order`'dan gelir (görev satırının kuralı).
 * İkinci bir vitrin sırası TUTULMAZ — iki sıra bir gün çelişir ve hangisinin doğru olduğunu kimse
 * bilemez. Servisler zaten `sort_order`'da döndürüyor, bu fonksiyon sırayı hiç değiştirmez.
 *
 * ── HİÇ İŞARET YOKSA VİTRİN BOŞ KALMAZ ───────────────────────────────────────
 * Bugünkü veri tam olarak bu hâlde: 10 kategori var, hiçbiri işaretli değil (ölçüldü 08.08). Boş
 * dönseydik yeni bir kurulumda ana sayfa kendini kategorisiz açardı — operatör daha hiçbir şey
 * işaretlememişken. Bu bir "yedek veri" DEĞİL: gerçek kayıtların sıradan ilk N'i, yani ekran yine
 * gerçeği gösteriyor, yalnız seçimi henüz kimse yapmamış.
 *
 * **Fikstüre düşmekle karıştırılmamalı** (`FIXTURE_CATEGORIES`): o, katalog TAMAMEN boşken sahte
 * satır çizer. Burada sahte satır yok — işaret yoksa gerçek satırların ilk N'i.
 *
 * `limit` İSTEĞE BAĞLI: koleksiyon bandı önce havuzu süzüp sonra güne göre seçtiği için sınırı
 * kendi uygular (`rotateDaily`). Sınırsız çağrı "işaretliler, hepsi" demektir.
 *
 * ── TERFİ (paket kapısı, 09.08) · WEB'DEN FARKI YOK ──────────────────────────
 * Kaynağı `apps/web/lib/storefront/featured.ts`ti; web kopyası KÖPRÜ olarak duruyor ve öteki iki
 * seçici (`rotateDaily`, `pickRandom`) ORADA kaldı — ikisinin de tek tüketeni web ana sayfasıdır
 * (paketin ölçütü "en az iki yüzey"). Buraya yalnız `pickFeatured` geldi çünkü terfi eden paket
 * okuması (`./packages`) onu çağırıyor; bırakılsaydı `packages/application` `apps/web`e bakardı.
 *
 * **Mobil bu yedeğe BİLEREK düşmüyor** (`apps/mobile-api/src/lib/home.ts` künyesi): v3 vitrininde
 * "hiç işaret yoksa bant da yoktur". İki yüzeyin farkı bir çelişki değil, iki ayrı tasarım kararı —
 * bu yüzden yedek davranış fonksiyonun İÇİNE gömülü kalıyor, çağıranın seçebildiği bir bayrak
 * değil: web onu istiyor, mobil hiç çağırmıyor.
 */
export function pickFeatured<T extends { isFeatured: boolean }>(rows: readonly T[], limit?: number): T[] {
  const marked = rows.filter((row) => row.isFeatured);
  const pool = marked.length > 0 ? marked : rows;
  return limit === undefined ? [...pool] : pool.slice(0, limit);
}
