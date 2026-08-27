import { hasAllLocales, missingLocales, type LocalizedText } from '@lezzet/types';

/**
 * **ÜRÜN YAYINA HAZIR MI** (05.36 · mobil şeridin talebi 25.08).
 *
 * Ölçülmüş arıza: Fransızcası olmayan ürün Fransız müşteriye SESSİZCE Türkçe gösteriliyordu.
 * Hiçbir yerde hata yok, hiçbir işaret yok — `resolveLocalizedText` yedek zinciri (seçili → TR →
 * FR → DE) eksikliği kendiliğinden kapatıyor ve kapattığı için de kimse fark etmiyor.
 *
 * **Kuralın SON SÖZÜ veritabanındadır** (`product_publish_requires_all_locales`, `0005`): üründe en
 * az üç yazan var — operasyon formu, asistan dilekçesi ve seed — ve *"yüzeyde durdurulan bir kuralın
 * ikinci bir yazma yolu varsa, kural yok demektir"* (`MB-22a`/`09.6`). Burası o kuralı TEKRAR
 * UYGULAMIYOR; aynı soruyu yazma anından ÖNCE sorup operatöre **hangi alanın hangi dilde** eksik
 * olduğunu söylüyor. Kısıt bunu söyleyemez: tek bir ihlal mesajı döner ve operatör altı alandan
 * hangisine bakacağını bilemez.
 *
 * Motor DB'siz ve saf: girdi ürünün alanları, çıktı eksiklerin listesi (`STACK §4`).
 */

/**
 * Yayın kontrolüne giren ürün alanları — `Product`un dar bir görünümü (tam varlığa bağlanmaz).
 *
 * **Alanların hepsi OPSİYONEL ve bu bilinçli:** çağıran ürünün yazım sonrası hâlini kuruyor ve o
 * hâl çoğu zaman iki parçadan birleşiyor (`{...mevcut, ...fields}`) — form kısmi gönderebiliyor
 * (`ProductDetailsUpdate` `.partial()`). Eksik alan zaten "yayına engel" demek, yani `undefined`
 * ile `null` aynı cevabı veriyor; zorunlu tutmak çağıranı anlamsız dolgu yazmaya iterdi.
 */
export interface PublishCandidate {
  name?: LocalizedText | null;
  description?: LocalizedText | null;
  ingredients?: LocalizedText | null;
  storageInstructions?: LocalizedText | null;
  /** Aile etiketi YALNIZ aile üyesinde aranır (kartta okunan odur). */
  familyId?: string | null;
  familyLabel?: LocalizedText | null;
}

/** Bir alanın eksiği: hangi alan, hangi diller. */
export interface PublishGap {
  field: 'name' | 'description' | 'ingredients' | 'storageInstructions' | 'familyLabel';
  missing: Array<'tr' | 'fr' | 'de'>;
}

/**
 * Yayına engel olan eksikler. Boş dizi = ürün `active` yapılabilir.
 *
 * **Sıra ekranın işine yarayacak biçimde**: adı olmayan üründe önce ad söylenir. Operatör listeyi
 * yukarıdan aşağı doldurur.
 */
export function productPublishGaps(product: PublishCandidate): PublishGap[] {
  const gaps: PublishGap[] = [];
  const check = (field: PublishGap['field'], value: LocalizedText | null | undefined) => {
    if (!hasAllLocales(value)) gaps.push({ field, missing: missingLocales(value) });
  };

  check('name', product.name);
  check('description', product.description);
  check('ingredients', product.ingredients);
  check('storageInstructions', product.storageInstructions);
  // Koşullu alan — kısıttaki `family_id is null or …` ile birebir. Koşulu burada tekrar yazmak
  // yerine kısıtla aynı cümleyi kurmak şart: ayrışırlarsa ekran "eksik yok" derken veritabanı
  // yayını reddeder ve operatör sebebi hiçbir yerde göremez.
  //
  // **`imageAlt` BURADA YOK ve bu ölçülmüş bir karar** (27.08): alan ürün formunda hiç yok ve
  // bilerek yok — boşsa müşteride ürün ADINA düşüyor. Kısıta konsaydı operatörün dolduramadığı
  // bir alan yüzünden hiçbir ürün yayınlanamazdı. Ad zaten üç dilde zorunlu, yani yedek de doğru
  // dile düşüyor. Gerekçenin tamamı `0005_catalog_product.sql` kısıt künyesinde.
  if (product.familyId) check('familyLabel', product.familyLabel);

  return gaps;
}

/** Kısayol — çağıranın `.length === 0` yazmasına gerek kalmasın. */
export function canPublishProduct(product: PublishCandidate): boolean {
  return productPublishGaps(product).length === 0;
}
