import type { ProductStorageType } from '@lezzet/types';

/**
 * **Saklama rejiminin iki kararı** (16.08) — alan `product.storage_type`, künyesi migration `0005`te.
 *
 * Alan üç değerli ama okuyan taraflar hep İKİ soru soruyor ve ikisi aynı eşiği kullanmıyor. Sorular
 * burada bir kez cevaplanıyor: her ekran `=== 'chilled' || === 'frozen'` yazsaydı, bir gün biri
 * `chilled`i unuturdu ve soğuk zincir işareti soğutulmuş üründe kaybolurdu.
 *
 * ⚠ **`shippable` ile karıştırılmaz.** O bir TESLİMAT olgusudur ("kargoya verilebilir mi"), bu bir
 * SAKLAMA olgusu. Çoğu üründe birlikte hareket ederler ama aynı şey değildirler ve ayrı kararlardır.
 */

/**
 * Soğuk zincir gerekiyor mu — vitrinin işareti ve paketleme kararı bunu sorar.
 *
 * `chilled` DE dâhil: soğuk zincir yalnız donuğun meselesi değil, 0–4 °C de kesintisiz taşınmak
 * zorunda. Yalnız `frozen`e bakan bir kontrol, soğutulmuş ürünü oda sıcaklığındaymış gibi okurdu.
 */
export function requiresColdChain(storageType: ProductStorageType): boolean {
  return storageType === 'chilled' || storageType === 'frozen';
}

/**
 * Teslim edildikten sonra iade gelen mal **varsayılan olarak imha mı edilmeli** (`DOMAIN §8`).
 *
 * YALNIZ `frozen`. Kural şöyle yazılı: *"teslim edilmiş ve sonra iade edilen donuk ürün, soğuk
 * zinciri belgelenemediği için varsayılan olarak imha edilir — restok yalnız admin istisnasıdır."*
 * Sebebi çözülme eşiği: donuk mal bir kez çözüldüyse geri dönüşü yoktur ve müşterinin dolabında ne
 * olduğunu bilemeyiz. Soğutulmuş üründe aynı kesinlik yok — orada karar operatörün, varsayılan
 * değil.
 *
 * **Varsayılan bir yasak DEĞİL:** restok yolu açık kalır, yalnız bilinçli bir seçim hâline gelir.
 */
export function defaultsToDiscardOnReturn(storageType: ProductStorageType): boolean {
  return storageType === 'frozen';
}
