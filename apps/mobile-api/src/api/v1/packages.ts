import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { bundleAvailabilityOf, getPackageDetail } from '@lezzet/application';
import { localizedUrl } from '@lezzet/i18n';
import { PackageDetailSchema, PackageListSchema, PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import { optionalCustomerId } from './auth';
import { readPackageCards } from '../../lib/ideas';
// Yer çözümü katalog ucunun kapısından (`readPlace`): posta kodu → depo eşlemesi TEK yerde durur.
import { readPlace } from './catalog';

/**
 * Paket detay ucu (21.14) — vitrinin "Hazır paketler" kartının açtığı sayfa. Katalog kümesindendir:
 * **oturumsuz gezilir** (`router.ts`te `bearerAuth`tan ÖNCE bağlı — 02-mimari §4 "oturumsuz
 * kullanım = müşteri gezinmesi") ve kimlik OKUNMAZ bile: paket YALNIZ B2C'dedir ve tek fiyat taşır
 * (`bundle.totalPrice`, veri modelinin kendi hükmü) — kişiselleşecek bir fiyat yok, `readViewer`
 * çağırmak boşa bir tur olurdu.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Yaptığı şey taşımadır: dili doğrular, terfi etmiş paket kapısını çağırır, dönen görünümü sözleşme
 * şekline indirger ve zarflar.
 *
 * ── SATILABİLİRLİK ARTIK ORTAK KAPIDAN (09.08) ──────────────────────────────
 * Bu uç 09.08'e kadar kendi okumasını yazıyordu (`listWithItems` + kalem→ürün köprüsü + kargo
 * kısıtı türetmesi) çünkü web'in paket kapısı `server-only`di ve kopyalaması yasaktı. Kapı
 * `@lezzet/application`a terfi etti; uç artık `getPackageDetail`i çağırıyor ve satılabilirlik
 * ölçütü webinkiyle AYNI: pasif paket, kalemsiz paket ve **kalemi satıştan kalkmış paket** 404
 * (`listSellable` — DOMAIN §13). Eski hâlinde son madde eksikti: boyu pasife alınmış bir ürünün
 * paketi mobilde hâlâ satılabilir görünüyordu. BEKLEYEN(21.14) kapandı.
 *
 * ── YER ARTIK KAPIYA GEÇİYOR (10.08) ────────────────────────────────────────
 * Bu künye 09.08'de şöyle diyordu: *"`soldOut` hâlâ sözleşmede YOK … yer (posta kodu) bu yüzden
 * kapıya GEÇİLMİYOR: sözleşmenin yere bağlı tek bir alanı yok, geçmek ölçülemeyen bir bedel
 * olurdu."* **Değişen şey sözleşmedir:** kart ve detay artık `soldOut` · `route` taşıyor
 * (`package-api.schema.ts` künyesi — iki eksen neden ayrı). Bedelin karşılığı doğdu, yani her iki
 * uç da `?postalCode=` okuyup `readPlace` ile çözüyor ve kapıya `place` geçiyor.
 *
 * **LİSTE ve DETAY AYNI ÖLÇÜTÜ KULLANIR** ve bu iki katmanda birden zorunlu: satılabilirlik
 * (`listSellable`) ve artık YER de. Detayda çözülen yerin listede çözülmemesi, kartında "bu adrese
 * gönderemiyoruz" yazmayan bir paketin detayında yazması demekti.
 *
 * Posta kodu bir SORUDUR, cevabı sunucu verir (`readPlace` künyesi): istemcinin yazabildiği bir
 * değer hangi deponun stoğunu göstereceğimizi belirleyemez. Kod yoksa/çözülemezse iki `null` döner
 * ve okuma ağ-genelinde kalır — `route: null`, yani "yol bilinmiyor".
 */
export const packages = new Hono<AppEnv>();

/**
 * PAKET LİSTESİ — "Fikirler" sekmesinin paket bölümü (09.08 bilgi mimarisi kararı).
 *
 * **VİTRİNDEN FARKI SÜZGEÇTİR, KART DEĞİL** (ortak kapı `lib/ideas.ts`): vitrin yalnız İŞARETLİ
 * paketleri taşır (işaret bir seçimdir), bu liste ise yayındaki paketlerin TAMAMIDIR — sayfa
 * "hepsi" sorusunun cevabı, seçki değil.
 *
 * Sayfalama yok: paket kataloğu doğal tavanlı, operatörün elle kurduğu bir kümedir (CLAUDE §1 "tek
 * turda" dalı) ve okuma zaten TEK sorgudur. `limit` sorgusu da yok — istemcinin belirlediği sınır,
 * sınır değildir.
 *
 * Kimlik OKUNMAZ: paket tek fiyatlıdır (B2C), Bearer'ın kişiselleştireceği bir şey yok — detay
 * ucunun aynı kısa devresi (dosya başlığı).
 */
packages.get('/packages', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const place = await readPlace(db, c.req.query('postalCode'));
  const list = await readPackageCards(db, locale.data, { featuredOnly: false, place });

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  const body: z.input<typeof PackageListSchema> = { packages: list };
  return ok(c, PackageListSchema.parse(body));
});

/**
 * `locale` zorunlu ve varsayılansız (`catalog.ts` `LocaleSchema` künyesi: sessizce Türkçeye düşmek
 * gizli arıza). Satılamayan/eksik slug 404 — katalogda görünmeyen paket linkle de açılmaz.
 */
packages.get('/packages/:slug', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  /* KANAL BURADA SORULMAZ, BİLİNİR: paket yalnız B2C'dedir (bu dosyanın künyesi) — ölçüm uğruna
     `readViewer` çağırmak, o kararın açıkça "boşa bir tur" dediği şeyi yapmak olurdu. Okunan tek
     şey KİMLİK ve o da yalnız personel süzgeci için (`ANALYTICS §1`: personel ölçülmez); misafirde
     ek sorgu doğmaz, `optionalCustomerId` kimliksizde erken döner. */
  const [place, customerId] = await Promise.all([
    readPlace(db, c.req.query('postalCode')),
    optionalCustomerId(db, c.req.header('authorization')),
  ]);
  const pack = await getPackageDetail(db, c.req.param('slug'), locale.data, place);
  if (!pack) return fail(c, 'package_not_found', 404);

  /* PAKET GÖRÜNTÜLEMESİ — ürün detayının aynı olayı, yalnız öznesi `bundle`. Enum'da `bundle`
     ZATEN vardı, yeni bir olay türü icat edilmedi. `productId` YAZILMAZ: paket bir ürün değil,
     ürünlerin demeti — birine atfetmek günlük ürün özetini yanlış beslerdi. */
  void recordNativeEvent(
    { db, channel: 'b2c', customerId, place, locale: locale.data, country: null },
    {
      type: 'product_view',
      subjectType: 'bundle',
      subjectId: pack.id,
      availability: bundleAvailabilityOf(pack),
    },
  );

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: şekil sözleşmeden saparsa burası DERLENMEZ; `parse` da
  // süzgeçtir — kapının ürettiği ama ekranın işi olmayan alanlar (KDV oranı, tükendi, yol, tavan,
  // ağırlık, alerjen, raf ömrü, kalem varyant kimliği) zarfa sızamaz.
  const body: z.input<typeof PackageDetailSchema> = {
    // `id` SEPETİN ihtiyacı, ekranın değil (21.21): sunucu sepetinde paket satırının adresi
    // `bundleId`dir ve sözleşme yalnız `slug` taşıdığı sürece mobilden paket EKLENEMİYORDU —
    // satır cihazda kalıyor, sunucunun çözdüğü toplama hiç girmiyordu.
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    // Kapı açıklamayı BOŞ DİZE olarak veriyor (vitrin kartı öyle istiyor), sözleşme `null` istiyor:
    // "girilmemiş" ile "boş" aynı şeydir ve ekran o hâlde paragrafı hiç çizmez.
    description: pack.description.trim() === '' ? null : pack.description,
    priceCents: pack.priceCents,
    // Yön çevrilmiş: kapı kısıtı (`inRouteOnly`), sözleşme yeteneği (`shippable`) taşıyor — ekran
    // `!shippable` ile kısıt çipini çizer (ürün detayının okuduğu yön).
    shippable: !pack.inRouteOnly,
    // İKİ EKSEN AYRI TAŞINIR: `soldOut` ağ geneli ("hiç var mı"), `route` yere bağlı ("bana nasıl
    // gelir"). Yer bilinmiyorsa `route` null gelir ve ekran o hâlde susar (sözleşme künyesi).
    soldOut: pack.soldOut,
    route: pack.route,
    image: pack.image,
    // Satır sırası paketin kendi sırasıdır; ürünü çözülemeyen kalem sessizce DÜŞMEZ (kapının son
    // çaresi: bağsız ve adsız kalır) — paket "4 ürün" diyorsa dördü de görünür.
    items: pack.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      unitLabel: item.unitLabel,
      qty: item.qty,
      image: item.image,
    })),
    // Paylaşım adresi web rotasının kuralından gelir, burada KURULMAZ — künyesi `catalog.ts`ın
    // ürün detayında (aynı gerekçe, aynı tek kaynak: `localizedUrl`).
    shareUrl: localizedUrl('/package/[slug]', locale.data, { slug: pack.slug }),
  };
  return ok(c, PackageDetailSchema.parse(body));
});
