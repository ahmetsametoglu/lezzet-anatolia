import { RecipeListCard } from '@/components/customer/ui/recipe-card';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import type { RecipesViewProps } from './recipes-types';

/**
 * Tarifler — mobil web düzeni (tasarım: `Musteri - Tarifler.dc.html`, "Tarifler Mobil").
 *
 * Cihaz forku, responsive DEĞİL (`CLAUDE §2` · ADR Sapma 3): `md:` ile akışkan bir ızgara
 * yazılmadı. Fark yalnız sütun sayısı değil — dar ekranda **açıklama paragrafı da düşüyor**
 * (kartlarda ve sayfa sözünde), tasarımın kararı bu. Tek dosyada koşullu sınıflarla kurulsaydı
 * ikisi de kalır ve mobil ekran ikinci bir tasarım gibi görünürdü.
 */
export function RecipesMobile({ t, locale, recipes }: RecipesViewProps) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-2.5 pb-5">
      {/* Başlık çerçevenin çubuğunda ("Tarifler", 14.09); görünür ikinci bir başlık kurulmaz. `h1`
          arama motoru ve ekran okuyucu için yerinde kalır. */}
      <h1 className="sr-only">{t.heroTitle}</h1>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-sand-500 px-5 py-8 text-center">
          <span className="text-icon-sm">🍲</span>
          <span className="font-sans text-body-sm font-bold text-ink">{t.empty.title}</span>
          <span className="font-sans text-note text-muted">{t.empty.body}</span>
          <Link href="/catalog" className={buttonClass({ size: 'sm', className: 'mt-1' })}>
            {t.empty.cta}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {recipes.map((recipe) => (
            <RecipeListCard key={recipe.id} recipe={recipe} locale={locale} labels={t} compact />
          ))}
        </div>
      )}
    </div>
  );
}
