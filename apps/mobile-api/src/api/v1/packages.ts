import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { bundleAvailabilityOf, getPackageDetail, readPackageCards } from '@lezzet/application';
import { localizedUrl } from '@lezzet/i18n';
import { PackageDetailSchema, PackageListSchema, PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import { optionalCustomerId } from './auth';
// Yer çözümü katalog ucunun kapısından (`readPlace`): posta kodu → depo eşlemesi TEK yerde durur.
import { readPlace } from './catalog';

/**
 * Paket uçları oturumsuz gezilir ve fiyat kimliğe göre okunmaz, çünkü paket yalnız B2C'dedir ve tek fiyat taşır. Uç kural
 * hesaplamaz: satılabilirlik ve yer ölçütü web ile aynı kapıdan gelir, liste ile detay ayrı ölçseydi kartında yazmayan "bu
 * adrese gönderemiyoruz" detayda çıkardı.
 */
export const packages = new Hono<AppEnv>();

/**
 * Paket listesi: vitrinden farkı süzgeçtir — vitrin işaretli paketleri, bu liste yayındakilerin tamamını taşır. Sayfalama ve
 * `limit` yok, çünkü operatörün elle kurduğu küçük bir küme tek sorguda okunur.
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

  /* Paket görüntülemesi ürün detayının olayıdır, öznesi `bundle`. `productId` yazılmaz: paket ürünlerin demeti, birine atfetmek
     günlük ürün özetini yanlış beslerdi. */
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
  // süzgeçtir — kapının ürettiği ama ekranın işi olmayan alanlar (KDV oranı, tavan, ağırlık, alerjen,
  // raf ömrü) zarfa sızamaz.
  const body: z.input<typeof PackageDetailSchema> = {
    // `id` sepetin ihtiyacı, ekranın değil: sunucu sepetinde paket satırının adresi `bundleId`dir.
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
      variantId: item.variantId,
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
