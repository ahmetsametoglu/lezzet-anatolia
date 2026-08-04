/**
 * "Bunları da sevebilirsiniz" seçkisinin kuralı — **saf karar**, DB'siz ve testli.
 *
 * ── ÜÇ KURAL, İKİSİ AYRI ŞEYLER (kullanıcı kararları 04.08) ─────────────────────────────────
 *   1. **Bakılan ürünün KENDİ ailesi tamamen dışarıda.** Tek bir üyesi bile girmez. O aile zaten
 *      sayfanın üstünde, çeşit kartlarında duruyor; aşağıda tekrar etmek aynı şeyi iki kez
 *      göstermek olurdu.
 *   2. **Öteki ailelerden en çok BİRER üye.** Şerit böylece kategoriden KARIŞIK gelir — dört
 *      kartın dördü aynı ailenin dört gramajı olamaz. Çözülen sorun "aile üyesi görünmesi" değil,
 *      tek bir ailenin şeridi ele geçirmesi.
 *   3. **Dörtlü dolmazsa YALNIZ 2. kural kalkar** ve ailedaşlarla tamamlanır. Az kart göstermek de
 *      bir maliyet: bölüm yarım kalır, sayfa bitmemiş görünür. **1. kural kalkmaz** — kendi ailesi
 *      dörtlüyü doldurmak için bile geri çağrılmaz; o zaten yukarıda duruyor.
 *
 * 1 ile 2 ayrı sorulardır ve bir arada yaşarlar: biri "bu aileyi zaten gösterdim mi", öteki "tek
 * bir aile bölümü ele geçiriyor mu". Tek kurala indirilseydi ya kendi ailesi sızardı ya öteki
 * ailelerin tamamı elenirdi.
 *
 * Sıra KORUNUR — karıştırılmaz. Rastgelelik sunucuda her istekte farklı sonuç demek: aynı sayfa
 * iki kez açıldığında farklı kartlar, önbellek ve SSR/hidrasyon tarafında da tutarsızlık. "Karışık"
 * istenen şey çeşitlilik, öngörülemezlik değil; onu aile kuralı zaten veriyor.
 *
 * ── BURADA OLMAYAN ŞEY: SIRALAMA ÖLÇÜTÜ ─────────────────────────────────────────────────────
 * Bu modül *kimin geleceğini* seçer, *hangi sırayla* geleceğini değil — sıra çağıranın verdiği
 * katalog sırasıdır, o da alfabetik. Ölçüte bağlamak (en çok bakılan / beğenilen) kullanıcı
 * kararıyla ERTELENDİ: tek eksenli bir ölçüt hep aynı ürünleri öne çıkarır ve bölüm keşif daveti
 * olmaktan çıkar. Düşünülen kurgu dört kartı dört farklı eksene dağıtmak; gerekçesi ve tasarım
 * soruları `design/BACKLOG.md §2`de. Ölçüt geldiği gün buraya değil, ÇAĞIRANIN sorgusuna girer.
 */

/**
 * Seçkinin ihtiyaç duyduğu tek iki alan — çağıran daha zengin satırlar geçirebilir (jenerik `T`
 * kendi tipini koruyarak geri döner). Dışa VERİLMEZ: yalnız kısıt olarak kullanılıyor, dışa vermek
 * kimsenin tüketmediği bir tip yayınlamak olurdu (`knip`).
 */
interface SimilarCandidate {
  id: string;
  familyId: string | null;
}

/**
 * Adaylardan `limit` kadar kart seç: kendi ailesini tamamen at, öteki ailelerden birer tane al,
 * yetmezse ailedaşlarla tamamla.
 *
 * Aday listesi **sırasıyla** taranır, yani kategorinin kendi sırası (operatörün dizdiği sıra)
 * korunur; kural yalnız kimin öne geçeceğini değiştirir, sıralamayı baştan kurmaz.
 *
 * @param ownFamilyId Bakılan ürünün ailesi — üyeleri hiç değerlendirmeye alınmaz. Ailesiz üründe
 *   `null`, o zaman kural işlemez (ailesiz ürünün "kendi ailesi" yoktur; `null === null` diye
 *   eşleşip bütün ailesizleri elemek en sinsi hata olurdu).
 */
export function pickSimilar<T extends SimilarCandidate>(
  candidates: readonly T[],
  limit: number,
  ownFamilyId: string | null,
): T[] {
  const seenFamilies = new Set<string>();
  /** Öteki ailelerden ilk görülen üye + ailesiz ürünlerin tamamı. */
  const oncelikli: T[] = [];
  /** Ailesi zaten temsil edilmiş üyeler — yalnız dörtlü dolmazsa kullanılır. */
  const yedek: T[] = [];

  for (const c of candidates) {
    // Kendi ailesi YEDEĞE BİLE girmez: dörtlüyü doldurmak için geri çağrılırsa kural delinmiş olur.
    if (ownFamilyId !== null && c.familyId === ownFamilyId) continue;
    if (c.familyId !== null && seenFamilies.has(c.familyId)) {
      yedek.push(c);
      continue;
    }
    if (c.familyId !== null) seenFamilies.add(c.familyId);
    oncelikli.push(c);
  }

  return [...oncelikli, ...yedek].slice(0, limit);
}
