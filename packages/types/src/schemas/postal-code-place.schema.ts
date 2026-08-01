import { z } from 'zod';
import { CountryEnum } from './enums.schema';

/**
 * Posta kodu referansı (19.8) — `postal_code_place`.
 *
 * **Neden var:** müşteriye "önce ülke, sonra posta kodu" sordurmamak için. Ülke bir ALAN değil,
 * posta kodundan türeyen bir SONUÇtur — ve bu yalnız bir kolaylık meselesi değil: serbestçe seçilen
 * ülke KDV oranını ve Alman B2B muafiyetini etkiler (`DOMAIN §5`), yani müşterinin doldurduğu bir
 * alan vergi sonucu doğuramaz.
 *
 * **Ne DEĞİL:** adres doğrulama. Sokak/numara doğruluğu bu tablonun işi değildir. Kapsam iki
 * alandır: kodun hangi ülke(ler)de geçerli olduğu ve gösterilecek yer adı.
 *
 * Veri GeoNames'ten gelir (CC-BY) ve migration'ın içindedir — tablo boşken sistem her kodu
 * "tanınmadı" sayar, yani veri opsiyonel bir yükleme değil tanımın parçasıdır.
 * Üreteç: `scripts/build-postal-codes.mjs` (`pnpm postal:build`).
 */
export const PostalCodePlaceSchema = z.object({
  country: CountryEnum,
  postalCode: z.string(),
  /**
   * Gösterilecek ad. Kod tek yerleşim kapsıyorsa onun adı ("Strasbourg"); birden çoksa bir üst
   * idari birim ("Ortenaukreis") — 46 köyden birini seçmek keyfi olurdu ve yanlış köyü yazmak,
   * uydurulmuş şehir adı yazmakla aynı güven kaybıdır.
   */
  placeName: z.string(),
});

export type PostalCodePlace = z.infer<typeof PostalCodePlaceSchema>;
