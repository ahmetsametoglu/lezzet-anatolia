import { z } from 'zod';
import { MarketingChannelEnum, UserProfileSchema } from '../entities/user-profile.schema';
import { PreferredLanguageEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/me` SÖZLEŞME şeması (21.9) — mobil uçun ve onu tüketen uygulama kabuğunun ORTAK dili.
 *
 * Terfi gerekçesi `auth.schema.ts` · `catalog-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek
 * kaynak"): şema uçta yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç
 * doğrulamaz. Buraya taşındığı andan itibaren üreten ve tüketen AYNI şemayı çağırır — alan adı
 * değişirse iki taraf birden derleme anında kırılır. Terfi anı `apps/mobile-api`nin kendi vaadiydi:
 * "Expo iskeleti cevabı AYNI şemayla parse etmeye başlarken" — operasyon kabuğu `roles` alanını
 * okumaya başladığı gün geldi.
 *
 * **ENTITY dosyasında DEĞİL, kendi dosyasında** (katalog terfisiyle aynı ayrım):
 * `user-profile.schema.ts` DB satırının aynasıdır ve oradaki türevler (`UserProfileInsert/Update`)
 * kalıcılık ekseninde durur — "bu satıra ne yazılabilir". Bu şema TAŞIMA ekseninde: "bu yüzey tele
 * ne verir".
 * İkisi aynı dosyada dursaydı bir alanın DB'den kalkması ile müşteriye görünmez olması aynı karar
 * gibi okunurdu; oysa `/me`nin küçülmesi şemanın küçülmesi değildir.
 */

/**
 * Küme MÜŞTERİYE BAKAN alanlardır; operasyon-içi alanlar bilinçli dışarıda: `warehouseIds`
 * (personel kapsamı), `b2bRejectedBy` (personel kimliği), `creditLimitCents`/`discountPercent`
 * (ticari koşullar — hangi uçtan ve nasıl gösterileceği kendi görevlerinin kararı), `isDraft`/
 * `acquisitionSource` (iç yaşam döngüsü). Uç `parse` ile döndürür: pick'te olmayan alan zarfa
 * SIZAMAZ — süzme tipte değil çalışma zamanında da geçerli.
 *
 * `roles` kümenin İÇİNDE ve bu bir gereklilik: uygulama kökü hangi kabuğu (operasyon ↔ müşteri)
 * açacağına bu alanla karar verir (02-mimari §4, kullanıcı kararı 07.08) — rol taşımayan bir `/me`
 * cevabı, giriş yapmış personeli müşteri yüzeyine düşürürdü.
 *
 * `Me` TİPİ bilerek İHRAÇ EDİLMİYOR: bugünkü tek tüketen (`apps/mobile-api`) şemanın KENDİSİNİ
 * çağırıyor, tipe hiç ihtiyacı yok; ilk tip tüketicisi uygulama kabuğuyla gelecek ve o gün tek
 * satırla eklenir. Gerekçe "ihraç minimumu"dur, `knip` DEĞİL: ölçüldü (21.9) — `packages/types`ın
 * paket girişi `src/index.ts` ve o barrel her simgeyi yeniden ihraç ediyor, knip'in varsayılan
 * `includeEntryExports: false` ayarı da giriş üzerinden görünen ihraçları denetim dışı bırakıyor.
 * Bilerek ölü bırakılan bir `export const` bile yakalanmadı. Yani bu dosyada ölü ihraç disiplini
 * MAKİNEYLE ZORLANMIYOR, elle korunuyor.
 */
/**
 * `PATCH /api/v1/me` gövdesi (21.14c) — yalnız MÜŞTERİNİN kendi elindeki alanlar: ad + telefon.
 * E-posta BİLEREK yok: kimliğin kendisidir (auth), değişimi ayrı bir doğrulama akışı ister.
 * Dil/izinler de yok — onların yeri tercih uçları (web'in aynı ayrımı: "dil profil formunun işi
 * değil"). İki alan da isteğe bağlı: gönderilmeyen alanına DOKUNULMAZ; `phone: null` numarayı siler.
 */
export const MeUpdateSchema = z
  .object({
    name: z.string(),
    phone: z.string().nullable(),
  })
  .partial();

/**
 * Güncellemenin adlı retleri — cümleyi ekran kurar, anahtar sözleşmede yaşar.
 *
 * **`phone_taken` KALDIRILDI (04.10):** dayandığı tekil indeks (`user_profiles_phone_key`) yok
 * artık — bu kolon iletişim numarası oldu, kimlik anahtarı `customer_phone`a taşındı. Ret hiçbir
 * hâlde dönmeyeceği için sözleşmede tutmak yalan olurdu; ekranlardaki cümlesi ölü metindir.
 */
export const MeUpdateErrorEnum = z.enum(['name_required', 'phone_invalid']);
export type MeUpdateError = z.infer<typeof MeUpdateErrorEnum>;

/**
 * `PATCH /api/v1/me/preferences` gövdesi (21.16) — dil + kampanya izinleri.
 *
 * **`MeUpdateSchema`ya EKLENMEDİ, AYRI gövde.** Üstteki künye dil/izinlerin profil formunun işi
 * olmadığını zaten söylüyordu ve web'in ayrımı da üç ayrı kapıdır (ad/telefon
 * `updateProfileAction`, dil `language-actions`, izin `setConsentAction`). Tek gövdede
 * birleşselerdi bir çağrı hem kimlik künyesini hem GDPR kanıtını yazardı; oysa ikisinin reddi,
 * doğrulaması ve denetim izi ayrı cinsten. Ayrı gövde, ayrı kapı demektir.
 *
 * İki alan da isteğe bağlı: gönderilmeyen alana DOKUNULMAZ (`MeUpdateSchema` ile aynı kural).
 *
 * **İzin gövdesi BAYRAK taşır, KAYIT değil** — kanal başına `granted` boolean'ı gelir; `at` ve
 * `source` GELMEZ. Kanıtı istemci yazamaz: pazarlama izni bir gün sorulduğunda dayanağımız o
 * damgadır ve telefondan gelen bir tarihe dayanan kanıt, kanıt değildir. Damgayı sunucu vurur
 * (`@lezzet/application` → `customer/preferences.ts`), kaydın şekli varlık şemasında
 * (`MarketingConsentSchema`: `granted` + `at` + `source`).
 *
 * Kanal listesi `MarketingChannelEnum`den TÜRER, elle yazılmaz — varlık şemasındaki `.keyof()`
 * kararının devamı: üçüncü kanal (SMS) eklendiğinde gövde kendiliğinden büyür. `z.record`
 * bilerek `z.object().partial()`a tercih edildi: nesne şeması tanımadığı anahtarı SESSİZCE
 * düşürür, record ise anahtarın adını söyleyerek reddeder — sunucunun daha desteklemediği bir
 * kanalı gönderen istemci "kaydettim" sanmasın. (Ölçüldü: `z.record` enum anahtarla
 * `Partial<Record<…>>` türetir, yani eksik kanal hem tipte hem çalışma zamanında serbesttir.)
 */
export const MePreferencesSchema = z
  .object({
    preferredLanguage: PreferredLanguageEnum,
    marketingConsent: z.record(MarketingChannelEnum, z.boolean()),
  })
  .partial();

/**
 * Tercih güncellemesinin adlı retleri — `MeUpdateErrorEnum`dan FARKLI cinsten: oradakiler
 * DOĞRULAMA reddidir (boş ad, geçersiz numara), buradakiler DURUM reddi. Doğrulama tarafının boş
 * olması bir eksiklik değil ölçüm sonucu: kabul edilen her şey kapalı bir küme (dil üç değerli
 * enum, izin boolean), geçersiz olan şema kapısından `invalid_body` olarak döner ve kapıya hiç
 * varmaz.
 *
 * `no_changes` titizlik değil GÖRÜNÜRLÜK: hiçbir alan taşımayan gövde istemci hatasıdır ve 200
 * dönmek onu susturur — "anahtarı yanlış yazmışım, ekran kaydetmiyor" arızası ancak aylar sonra
 * fark edilirdi (CLAUDE §0: belirtiyi susturan çözüm, arızayı gözden saklar). Gönderilen değerin
 * kayıtlıyla AYNI olması bu ret DEĞİLDİR — o geçerli ve boşa yazmayan bir çağrıdır.
 */
export const MePreferencesErrorEnum = z.enum(['no_changes', 'profile_not_found']);
export type MePreferencesError = z.infer<typeof MePreferencesErrorEnum>;

export const MeSchema = UserProfileSchema.pick({
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  preferredLanguage: true,
  country: true,
  roles: true,
  b2bApproved: true,
  b2bPending: true,
  marketingConsent: true,
  referralCode: true,
  createdAt: true,
});
