import { UserProfileSchema } from './user-profile.schema';

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
