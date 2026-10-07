import { RATIO_BAND, RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontRecipe } from '@/lib/storefront/storefront-types';

/**
 * Kartın tamamı detaya giden bağdır ve listede "sepete ekle" yoktur: tarif bir satış birimi değil, hangi malzemenin alınabildiği
 * detayda görülür. Çerçeve 3/2'dir, tasarımın 16/10'u envanterde olmadığı için operatörün kırpma panelinde karşılığı olmazdı.
 */
interface RecipeCardLabels {
  items: string;
  pantry: string;
  soldOutShort: string;
  cta: string;
}

interface RecipeTeaserLabels {
  /** "{n} malzeme" — ana sayfa tasarımının kendi sözcüğü; liste kartı "ürün" diyor. */
  items: string;
  /** "evinizden {n}" — listedeki "+ {n} ev malzemesi"nin kısa hâli. */
  pantry: string;
  soldOutShort: string;
  cta: string;
}

interface RecipeTeaserCardProps {
  recipe: StorefrontRecipe;
  labels: RecipeTeaserLabels;
}

/**
 * Ana sayfa tarif kartı liste kartının varyantı değil kardeşidir: kabuk, rozet ve düğme yoktur, ortak olan yalnız veri ve hedeftir.
 * Fiyat yoktur ve künye cümleleri listedekinden ayrıdır; çerçeve 3/2, tasarımın 4/3'ü envanterde yok.
 */
export function RecipeTeaserCard({ recipe, labels }: RecipeTeaserCardProps) {
  const meta = recipe.soldOut
    ? labels.soldOutShort
    : [
        recipe.duration,
        recipe.serves,
        [
          labels.items.replace('{n}', String(recipe.itemCount)),
          recipe.pantryCount > 0 ? labels.pantry.replace('{n}', String(recipe.pantryCount)) : null,
        ]
          .filter(Boolean)
          .join(' + '),
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <Link
      href={{ pathname: '/recipe/[slug]', params: { slug: recipe.slug } }}
      className="group flex cursor-pointer flex-col gap-2.5"
    >
      {/* Yalnız masaüstü ana sayfada, 3 sütunlu ızgarada (~409 px). */}
      <FramedImage
        src={recipe.image.url}
        alt={recipe.name}
        ratio={RATIO_SOURCE}
        crop={recipe.image.crop}
        frames={recipe.image.frames}
        sizes="410px"
        className="!rounded-card border border-sand-300 bg-sand-200"
      />
      <div className="flex flex-col gap-0.75">
        <span className="font-serif text-h2-sm text-ink">{recipe.name}</span>
        <span className="font-sans text-control font-normal text-muted">{meta}</span>
        {/* Çağrı kartın İÇİNDE bir bağ değil, kartın kendi bağının etiketi — kart zaten tıklanabilir.
            Bağ içinde bağ erişilebilirlikte geçersiz (liste kartıyla aynı karar). */}
        <span className="font-sans text-control text-olive transition-colors group-hover:text-olive-dark">
          {labels.cta}
        </span>
      </div>
    </Link>
  );
}

interface RecipeListCardProps {
  recipe: StorefrontRecipe;
  locale: Locale;
  labels: RecipeCardLabels;
  /** Mobil web: tek sütun kart — açıklama ve ev malzemesi sayısı düşer (tasarım). */
  compact?: boolean;
}

export function RecipeListCard({ recipe, locale, labels, compact = false }: RecipeListCardProps) {
  // Rozet iki serbest metnin birleşimi ("15 dk · 2 kişilik"); biri boşsa öteki tek başına yazılır,
  // ikisi de boşsa rozet HİÇ çizilmez — boş bir rozet fotoğrafın üstünde anlamsız bir leke olurdu.
  const badge = [recipe.duration, recipe.serves].filter(Boolean).join(' · ');

  return (
    <Link
      href={{ pathname: '/recipe/[slug]', params: { slug: recipe.slug } }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-card border border-sand-200 bg-card transition-colors hover:border-olive-line"
    >
      <div className="relative">
        <FramedImage
          src={recipe.image.url}
          alt={recipe.name}
          ratio={compact ? RATIO_BAND : RATIO_SOURCE}
          crop={recipe.image.crop}
          frames={recipe.image.frames}
          // Masaüstü 3 sütun (~407 px), mobil tek sütun ekran eninde.
          sizes={compact ? '100vw' : '410px'}
          className="!rounded-none"
        />
        {badge && (
          <span
            className={[
              // Rozet zemini KREM, koyu değil (tasarım): tarif fotoğrafları sıcak ve açık tonlu,
              // koyu bir rozet yemeğin üstünde delik gibi duruyor. Paket kartındaki `bg-ink/80`
              // bilinçli olarak taklit edilmedi.
              'pointer-events-none absolute rounded-soft bg-cream/95 font-sans font-bold text-ink',
              compact ? 'top-2.5 left-2.5 px-2.5 py-1 text-micro' : 'top-3 left-3 px-3 py-1.5 text-micro',
            ].join(' ')}
          >
            {badge}
          </span>
        )}
      </div>

      <div className={['flex flex-1 flex-col', compact ? 'gap-1.5 px-4 pt-3 pb-3.5' : 'gap-2 px-5 pt-4.5 pb-5'].join(' ')}>
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{recipe.name}</span>

        {/* Açıklama kartın esneyen parçası: ızgara boyunca kart yükseklikleri eşitlensin diye
            `flex-1` ondadır, künye satırı böylece daima alt hizada durur (paket kartı emsali).
            Mobilde hiç çizilmiyor — tasarım dar kartta yalnız ad ve künyeyi gösteriyor. */}
        {!compact && recipe.description && (
          <p className="line-clamp-2 flex-1 font-sans text-note leading-relaxed text-body">{recipe.description}</p>
        )}

        <div
          className={[
            'flex items-center justify-between gap-3',
            compact ? '' : 'mt-1 border-t border-sand-100 pt-3',
          ].join(' ')}
        >
          <span className="font-sans text-note font-semibold text-body">
            {/* Ev malzemesi sayısı yalnız masaüstünde: dar kartta satır sarıp fiyatı aşağı iter. Tükendiğinde sayı yerine tek cümle
                kalır, alınamayan tarifte fiyat yazmak yanlış söz olurdu. */}
            {recipe.soldOut ? (
              <span className="text-ink">{labels.soldOutShort}</span>
            ) : (
              <>
                {labels.items.replace('{n}', String(recipe.itemCount))}
                {!compact && recipe.pantryCount > 0 && ` ${labels.pantry.replace('{n}', String(recipe.pantryCount))}`}
                {recipe.totalCents !== null && (
                  <>
                    {' · '}
                    <strong className="text-olive-dark">{formatPrice(recipe.totalCents, locale)}</strong>
                  </>
                )}
              </>
            )}
          </span>
          {/* Düğme GÖRÜNÜMÜNDE bir etiket, `<button>` DEĞİL: kartın tamamı zaten bağlantı ve içine
              ikinci bir tıklama hedefi koymak (bağ içinde bağ) erişilebilirlikte geçersiz. */}
          <span
            className={[
              'flex-none rounded-pill bg-olive font-sans font-bold text-white',
              compact ? 'px-4 py-2 text-note' : 'px-4.5 py-2.5 text-body-sm',
            ].join(' ')}
          >
            {labels.cta}
          </span>
        </div>
      </div>
    </Link>
  );
}
