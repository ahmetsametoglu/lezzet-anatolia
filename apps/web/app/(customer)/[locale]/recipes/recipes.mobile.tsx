import recipesMessages from '@lezzet/i18n/customer/recipes';
import { RATIO_WIDE } from '@lezzet/types';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PhotoTile } from '@/components/customer/phone-kit/photo-tile';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { Tag } from '@/components/customer/phone-kit/tag';
import { BackButton } from '@/components/customer/ui/back-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { RecipesViewProps } from './recipes-types';

/**
 * Native tarif listesinin web telefon ikizi; yığın ekranıdır, sekme çubuğu yok ve başlık satırı ‹ ile başlar. Üst pay tasarımın
 * 16'sıdır (sayfa 10 + başlık satırı 6); native'in bu ekrandaki 6'sı tasarımdan eksiktir.
 */
export function RecipesMobile({ locale, recipes }: RecipesViewProps) {
  const copy = recipesMessages[locale];

  return (
    <div className="flex flex-col gap-3 px-4.5 pt-2.5 pb-5">
      <header className="flex flex-col gap-2 pt-1.5">
        {/* Daire sayfa dolgusuna taşar: ikon metin sütunuyla hizalı (native `headerRow` −8). */}
        <div className="-ml-2 flex items-center gap-2">
          <BackButton label={copy.back} fallback="/" />
          <h1 className="min-w-0 flex-1 font-serif text-screen-title text-ink">{copy.title}</h1>
        </div>
        <p className="font-sans text-note leading-[1.6] text-muted">{copy.body}</p>
      </header>

      {recipes.length === 0 ? (
        <EmptyState
          icon={<MobileIcon name="search-empty" size={80} className="text-sand-600" />}
          title={copy.empty.title}
          description={copy.empty.body}
          action={<PrimaryButton label={copy.empty.cta} href="/catalog" />}
        />
      ) : (
        recipes.map((recipe) => (
          <PhotoTile
            key={recipe.id}
            href={{ pathname: '/recipe/[slug]', params: { slug: recipe.slug } }}
            label={copy.open.replace('{name}', recipe.name)}
            image={recipe.image}
            initial={recipe.name.slice(0, 1)}
            // Kutu telefon eninde ≈ 354 × 168 — CDN'den 2:1 çerçeve.
            className="h-42 w-full"
            ratio={RATIO_WIDE}
            sizes="100vw"
            topBadge={recipe.duration === null ? undefined : <Tag label={recipe.duration} tone="cream" rotate={-3} />}
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-serif text-h2-sm leading-[1.15] text-on-image">{recipe.name}</span>
              <span className="font-sans text-helper font-bold text-olive-light">
                {copy.meta.replace('{n}', String(recipe.itemCount + recipe.pantryCount))}
              </span>
            </span>
          </PhotoTile>
        ))
      )}
    </div>
  );
}
