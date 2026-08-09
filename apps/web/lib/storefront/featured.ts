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
 */
export function rotateDaily<T>(pool: readonly T[], count: number, now: Date = new Date()): T[] {
  if (pool.length === 0) return [];
  const take = Math.min(count, pool.length);
  // Gün numarası UTC'den: yerel saat diliminde hesaplasaydık rotasyon sunucunun saatine bağlı olur
  // ve gece yarısı çevresinde iki istek farklı vitrin görürdü.
  const dayIndex = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  return Array.from({ length: take }, (_, i) => pool[(dayIndex + i) % pool.length]!);
}

/**
 * **HER İSTEKTE rastgele seçim** — fırsat bandı (kullanıcı kararı 09.08).
 *
 * ── NEDEN BURADA `Math.random()` DOĞRU, KOLEKSİYONDA DEĞİLDİ ─────────────────
 * Hemen yukarıdaki `rotateDaily` künyesi random'ı üç sebeple reddediyor ve o gerekçeler orada hâlâ
 * geçerli. Fırsat bandında üçü de düşüyor:
 *   *(1) önbellek* — fırsat bandı zaten önbelleklenemez: teklif partiye bağlıdır, parti eriyip
 *        biter (`physical_qty`), yani içerik dakika dakika değişir.
 *   *(2) "her yenilemede başka vitrin"* — koleksiyonda kusurdu (seçki iddiası taşır), burada
 *        İSTENEN davranış: bant "elimizde şu an ne var" diyor, bir seçki iddiası taşımıyor.
 *   *(3) "dün gördüğüm neydi"* — fırsat zaten yarın olmayabilir; kalıcılık sözü verilmiyor.
 *
 * Kullanıcı bunu açıkça istedi ve gerekçesi ekranda: bant üç kart genişliğinde, dördüncü fırsat
 * alt satıra kayıyordu. Sabit "ilk üç" seçilseydi öteki fırsatlar hiç görünmezdi; rastgele seçim
 * hepsine sıra veriyor, tamamı ise "Daha fazla gör" bağının arkasında duruyor.
 *
 * Havuzdan ÖRNEKLEME yapılır, karıştırma değil: kopya çıkmaz ve havuz sınırdan küçükse olduğu
 * kadarı döner. `pick` parametre — test rastgeleliği sabitleyebilsin (`Math.random` çağıranın
 * varsayılanı, testin işi değil).
 */
export function pickRandom<T>(pool: readonly T[], count: number, pick: () => number = Math.random): T[] {
  const rest = [...pool];
  const take = Math.min(count, rest.length);
  return Array.from({ length: take }, () => rest.splice(Math.floor(pick() * rest.length), 1)[0]!);
}
