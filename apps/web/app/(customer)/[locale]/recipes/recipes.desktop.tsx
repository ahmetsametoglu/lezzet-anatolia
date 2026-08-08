import { RecipeListCard } from '@/components/customer/ui/recipe-card';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import type { RecipesViewProps } from './recipes-types';

/**
 * Tarifler — masaüstü düzeni (tasarım: `Musteri - Tarifler.dc.html`, "Tarifler Web").
 *
 * Tasarımın iki bloğu: **söz** (eyebrow + başlık + paragraf, dar sütun) → **üçlü ızgara**.
 * Kahraman görseli YOK ve bu paketler sayfasından ayrıldığı yer: orada söz bir görselle
 * dengeleniyor, burada sözün altında zaten üç yemek fotoğrafı var — dördüncü bir görsel sayfayı
 * fotoğraf duvarına çevirirdi.
 *
 * **Süzgeç, arama ve sıralama YOK** (paket sayfasıyla aynı gerekçe): sıra editoryal bir seçkidir,
 * müşteriye seçenek sunmak kürasyonu bozar. "Daha fazla" düğmesi de yok — tarif kümesi doğal
 * tavanlı ve tek turda okunuyor (`CLAUDE §1`); bugünkü boyda ızgarayı bölmek yapay olurdu.
 */
export function RecipesDesktop({ t, locale, recipes }: RecipesViewProps) {
  return (
    <div className="flex flex-col">
      <section className="flex max-w-[860px] flex-col gap-3.5 px-12 pt-11 pb-2.5">
        <span className="font-sans text-eyebrow text-olive uppercase">{t.eyebrow}</span>
        {/* Tasarımda 44 px; ölçeğin tepesi 38 px (`page-title`). Paketler sayfasında verilen kararın
            aynısı — 6 px için yeni basamak açmak "hangi başlık hangi basamak"ı bulanıklaştırır. */}
        <h1 className="font-serif text-page-title text-ink">{t.heroTitle}</h1>
        <p className="font-sans text-lead text-body">{t.heroBody}</p>
      </section>

      <section className="px-12 pt-6.5 pb-11">
        {recipes.length === 0 ? (
          // Boş durum: kesikli çerçeveli tek kutu — sayfanın sözü (yukarısı) yerinde kalır.
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-sand-500 px-8 py-10 text-center">
            <span className="text-icon">🍲</span>
            <span className="font-sans text-body font-bold text-ink">{t.empty.title}</span>
            <span className="max-w-[420px] font-sans text-note text-muted">{t.empty.body}</span>
            <Link href="/catalog" className={buttonClass({ size: 'sm', className: 'mt-1' })}>
              {t.empty.cta}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4.5">
            {recipes.map((recipe) => (
              <RecipeListCard key={recipe.id} recipe={recipe} locale={locale} labels={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
