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

/**
 * "BURAYA DA GELİN" KAYDI — bölge dışı müşterinin talebi (21.20 · kullanıcı kararı 10.08).
 *
 * ── İKİ KAYIT, İKİ AYRI SORU ─────────────────────────────────────────────────
 * Uç TEK istekte iki yere yazar ve ikisi BİRLEŞTİRİLEMEZ (`0023_notices.sql` kararı):
 * · `postal_code_demand` — **anonim sayaç**, kimlik TUTMAZ. Aynı ziyaretçinin tekrar sorması ayrı
 *   sayılır ve bu bilinçli: tekilleştirmek için kimlik tutmak gerekirdi. Ölçtüğü şey bir "kişi
 *   sayısı" değil, İLGİ YOĞUNLUĞU.
 * · `zone_notice` — **kuvvetli sinyal**: e-posta + ülke + kod. Tekilliği veritabanı tutuyor
 *   (`zone_notice_unique_idx (country, postal_code, lower(email))`), yani **aynı kişi aynı yer için
 *   ikinci kez sayılmaz** — düğmeye tekrar basmak yeni bir bekleyiş değil, aynı bekleyişin
 *   tekrarıdır. Kullanıcının istediği "bir kullanıcı bir artırım" kuralı BURADA yaşıyor.
 *
 * Operatörün "burayı açalım mı" kararı kuvvetli sinyali sayar; anonim sayaç yalnız yönü gösterir.
 *
 * ── HESAP ZORUNLU DEĞİL ──────────────────────────────────────────────────────
 * Ziyaretçi de kayıt bırakabilir (`zone_notice.email` künyesi): "haber ver"in önüne giriş duvarı
 * koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktır. Girişli müşteride e-posta
 * SUNUCUDA çözülür — gövdeden gelen bir adres başkasının yerine kayıt bırakmaya açık kapı olurdu.
 */
export const PlaceNoticeBodySchema = z.object({
  postalCode: z.string().trim().min(1).max(16),
  country: CountryEnum,
  /**
   * Ziyaretçinin adresi. Girişli müşteride GÖVDEDEN ALINMAZ ve gönderilse bile YOK SAYILIR: kimlik
   * sunucunun bildiği şeydir. Misafirde zorunlu — nereye haber vereceğimizi bilmeden söz veremeyiz.
   */
  email: z.string().email().nullable().default(null),
  /**
   * Kaydın hangi EKRANDAN geldiği (`app-catalog` · `app-onboarding` · `app-account`). Enum DEĞİL:
   * bir karar girdisi değil, denetim izi — yeni ekran migration yazdırmasın (tablonun kendi kararı).
   */
  source: z.string().trim().min(1).max(32),
});

/**
 * Kaydın sonucu. **`ok` "haber göndereceğiz" DEMEK DEĞİLDİR** — tablo künyesinin kuralı: bu bir söz
 * değil bir kayıttır, bölge genişletme kararı verilmemiştir. Ekran "not aldık" der.
 *
 * `already` ayrı bir hâl çünkü ekranın cümlesi farklı: "kaydınız zaten var" demek, müşteriye ikinci
 * kez bastığında sessiz kalmaktan da "yeni kayıt aldık" demekten de dürüsttür.
 */
export const PlaceNoticeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('already') }),
  /** Yer çözülemedi: nereye haber vereceğimizi bilmiyoruz, kayıt ALINMAZ (webin aynı hükmü). */
  z.object({ status: z.literal('place_unknown') }),
  /** Misafir e-posta vermedi — giriş duvarı değil, adres sorusu. */
  z.object({ status: z.literal('email_required') }),
]);
export type PlaceNoticeResult = z.infer<typeof PlaceNoticeResultSchema>;

/**
 * TESLİMAT BÖLGELERİ LİSTESİ — `GET /api/v1/places/zones` (kullanıcı kararı 10.08).
 *
 * ── NİYE VAR ─────────────────────────────────────────────────────────────────
 * Bölge dışı müşteri bugün yalnız "buraya gelmiyoruz" cümlesini okuyor ve kullanıcının sorusu şu:
 * *"on tane posta kodu girdim hiçbirine gitmiyorsunuz — siz nereye gidiyorsunuz?"* Cevabı hiçbir
 * yerde yoktu; müşteri kod kod deneyerek haritayı kendi çıkarmak zorundaydı.
 *
 * ── POSTA KODU, BÖLGE ADI DEĞİL (kullanıcı düzeltmesi 10.08) ─────────────────
 * İlk yazımda liste bölge ADLARINI taşıyordu ve bunun için tabloya müşteri-yüzü bir ad kolonu bile
 * eklenmişti. Kullanıcı ikisini de eledi: **`delivery_zone.name` müşteri için bir şey ifade
 * etmiyor** — o operasyonun rota etiketi ("Illkirch / Ostwald"). Müşterinin elindeki tek ölçü kendi
 * posta kodudur ve sorduğu soru zaten "benim kodum listede var mı". Kodlar ZATEN veride
 * (`delivery_zone_postal_code`): cevap için ne yeni kolon gerekiyordu ne migration; eklenen kolon
 * geri alındı, veritabanını sıfırlama ihtiyacı da onunla birlikte kalktı.
 *
 * Liste yalnız AKTİF bölgelerin kodlarını taşır: pasif bölgeye araç gitmiyor ve onun kodunu
 * listelemek, tutmadığımız bir sözü ilan etmek olurdu.
 *
 * ── GRUPLAMA YOK ─────────────────────────────────────────────────────────────
 * Grup başlığının tek kaynağı bölge ya da depo adı olurdu; ikisi de iç etiket ("Strasbourg — ana
 * depo", "Colmar — pilot depo (kapalı)"). Kod listesi zaten kendi doğal sırasında okunuyor —
 * başlık, olmayan bir bilgiyi varmış gibi gösterirdi.
 *
 * Sayfalama yok: bölge kümesi operatörün elle kurduğu, doğal tavanlı bir kümedir (CLAUDE §1 "tek
 * turda" dalı) — bugün üç satır, yarın kırk.
 *
 * **Boş liste geçerli bir cevaptır**: hiçbir bölgenin müşteri-yüzü adı yazılmamışsa sayfa "henüz
 * ilan edilmiş bölge yok" der; okuma düşseydi zarfın kendisi hata dönerdi (ikisi karışmaz).
 */
/**
 * Tek YER satırı — bir komün ve o komüne düşen kodlar ("Strasbourg · 67000 67100 67200").
 *
 * Ad `postal_code_place.places[0]`den gelir (kod → komün adları + koordinat; FR 6 065, DE 10 813
 * satır — veri ZATEN elimizde, yeni kolon gerekmedi). **`null` = o kodun yer kaydı yok**: kod yine
 * listelenir, yalnız başlıksız. Adı uydurmak ya da kodu gizlemek iki ayrı yalan olurdu — biri
 * olmayan bir yer adı, öteki gittiğimiz bir yerin saklanması.
 */
export const DeliveryPlaceSchema = z.object({
  name: z.string().nullable(),
  codes: z.array(z.string()).min(1),
});

/**
 * Ülkeye göre öbek. Ülke bir GRUP EKSENİDİR, süs değil: bir bölge sınır ötesi olabiliyor (ADR-002)
 * ve `67540` ile `77694` yan yana dururken müşteri hangisinin nerede olduğunu anlayamaz.
 */
export const DeliveryAreaSchema = z.object({
  country: CountryEnum,
  places: z.array(DeliveryPlaceSchema).min(1),
});

/**
 * ── ÖLÇEK: DÜZ LİSTE 200 KODDA ÇÖKER (kullanıcı sorusu 10.08) ────────────────
 * İlk şekil düz bir kod dizisiydi (`{ places: string[] }`) ve kullanıcı ölçeği sordu: *"yarın iki
 * yüz posta koduna hizmet veriyorum ve ellisi Almanya'da — bu tasarım nasıl olur?"* Cevap: kötü.
 * Yedi kodda görünmeyen iki arıza vardı — 200 satır kimsenin okumadığı bir duvardır, ve Alman
 * kodları Fransız kodlarının arasına karışır.
 *   Şekil bu yüzden İKİ eksende öbeklendi: **ülke → komün**. 200 kod yaklaşık 80 komüne iner ve her
 * satır tanıdık bir adla başlar. Öbekleme SUNUCUDA yapılır; iki yüzey (bugün uygulama, yarın web)
 * aynı listeyi iki ayrı kuralla öbeklerse biri bir gün ötekinden farklı bir sayfa gösterirdi.
 *
 * **Ama asıl cevap liste değil ARAMADIR** (kullanıcı seçimi): müşterinin sorusu "hepsini göster"
 * değil, *"benim kodum var mı"*. Sayfanın birincil öğesi kod alanıdır ve cevabı bu uçtan değil,
 * `GET /places/by-postal-code`tan gelir — o zaten var ve rota içi/kargo/bilinmiyor ayrımını
 * yapıyor. Bu liste ikincil, "gezinmek" içindir. İkinci bir çözüm ucu YAZILMADI.
 *
 * ── NEDEN région/département YOK ─────────────────────────────────────────────
 * Daha üst bir öbek ("Grand Est", "Bas-Rhin") daha da kısa bir liste verirdi ama o bilgi ŞEMADA
 * HİÇ YOK (ölçüldü). Fransa'da kodun ilk iki hanesi département NUMARASIDIR, adı değil; Almanya'da
 * bunun karşılığı da yok. Numara basmak ("67 bölgesi") müşteriye bir şey söylemez, ad uydurmak ise
 * veri olmadan yapılamaz — o yüzden bu eksen bilinçli olarak AÇILMADI.
 *
 * Sayfalama yok: kod kümesi operatörün elle kurduğu, doğal tavanı olan bir kümedir (CLAUDE §1'in
 * "tek turda" dalı) ve öbeklenmiş hâli 200 kodda bile tek turluk bir gövdedir.
 * **Boş liste geçerli bir cevaptır**; okuma düşseydi zarfın kendisi hata dönerdi (ikisi karışmaz).
 */
export const DeliveryAreaListSchema = z.object({ areas: z.array(DeliveryAreaSchema) });
export type DeliveryAreaList = z.infer<typeof DeliveryAreaListSchema>;
