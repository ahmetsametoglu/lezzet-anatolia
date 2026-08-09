import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * YER ÇÖZÜM SÖZLEŞMESİ — mobil `GET /api/v1/places/by-postal-code` ucunun ve onboarding "posta
 * kodunuz" adımının ORTAK dili. Terfi gerekçesi öteki sözleşmelerle aynı (02-mimari §3.2).
 *
 * ── SAKLANAN ŞEY CEVAPTIR, ÇÖZÜM DEĞİL (19.9 güvenlik sınırı) ────────────────
 * Depo kimlikleri zarfta BİLEREK YOK. Cihaz yalnız müşterinin cevabını saklar — `country` +
 * `postalCode` — ve vitrin/katalog uçları yeri her istekte sunucuda yeniden çözer (web'in
 * `lezzet.place.v2` çerezinin birebir kuralı: istemcinin yazabildiği bir değer hangi deponun
 * stoğunu göstereceğimizi belirleyemez). Bu ikili, vitrin uçlarının beklediği YER ANAHTARIDIR:
 * bugün `UNKNOWN_PLACE` ile çalışan `/home`/`/products` okumaları, yer çözümü bağlandığında
 * (21.6 B) tam bu iki alanı isteyecek.
 *
 * ── DÖRT HÂL AYRIK TAŞINIR (web `PlaceLookup` emsali) ────────────────────────
 * Hepsi 200'dür — hiçbiri bir taşıma hatası değil, sorulan sorunun dört gerçek cevabıdır. Tek bir
 * `error` dizesine indirilselerdi ekran belirsizlik seçicisini çizemez, hâli metin ayrıştırarak
 * anlamak zorunda kalırdı (web'de yaşandı ve düzeltildi — `place-types.ts` künyesi).
 */

/**
 * `ambiguous` hâlinde müşteriye sunulan seçenek — ülke DEĞİL, tanınabilir bir YER: "Fransa mı
 * Almanya mı" müşteriye bir şey ifade etmez, "Bischwiller mi Bobenheim-Roxheim mi" eder (19.16b).
 *
 * Her seçenek `country` + `postalCode` taşır, yani SEÇİLDİĞİ GİBİ saklanabilir bir yer anahtarıdır
 * — istemci sorgudaki ham kodu hatırlamak zorunda kalmaz (normalize edilmişi buradadır).
 */
export const PlaceOptionSchema = z.object({
  country: CountryEnum,
  /** Normalize (boşluksuz, büyük harf) — saklanacak anahtarın kendisi. */
  postalCode: z.string(),
  /** Kodun TARTIŞMASIZ adı; çok yerleşimliyse `null` (19.17 — yanlış ad, eksik addan kötüdür). */
  placeName: z.string().nullable(),
  /** Kodun o ülkedeki tüm yerleşimleri — kaç ad yazılıp nerede "+X"e geçileceği ekranın kararı. */
  places: z.array(z.string()),
  /** Rota bölgemize düşüyor mu — liste bunu ÖNCE gösterir (daha olası cevap); seçimi belirlemez. */
  inRoute: z.boolean(),
});
export type PlaceOption = z.infer<typeof PlaceOptionSchema>;

/**
 * `GET /places/by-postal-code?code=67000` cevabı.
 *
 * `resolved.place.inRoute` onboarding'in ana sorusudur: `true` = rota içi (araçla teslim, soğuk
 * zincir dâhil her şey ulaşır), `false` = bölge dışı (kargo — yalnız kargolanabilir kalemler).
 * Rota GÜNLERİ ve en yakın teslimat BİLEREK YOK: kesim saatiyle bayatlayan bilgi onboarding'in
 * sorusu değil, checkout okumasının işi (web `DeliveryPlace.nextDate` künyesinin aynı gerekçesi).
 */
export const PlaceResolutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resolved'),
    place: z.object({
      country: CountryEnum,
      /** Normalize — cihazın saklayacağı yer anahtarının yarısı (öteki yarısı `country`). */
      postalCode: z.string(),
      placeName: z.string().nullable(),
      places: z.array(z.string()),
      inRoute: z.boolean(),
    }),
  }),
  /** Kod birden çok hizmet ülkemizde geçerli — tek soru, en az iki somut yer; kararı müşteri verir
      (rota adayını otomatik seçmek yanlış ülke = yanlış KDV demekti — motorun kayıtlı gerekçesi). */
  z.object({ kind: z.literal('ambiguous'), options: z.array(PlaceOptionSchema).min(2) }),
  /** Hiçbir ülkede geçerli değil: büyük olasılıkla yazım hatası. Bir kapı değil, bir uyarıdır. */
  z.object({ kind: z.literal('unknown') }),
  /**
   * Zincir koptu. İki sebep AYRI cümle ister: `no_shipping_warehouse` BİZİM eksiğimizdir (kargo
   * deposu tanımsız — müşteriye "bölge dışısınız" dedirtilmemeli), `ambiguous_zone` veri
   * çakışmasıdır (aynı kod iki bölgede). Değerler motorun `PlaceResolution` birliğinin aynısı;
   * bağ, ucun `z.input<…>` tiplemesiyle derlemede kilitli (feedback sözleşmesinin aynı deseni).
   */
  z.object({ kind: z.literal('unresolved'), reason: z.enum(['no_shipping_warehouse', 'ambiguous_zone']) }),
]);
export type PlaceResolution = z.infer<typeof PlaceResolutionSchema>;
