'use client';

import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { AddAllBar } from './components/add-all-bar';
import { IngredientRow } from './components/ingredient-row';
import type { RecipeViewProps } from './recipe-types';

/**
 * Tarif detayı — masaüstü düzeni (tasarım: `Musteri - Tarifler.dc.html`, "Tarif detayı").
 *
 * İki sütun: solda **fotoğraf + hazırlanış**, sağda **yapışkan malzeme kartı**. Yapışkanlık
 * tasarımın kararı ve gerekçesi akış: adımları okurken sayfa uzuyor, malzeme kartı ekrandan
 * çıkarsa "tümünü sepete ekle" ancak başa dönülerek bulunur.
 *
 * ── ZEMİN RENGİ ÇİZİMDEN ALINMADI ───────────────────────────────────────────
 * `.dc.html`'de detay bloğu krem-koyu bir bant üstünde duruyor — ama orada liste ve detay AYNI
 * tuvale alt alta çizilmiş ve bant ikisini AYIRIYOR. Gerçekte bu ayrı bir sayfa; site zemini
 * (krem) korunuyor, ayırmaya gerek yok (`CLAUDE §3`: dış çerçeve canvas chrome'dur, UI değil).
 */
export function RecipeDesktop({ t, locale, recipe }: RecipeViewProps) {
  const badges = [recipe.duration, recipe.serves].filter((value): value is string => Boolean(value));

  return (
    <div className="flex flex-col gap-6 px-12 pt-5 pb-11">
      {/* Breadcrumb — tasarım (09.08): "Tarifler › Künefe Sofrası". Mobilde YOK ve gerekmiyor:
          orada kabuğun kendi başlık çubuğu "← Tarifler" bağını zaten taşıyor (`SiteFrame back`).
          **Ayırıcı `›` ve bu tasarımın seçimi:** ürün ve paket detayları `·` kullanıyor (kodda da
          öyle). Üç sayfada iki ayırıcı bir tutarsızlıktır ama çizim burada `›` diyor ve improvise
          etmiyoruz (`CLAUDE §3`); birleştirme kararı tasarım tarafının, `design/BACKLOG`'a yazıldı. */}
      <nav className="flex gap-1.5 font-sans text-body-sm text-muted">
        <Link href="/recipes" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        <span>› {recipe.name}</span>
      </nav>

      <div className="flex flex-col gap-1">
        <span className="font-sans text-eyebrow-sm text-olive uppercase">{t.eyebrow}</span>
        <h1 className="font-serif text-h2 text-ink">{recipe.name}</h1>
        {recipe.description && <p className="mt-1.5 max-w-[620px] font-sans text-lead text-body">{recipe.description}</p>}
      </div>

      <div className="grid grid-cols-[1.1fr_1fr] items-start gap-9">
        <div className="flex flex-col gap-5.5">
          <FramedImage src={recipe.image.url} alt={recipe.name} ratio={RATIO_SOURCE} crop={recipe.image.crop} />

          {/* Hazırlanış bölümü adım YOKSA hiç çizilmez: boş bir başlık, yazılmamış bir tarifi
              yazılmış gibi gösterir. Tarif yine okunur — malzeme kartı sağda duruyor. */}
          {recipe.steps.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <h2 className="font-serif text-h2-sm text-ink">{t.steps}</h2>
              <ol className="flex flex-col gap-3.5">
                {recipe.steps.map((step, index) => (
                  // Anahtar İNDİSTEN: adımlar metnin satırları, kimlikleri yok ve iki adım birebir
                  // aynı cümle olabilir. Liste yeniden sıralanmıyor, yalnız baştan çiziliyor.
                  <li key={index} className="flex gap-3.5">
                    <span className="flex size-[30px] flex-none items-center justify-center rounded-full border border-sand-200 bg-card font-sans text-body-sm font-bold text-terracotta">
                      {index + 1}
                    </span>
                    <span className="pt-1 font-sans text-body leading-relaxed text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <aside className="sticky top-5 flex flex-col gap-4 rounded-card border border-sand-200 bg-card p-6">
          {(badges.length > 0 || recipe.meal) && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span key={badge} className="rounded-soft bg-olive-bg px-3 py-1.5 font-sans text-micro font-bold text-olive-dark">
                  {badge}
                </span>
              ))}
              {/* Öğün AYRI RENKTE (tasarım): süre ve porsiyon tarifin ölçüsü, öğün ise ne zaman
                  yeneceği — farklı bir soruya cevap veriyor. */}
              {recipe.meal && (
                <span className="rounded-soft bg-terracotta-bg px-3 py-1.5 font-sans text-micro font-bold text-terracotta">
                  {recipe.meal}
                </span>
              )}
            </div>
          )}

          {/* Malzemesi girilmemiş tarifte blok HİÇ çizilmez ve bu bir hata hâli değil: tarif
              okunabilir bir içerik, sepet bloğu ise ancak bağlanacak ürün varsa anlam taşır
              (`RecipeItemService.syncItems` künyesi aynı kararı veriyor). */}
          {recipe.items.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h2 className="font-serif text-card-title-sm text-ink">{t.ingredients}</h2>
              {recipe.items.map((item) => (
                <IngredientRow key={item.variantId} item={item} locale={locale} t={t} />
              ))}
            </div>
          )}

          {recipe.pantry.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-card-title-sm text-ink">{t.pantry}</h2>
              <ul className="flex flex-col gap-1">
                {recipe.pantry.map((line) => (
                  <li key={line} className="font-sans text-body-sm leading-relaxed text-body">
                    • {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.items.length > 0 && (
            <AddAllBar items={recipe.items} totalCents={recipe.totalCents} locale={locale} t={t} />
          )}
        </aside>
      </div>
    </div>
  );
}
