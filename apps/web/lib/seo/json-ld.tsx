import { brand } from '@lezzet/brand';
import { siteOrigin } from '@lezzet/i18n';
import type { StorefrontProductDetail, StorefrontVariant } from '@lezzet/application';
import type { StorefrontRecipeDetail } from '@/lib/storefront/storefront-types';

/**
 * schema.org yapısal verisi — yalnız elimizde gerçekten olan alan yazılır: uydurma değer arama
 * motorunca yaptırıma uğrar, boş alan yazmaktansa alanı hiç yazmamak.
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
  url: string;
  /** Yorum özeti — yoksa `aggregateRating` hiç yazılmaz. */
  rating: { average: number; count: number } | null;
}

export function ProductJsonLd({ product, url, rating }: ProductJsonLdProps) {
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
        // Varyant başına teklif: "1 kg" ile "500 g" farklı fiyatlı iki tekliftir.
        ...(offers.length > 0
          ? {
              offers: offers.map((variant) => ({
                '@type': 'Offer',
                name: variant.label,
                price: (variant.priceCents / 100).toFixed(2),
                priceCurrency: 'EUR',
                // `stockStatus` ziyaretçinin yerine bağlı, botun yeri yok; `soldOut` yalnız "hiçbir depoda kalmadı" der.
                availability: variant.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
                url,
              })),
            }
          : {}),
      }}
    />
  );
}

/**
 * `Recipe` — tarif sayfasının yapısal verisi. `totalTime` yazılmaz: süre serbest metin ve ISO 8601'e
 * ayrıştırmak ölçülmemiş değeri beyan etmek olurdu. Malzeme listesi evden eklenenleri de taşır, yoksa tarif eksik beyan edilirdi.
 */
export function RecipeJsonLd({ recipe, url }: { recipe: StorefrontRecipeDetail; url: string }) {
  const ingredients = [
    ...recipe.items.map((item) =>
      [item.qty > 1 ? `${item.qty} ×` : null, item.unitLabel, item.name].filter(Boolean).join(' '),
    ),
    ...recipe.pantry,
  ];

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: recipe.name,
        ...(recipe.description ? { description: recipe.description } : {}),
        ...(recipe.image.url ? { image: recipe.image.url } : {}),
        url,
        author: { '@type': 'Organization', name: brand.name },
        ...(recipe.serves ? { recipeYield: recipe.serves } : {}),
        ...(recipe.meal ? { recipeCategory: recipe.meal } : {}),
        ...(ingredients.length > 0 ? { recipeIngredient: ingredients } : {}),
        // Adım nesnesi arama sonucunda numaralı gösterime izin verir.
        ...(recipe.steps.length > 0
          ? { recipeInstructions: recipe.steps.map((text) => ({ '@type': 'HowToStep', text })) }
          : {}),
      }}
    />
  );
}

/**
 * `LocalBusiness` — ana sayfada, işletmenin kim ve nerede olduğu. `legalName` ile `name` ayrı:
 * ziyaretçi markayı arar, yasal kayıt şirketin unvanını taşır.
 */
export function LocalBusinessJsonLd({ url }: { url: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'GroceryStore',
        name: brand.name,
        legalName: brand.company.legalName,
        vatID: brand.company.vatId,
        url,
        image: `${siteOrigin()}/logo-dikey@3x.png`,
        email: brand.contact.email,
        telephone: brand.contact.phoneE164,
        address: {
          '@type': 'PostalAddress',
          streetAddress: brand.company.address.street,
          postalCode: brand.company.address.postalCode,
          addressLocality: brand.company.address.city,
          addressCountry: brand.company.address.countryCode,
        },
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
