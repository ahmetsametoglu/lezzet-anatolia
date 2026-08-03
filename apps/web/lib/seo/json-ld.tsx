import { brand } from '@lezzet/brand';
import { siteOrigin, type Locale } from '@lezzet/i18n';
import type { StorefrontProductDetail, StorefrontVariant } from '@/lib/storefront/storefront-types';

/**
 * schema.org yapısal verisi (08.1) — arama sonucunda fiyat, stok ve puan görünmesini sağlayan şey.
 *
 * `SEO_I18N` bunu bir ara *"Faz 2'de değerlendirilir"* diye erteliyordu; görev satırı (08.1) ise
 * `Product`/`LocalBusiness` istiyor. **Görev satırı geçerli** (`CLAUDE.md §5`: durumun tek sahibi
 * odur) ve pratikte de doğrusu bu: yapısal veri, sayfalar zaten sunucuda çizildiği için neredeyse
 * bedava — ertelemenin kazandırdığı bir şey yok, kaybettirdiği görünürlük var.
 *
 * **Ne söylenirse DOĞRU söylenir.** Yapısal veride uydurma değer (olmayan bir puan, tutmayan bir
 * stok) arama motoru tarafından yaptırıma uğrar. O yüzden burada yalnız elimizde GERÇEKTEN olan
 * alanlar yazılıyor: puan yoksa `aggregateRating` bloğu hiç doğmuyor, fiyat yoksa `offers` yok.
 * Boş bir alan yazmaktansa alanı hiç yazmamak.
 */

/** `<script type="application/ld+json">` — Next'in önerdiği gömme biçimi. */
function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Veri bizim ürettiğimiz nesneden geliyor, kullanıcı girdisinden değil; yine de `<` kaçırılıyor
      // — açıklama metninde geçen bir `</script>` dizisi sayfayı bölerdi.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

interface ProductJsonLdProps {
  product: StorefrontProductDetail;
  locale: Locale;
  url: string;
  /** Yorum özeti — yoksa `aggregateRating` hiç yazılmaz. */
  rating: { average: number; count: number } | null;
}

export function ProductJsonLd({ product, locale, url, rating }: ProductJsonLdProps) {
  const offers = product.variants.filter((v): v is StorefrontVariant & { priceCents: number } => v.priceCents !== null);

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        ...(product.description ? { description: product.description } : {}),
        ...(product.image.url ? { image: product.image.url } : {}),
        ...(product.category ? { category: product.category.name } : {}),
        url,
        brand: { '@type': 'Brand', name: brand.name },
        ...(rating && rating.count > 0
          ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.average, reviewCount: rating.count } }
          : {}),
        // Varyantlar ayrı ayrı yazılıyor: "1 kg" ile "500 g" farklı fiyatlı iki tekliftir ve tek bir
        // fiyat yazmak müşteriye arama sonucunda yanlış rakam göstermek olurdu.
        ...(offers.length > 0
          ? {
              offers: offers.map((variant) => ({
                '@type': 'Offer',
                name: variant.label,
                price: (variant.priceCents / 100).toFixed(2),
                priceCurrency: 'EUR',
                /**
                 * Stok, dört hâlin DARALTILMIŞI olan `soldOut`tan okunuyor — `stockStatus`tan
                 * değil. Sebep: o dört hâlin üçü ziyaretçinin YERİNE bağlı ("bölgenizde yok",
                 * "kargoyla gönderilir") ve tarayıcı botunun bir yeri yok. `soldOut` ise tek bir
                 * şey söyler: hiçbir depoda kalmamış. Yapısal veride söylenebilecek doğru cümle o.
                 */
                availability: variant.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
                url,
                inLanguage: locale,
              })),
            }
          : {}),
      }}
    />
  );
}

/**
 * `LocalBusiness` — ana sayfada, işletmenin kim ve nerede olduğu.
 *
 * Künye `docs/architecture/BUSINESS_CATALOG.md`'den; tam sokak adresi orada da yok, o yüzden
 * `address` yalnız şehir ve ülke taşıyor. Uydurma bir sokak adı, yapısal veride yalan beyandır.
 * BEKLEYEN(08.8): tam sokak adresi — gelince `streetAddress` ve `postalCode` buraya eklenir.
 * İşaret 08.8'e bağlı çünkü aynı eksik oradaki mentions légales sayfasını da bekletiyor; tek bir
 * bilgi iki yeri birden açar ve iki ayrı kayda bölünmesi, birinin unutulması demekti.
 */
export function LocalBusinessJsonLd({ url }: { url: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'GroceryStore',
        name: brand.name,
        url,
        image: `${siteOrigin()}/logo.jpg`,
        email: 'lezzetanatolie@gmail.com',
        telephone: '+33616990681',
        address: { '@type': 'PostalAddress', addressLocality: 'Strasbourg', addressCountry: 'FR' },
        // Hizmet bölgesi: dükkânsız işletmeyiz, teslimat bölgeye ve kargoya dayanıyor (DOMAIN §14).
        areaServed: [
          { '@type': 'Country', name: 'France' },
          { '@type': 'Country', name: 'Deutschland' },
        ],
        currenciesAccepted: 'EUR',
      }}
    />
  );
}
