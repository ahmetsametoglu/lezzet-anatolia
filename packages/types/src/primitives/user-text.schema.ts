import { z } from 'zod';
import { perLanguageTextShape } from './localized-text.schema';

/**
 * **Kullanıcının yazdığı metin** — yorum, talep mesajı, ret gerekçesi. `LocalizedText`'ten
 * temelden farklıdır ve karıştırılmaları pahalıya patlar:
 *
 * | | `LocalizedText` (katalog) | Buradaki metin (kullanıcı) |
 * |---|---|---|
 * | Diller | üçü de YAZILMIŞ, eşit | biri ORİJİNAL, ötekiler türetilmiş |
 * | Kaynak | operatör | müşteri ya da personel |
 * | Dil kümesi | tr/fr/de | **herhangi bir dil** — Boşnakça yorum da gelir |
 *
 * Bu yüzden metnin kendisi torbanın DIŞINDA kalır: satır orijinali kendi kolonunda tutar
 * (`comment`, `body`, …), torba yalnız çevirileri taşır. Böylece bir makine çevirisi hiçbir
 * zaman müşterinin kendi cümlesi sanılamaz — ne okuyan insan ne de sonraki geliştirici için.
 */

/**
 * Metnin yazıldığı dil — **BCP-47 birincil alt etiketi** (ISO 639, 2-3 küçük harf): `tr`, `fr`,
 * `bs`, `sq`…
 *
 * Site dilleriyle SINIRLI DEĞİL ve olmamalı: müşteri Boşnakça yorum yazabilir. `preferred_language`
 * enum'u (tr|fr|de) burada kullanılamaz — enum "bizim konuştuğumuz diller"i, bu alan "müşterinin
 * konuştuğu dil"i söyler.
 *
 * **Bölge/yazım alt etiketi tutulmaz** (`fr-BE` değil `fr`): çeviri için birincil etiket yeterli,
 * bölgeyi taşımak torbayı `fr-BE`/`fr-FR` diye bölerdi.
 */
export const SourceLanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}$/, 'Dil kodu ISO 639 birincil alt etiketi olmalı (2-3 küçük harf)');
export type SourceLanguage = z.infer<typeof SourceLanguageSchema>;

/**
 * Makine çevirisi torbası (jsonb, satırın İÇİNDE).
 *
 * **Ayrı çeviri tablosu bilinçli reddedildi** (kullanıcı kararı 03.08): kaynak üç ayrı tabloda
 * olduğu için `source_id` polimorfik olurdu — yani FK'siz. Bir yorum silindiğinde çevirileri
 * öksüz kalır ve kimse fark etmez; üstelik her okuma bir join daha isterdi. Katalog zaten
 * satır-içi jsonb deseniyle çalışıyor.
 *
 * **Torbada kaynak dil BULUNMAZ.** Orijinal Türkçeyse torba `{fr, de}`, Boşnakçaysa `{tr, fr, de}`
 * olur. Kaynak dili de torbaya koymak, orijinalin bir kopyasını üretip ikisinin bir gün
 * ayrışmasına izin vermekti.
 */
export const TranslationBagSchema = z.object(perLanguageTextShape);
export type TranslationBag = z.infer<typeof TranslationBagSchema>;
