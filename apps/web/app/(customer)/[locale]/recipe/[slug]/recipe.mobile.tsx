'use client';

import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { AddAllBar } from './components/add-all-bar';
import { IngredientRow } from './components/ingredient-row';
import type { RecipeViewProps } from './recipe-types';

/**
 * Tarif detayı — mobil web düzeni (tasarım: `Musteri - Tarifler.dc.html`, "Tarif Detay Mobil").
 *
 * Cihaz forku, responsive DEĞİL (`CLAUDE §2`). Fark yalnız sütun sayısı değil, SIRA ve BİÇİM:
 *
 *  · Künye rozetleri kart yerine **fotoğrafın üstünde tek şeride** iniyor (süre · porsiyon · öğün).
 *  · "Evinizden" madde listesi **tek satıra** düşüyor (`mısır unu, tereyağı, sıcak su`) — dar
 *    ekranda üç madde üç satır demek ve hazırlanışı katlamanın altına itiyor. Bunlar bizim
 *    ürünümüz değil; okunması gereken ama karar gerektirmeyen bir bilgi.
 *  · Malzemeler hazırlanıştan ÖNCE geliyor: mobilde satın alma kararı önce, okuma sonra.
 *  · Toplam + "Tümünü sepete ekle" sayfanın DİBİNDE tek satırlık bir kart.
 *
 * `md:` ile tek dosyada kurulsaydı bu dört farkın hiçbiri yazılamazdı — akışkan bir düzen aynı
 * sırayı korur, yalnız daraltır.
 */
export function RecipeMobile({ t, locale, recipe }: RecipeViewProps) {
  const badge = [recipe.duration, recipe.serves, recipe.meal].filter(Boolean).join(' · ');
  const pantryLine = recipe.pantry.join(', ');

  return (
    <div className="flex flex-col">
      <div className="relative">
        <FramedImage src={recipe.image.url} alt={recipe.name} ratio={RATIO_BAND} crop={recipe.image.crop} className="!rounded-none" />
        {badge && (
          <span className="pointer-events-none absolute bottom-2.5 left-3 rounded-soft bg-cream/95 px-2.5 py-1.5 font-sans text-micro font-bold text-ink">
            {badge}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-6">
        {recipe.description && <p className="font-sans text-body-sm leading-relaxed text-body">{recipe.description}</p>}

        {recipe.items.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-card-title-sm text-ink">{t.ingredients}</h2>
            {recipe.items.map((item) => (
              <IngredientRow key={item.variantId} item={item} locale={locale} t={t} compact />
            ))}
            {pantryLine && (
              <span className="font-sans text-note leading-relaxed text-body">
                <strong className="text-ink">{t.pantryInline}</strong> {pantryLine}
              </span>
            )}
          </div>
        )}

        {/* Malzemesi olmayan tarifte "Evinizden" satırı yalnız kalır ve yeri yukarısı değil: orada
            malzeme bloğunun içinde duruyor. Kendi başına kaldığında kendi satırını alır. */}
        {recipe.items.length === 0 && pantryLine && (
          <span className="font-sans text-note leading-relaxed text-body">
            <strong className="text-ink">{t.pantryInline}</strong> {pantryLine}
          </span>
        )}

        {recipe.steps.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h2 className="font-serif text-card-title-sm text-ink">{t.steps}</h2>
            <ol className="flex flex-col gap-2.5">
              {recipe.steps.map((step, index) => (
                // Anahtar indisten — gerekçe masaüstü dalında (adımların kimliği yok).
                <li key={index} className="flex gap-2.5">
                  <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-cream-deep font-sans text-note font-bold text-terracotta">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 font-sans text-note leading-relaxed text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {recipe.items.length > 0 && (
          <AddAllBar items={recipe.items} totalCents={recipe.totalCents} locale={locale} t={t} compact />
        )}
      </div>
    </div>
  );
}
