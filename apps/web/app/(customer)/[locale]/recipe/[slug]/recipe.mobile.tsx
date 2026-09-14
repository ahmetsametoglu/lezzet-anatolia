'use client';

import recipeDetailMessages from '@lezzet/i18n/customer/recipe-detail';
import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { BackButton } from '@/components/customer/ui/back-button';
import { PhoneIngredientRow } from './components/phone-ingredient-row';
import { PhoneRecipeBar } from './components/phone-recipe-bar';
import { buyableItems, type RecipeViewProps } from './recipe-types';

/**
 * Tarif detayı — TELEFON görünümü: native tarif detayının (`apps/mobile/src/screens/recipe/recipe-detail-screen.tsx`)
 * web ikizi (kullanıcı kararı 14.09 — müşterinin telefon tasarımı iki yüzeyde aynı, referans native). Sıra native'inki:
 * kahraman (300'lük fotoğraf · üst degrade · yüzen ‹ · alt kenardan sarkan "süre · porsiyon" rozeti) → künye
 * (üstbaşlık · ad · açıklama) → "Malzemeler — bizden" satırları (satır ürüne, + sepete) → "Evinizden" maddeleri →
 * "Hazırlanışı" numaralı adımlar → yapışkan "Malzemeleri sepete ekle · toplam" barı. Metin ortak sözlükten
 * (`@lezzet/i18n/customer/recipe-detail`), satırın alt metni ortak kurucudan (`recipeRowMetaOf`).
 *
 * ── WEB'E ÖZGÜ KORUNANLAR ──────────────────────────────────────────────────
 * · `h1` tarifin adı; yapısal veri (`RecipeJsonLd`), paylaşım kartı ve `hreflang` `page.tsx`te.
 * · Çerçeve bu rotada başlık çizmez (fotoğraf ekranın tepesine taşar — native); ‹ geçmiş boşsa tariflere döner.
 * · Sepete ekleme web'in sepetine (`phone-ingredient-row.tsx` · `phone-recipe-bar.tsx` künyeleri).
 *
 * ── BİLİNÇLİ, KÜÇÜK FARK ───────────────────────────────────────────────────
 * · Sarkan rozetin gölgesi `shadow-price` (0 8 20, mürekkep %28); native'de bu rozet 0 6 16 çiziyor — ayrı bir durak
 *   açılmadı, iki değer telefon ekranında ayırt edilmiyor.
 */
export function RecipeMobile({ locale, recipe }: RecipeViewProps) {
  const copy = recipeDetailMessages[locale];
  // Rozet parçaları eksik veride düşer; ikisi de boşsa rozet hiç çizilmez (native).
  const badge = [recipe.duration, recipe.serves].filter((part): part is string => part !== null).join(' · ');
  const hasBar = buyableItems(recipe.items).length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {/* Kahraman içeriğin ÜSTÜNE çizilir (`z-10`) — rozet alt komşuya sarkıyor (native `zIndex`). */}
      <div className="relative z-10 h-75 flex-none">
        {recipe.image.url === null ? (
          <span aria-hidden className="grid size-full place-items-center bg-sand-300 font-serif text-h1-sm text-on-image-soft">
            {recipe.name.slice(0, 1)}
          </span>
        ) : (
          <FramedImage
            src={recipe.image.url}
            alt={recipe.name}
            ratio={RATIO_SOURCE}
            crop={recipe.image.crop}
            frames={recipe.image.frames}
            sizes="100vw"
            className="h-full w-full !rounded-none"
          />
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-b from-scrim-soft to-ink-deep/0 to-30%" />
        {/* ‹ üst güvenli alanın 8px altında (native 08.08: saate binmesin), soldan 16. */}
        <div className="absolute top-[calc(env(safe-area-inset-top)+8px)] left-4">
          <BackButton variant="photo" label={copy.back} fallback="/recipes" />
        </div>
        {badge !== '' && (
          <span className="absolute right-4.5 -bottom-4.5 rotate-3 rounded-badge bg-ink px-3.5 py-2 font-sans text-badge tracking-(--text-badge--letter-spacing) text-sand-50 shadow-price">
            {badge}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-5.5 pt-5 pb-2">
        <span className="font-sans text-eyebrow-xs text-terracotta">{copy.eyebrow}</span>
        <h1 className="font-serif text-h1-sm text-ink">{recipe.name}</h1>
        {recipe.description && <p className="font-sans text-body-sm leading-[1.6] text-body">{recipe.description}</p>}

        {recipe.items.length > 0 && (
          <>
            <h2 className="mt-2 font-sans text-eyebrow-xs text-terracotta">{copy.sections.ours}</h2>
            <ul className="flex flex-col">
              {recipe.items.map((item) => (
                <PhoneIngredientRow key={item.variantId} item={item} copy={copy} locale={locale} />
              ))}
            </ul>
          </>
        )}

        {recipe.pantry.length > 0 && (
          <>
            <h2 className="mt-1.5 font-sans text-eyebrow-xs text-terracotta">{copy.sections.pantry}</h2>
            <ul className="flex flex-col gap-1.5">
              {recipe.pantry.map((entry, index) => (
                // Evden malzemenin kimliği yok; sıra metnin kendisi.
                <li key={index} className="font-sans text-note leading-[1.4] text-body">
                  • {entry}
                </li>
              ))}
            </ul>
          </>
        )}

        {recipe.steps.length > 0 && (
          <>
            <h2 className="mt-2 font-sans text-eyebrow-xs text-terracotta">{copy.sections.steps}</h2>
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, index) => (
                // Adımların kimliği yok; numarayı ekran verir (05.16 — metin taşımaz).
                <li key={index} className="flex gap-3">
                  <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full bg-sand-150 font-sans text-note font-bold text-terracotta">
                    {index + 1}
                  </span>
                  <span className="font-sans text-note leading-[1.6] text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/* Yapışkan barın payı (native `recipeBarSpace` 108); bar yoksa pay da yok. */}
      {hasBar && <div aria-hidden className="h-27 flex-none" />}
      <PhoneRecipeBar copy={copy} locale={locale} items={recipe.items} totalCents={recipe.totalCents} />
    </div>
  );
}
