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
 * Kaynağı `apps/web/lib/storefront/featured.ts`ti; web kopyası KÖPRÜ olarak duruyor. Önce yalnız
 * `pickFeatured` geldi çünkü terfi eden paket okuması (`./packages`) onu çağırıyordu; bırakılsaydı
 * `packages/application` `apps/web`e bakardı. `rotateDaily` 05.23'da izledi (künyesi aşağıda),
 * `pickRandom` ise webde KALDI — tek tüketeni hâlâ oradaki fırsat bandı.
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

/**
 * **Güne bağlı deterministik seçim** — koleksiyon slotlarının rotasyonu (kullanıcı kararı 08.08).
 *
 * İstenen "her gün başka koleksiyonlar" idi. `Math.random()` bunu KARŞILAMAZ, üç ayrı sebeple:
 * *(1)* sayfa önbelleğini kırar (her istek başka çıktı), *(2)* aynı müşteriye her yenilemede başka
 * vitrin gösterir — vitrin değil kumar olur, *(3)* "dün gördüğüm koleksiyon neydi" sorusunun cevabı
 * kalmaz. Gün numarasından türeyen bir kaydırma üçünü de çözer: aynı gün herkese aynı vitrin,
 * ertesi gün döner.
 *
 * Havuz sınırdan küçükse OLDUĞU KADARI döner ve tekrar ETMEZ: iki slota aynı koleksiyonu iki kez
 * koymak, seçki olduğunu iddia eden bir ekranda kopya göstermektir.
 *
 * `now` PARAMETRE ve bu bilinçli — test günü sabitleyebilsin. Varsayılanı çağıranın işi değil.
 *
 * ── TERFİ (kategori havuzu, 05.23) ───────────────────────────────────────────
 * Kaynağı `apps/web/lib/storefront/featured.ts`ti ve künyesi *"tek tüketeni web ana sayfasıdır"*
 * diyerek orada kalmıştı — o gün doğruydu. **İkinci yüzey 05.23'da geldi:** kategori kartı artık
 * kendi fotoğraf havuzundan güne göre bir kare seçiyor ve o seçim `toCategory` indirgemesinde
 * yapılıyor, yani mobil API de aynı kuralı çağırıyor. Paketin ölçütü ("en az iki yüzey") karşılandı
 * ve `packages/application` `apps/web`ten import EDEMEZ (bağımlılık tek yönlü, STACK §4). Web
 * köprüsü aynen duruyor; çağıranlarının import satırı oynamadı.
 *
 * Kardeşi `pickRandom` web'de KALDI — onun tek tüketeni hâlâ fırsat bandı.
 */
export function rotateDaily<T>(pool: readonly T[], count: number, now: Date = new Date()): T[] {
  if (pool.length === 0) return [];
  const take = Math.min(count, pool.length);
  // Gün numarası UTC'den: yerel saat diliminde hesaplasaydık rotasyon sunucunun saatine bağlı olur
  // ve gece yarısı çevresinde iki istek farklı vitrin görürdü.
  const dayIndex = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  return Array.from({ length: take }, (_, i) => pool[(dayIndex + i) % pool.length]!);
}
