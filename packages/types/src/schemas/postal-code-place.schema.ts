import { z } from 'zod';
import { dbNumericNullable } from './db-numeric';
import { CountryEnum } from './enums.schema';

/**
 * Posta kodu referansı (19.8) — `postal_code_place`.
 *
 * **Neden var:** müşteriye "önce ülke, sonra posta kodu" sordurmamak için. Ülke bir ALAN değil,
 * posta kodundan türeyen bir SONUÇtur — ve bu yalnız bir kolaylık meselesi değil: serbestçe seçilen
 * ülke KDV oranını ve Alman B2B muafiyetini etkiler (`DOMAIN §5`), yani müşterinin doldurduğu bir
 * alan vergi sonucu doğuramaz.
 *
 * **Ne DEĞİL:** adres doğrulama. Sokak/numara doğruluğu bu tablonun işi değildir. Kapsam üç
 * sorudur: kodun hangi ülke(ler)de geçerli olduğu, gösterilecek yer adı ve yazılan şehrin o koda
 * ait olup olmadığı.
 *
 * Veri GeoNames'ten gelir (CC-BY) ve migration'ın içindedir — tablo boşken sistem her kodu
 * "tanınmadı" sayar, yani veri opsiyonel bir yükleme değil tanımın parçasıdır.
 * Üreteç: `scripts/build-postal-codes.mjs` (`pnpm postal:build`).
 */
export const PostalCodePlaceSchema = z.object({
  country: CountryEnum,
  postalCode: z.string(),
  /**
   * Kodun kapsadığı TÜM yerleşimler (19.17) — indirgenmemiş.
   *
   * İlk sürüm burada tek bir ad tutuyordu ve çok yerleşimli kodda bir üst idari birime çıkıyordu.
   * O ad YANLIŞTI ve yanlışlığı görünmüyordu: Fransız arrondissement'ı merkez kasabasının adını
   * taşır, yani `67800` için üretilen "Strasbourg" geçerli bir belediye adı gibi okunuyordu —
   * orası Bischheim / Hœnheim.
   *
   * Gösterilecek ad buradan TÜRETİLİR (`placeLabel`), saklanmaz: tek kaynak liste, ad onun
   * sonucudur. Boş liste mümkündür ve "bilinmiyor" demektir — "uyuşmuyor" değil.
   */
  places: z.array(z.string()),
  /**
   * Kodun kapsadığı alanın MERKEZ noktası (19.18) — bölge kurulumu haritadan yapılıyor
   * (`design/pages/admin-depolar.md`) ve harita kod başına tek işaret basıyor.
   *
   * Yerleşimlerin ortalamasıdır, birinin noktası değil: birini seçmek keyfi olurdu — aynı "tek ad"
   * hatasının coğrafi karşılığı. Bir ADRESİ göstermez; bu tablo adres doğrulaması yapmaz.
   *
   * `null` = koordinat bilinmiyor → **harita o kodu basmaz.** (0, 0)'a düşürmek Gine Körfezi'nde
   * bir işaret üretirdi ve eksik ölçümü sağlıklıymış gibi okuturdu (`CLAUDE.md §1`).
   */
  lat: dbNumericNullable,
  lng: dbNumericNullable,
});

export type PostalCodePlace = z.infer<typeof PostalCodePlaceSchema>;
