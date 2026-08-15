/**
 * Yer adı normalizasyonu — saf yazım işi.
 *
 * ── NEDEN `helper`DA, `domain-core`DA DEĞİL (OB-03 · 15.08) ──────────────────
 * Bu fonksiyon `domain-core/delivery/place-name.ts`te doğdu ve orada `cityMatchesPlaces`in
 * (yazılan şehir bu koda ait mi) yardımcısıydı. Bir KARAR değil, karşılaştırmadan önce yapılan
 * yazım temizliği: kardeşi `normalizePostalCode` zaten burada duruyor ve ikisi aynı sınıf.
 *
 * Taşınmasının somut sebebi: aynı kuralı artık `packages/database` de uygulamak zorunda —
 * yerleşim adıyla posta kodu araması (`PostalCodePlaceService.search`) terimi normalleştirip
 * veritabanındaki normalleştirilmiş metinle karşılaştırıyor. **`database` `domain-core`'u
 * BİLEMEZ** (`STACK §4`), ama ikisi de `helper`ı bilir. Alternatif kuralı ikinci kez yazmaktı ve
 * o gün ikisi ayrıştığında "Hœnheim" yazan operatör kendi kaydını bulamazdı — sessizce.
 *
 * ── ÜÇÜNCÜ BİR TÜKETİCİ DAHA VAR VE O SQL ───────────────────────────────────
 * `0033_postal_code_place.sql` → `place_search_text()` aranan METNİ aynı kuralla üretir
 * (ligatürler elle, aksanlar `unaccent`, sonra küçük harf). Üç yerde aynı kural üç dilde yazılı
 * olmak zorunda — TypeScript iki tarafı, SQL üçüncüyü. Buradaki sırayı değiştiren, migration'daki
 * sırayı da değiştirmelidir: önce bire-çok harfler (`œ→oe`), sonra aksan atma. Ters sırada `ß`
 * çözülmeden kalır.
 */

/**
 * Karşılaştırma için ad normalizasyonu — **yalnız yazım farklarını siler, anlamı değiştirmez.**
 *
 * Diyakritik, ligatür (`Hœnheim` ↔ `Hoenheim`), tire/boşluk/kesme ve büyük-küçük harf farkı aynı
 * yerin farklı yazımlarıdır; müşteri "HOENHEIM" yazdığında yanlış alarm ötmemeli. Ötesine
 * geçilmiyor: "St" ↔ "Saint" gibi genişletmeler kulağa makul gelir ama ayrı belediyeleri
 * birbirine karıştırabilir ve o hatanın kaynağı sonradan bulunamaz.
 */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
