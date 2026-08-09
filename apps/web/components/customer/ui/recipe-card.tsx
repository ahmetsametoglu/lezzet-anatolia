import { RATIO_BAND, RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontRecipe } from '@/lib/storefront/storefront-types';

/**
 * **Tarif kartı** — "Sofradan Fikirler" listesinin tek yapı taşı (08.24, tasarım:
 * `Musteri - Tarifler.dc.html`).
 *
 * **Kartın TAMAMI bağlantıdır** ve detaya gider; listede "sepete ekle" YOKTUR — ve bu paket
 * kartıyla aynı gerekçe değil: pakette karar detayda verilir çünkü içeriği görülmeden 50 €'luk bir
 * sofra alınmamalı. Tarifte ise listeden eklenecek TEK bir şey yok — tarif bir satış birimi değil,
 * birkaç ayrı ürünün anlatısı. "Hepsini ekle" ancak hangi malzemelerin alınabilir olduğu
 * görüldükten sonra anlam taşır.
 *
 * ── ÇERÇEVE ORANI: TASARIMDAN SAPMA, BİLİNÇLİ ───────────────────────────────
 * Tasarım masaüstünde 16/10, mobil webde 16/9 çiziyor. Envanterde 16/10 YOK
 * (`RATIO_SOURCE` 3/2 · `RATIO_BAND` 16/9) ve yeni bir oran açmak yalnız bu kart için operatörün
 * odak panelinde karşılığı olmayan bir çerçeve doğururdu — kırpma künyesi her görselde o çerçeveye
 * göre ayarlanıyor. 3/2 (1,50) ile 16/10 (1,60) arasındaki fark kırpmayla kapanır; mobilde tasarım
 * zaten envanterdeki 16/9'u istiyor, o birebir kullanılıyor.
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
 * **Ana sayfa tarif kartı** — "Sofradan Fikirler" şeridi (tasarım 09.08: `Musteri - Anasayfa.dc.html`).
 *
 * Liste kartının varyantı DEĞİL, kardeşi — ve bu bir tercih değil, tasarımın kendi ayrımı: burada
 * kart kabuğu yok (çerçevesiz, zeminsiz), rozet yok, düğme yok. Ortak olan yalnız veri tipi ve
 * hedef. Liste kartına üçüncü bir `variant` bayrağı eklemek, gövdesinin yarısını koşula sarardı;
 * iki ayrı sunum iki ayrı bileşendir, aynı DOSYADA durmaları da bunu söylüyor.
 *
 * **Künye sözcükleri de tasarımda AYRI:** şeritte *"1 malzeme + evinizden 3"*, listede *"1 ürün +
 * 3 ev malzemesi"*. Aynı sayıların iki farklı cümlesi — metin anahtarları bu yüzden paylaşılmadı.
 *
 * **Fiyat YOK ve bu tasarımın kararı:** şerit bir davet, vitrin değil. Tükendiğinde de sayı yerine
 * tek cümle kalır — alınamayan bir tarifte malzeme sayısı saymak yanlış bir söz olurdu.
 *
 * Çerçeve 3/2: tasarım 4/3 çiziyor ama envanterde o oran yok (`RATIO_SOURCE` 3/2 · `RATIO_BAND`
 * 16/9 · `RATIO_SQUARE` 1) ve yalnız bu kart için yeni bir oran açmak, operatörün kırpma panelinde
 * karşılığı olmayan bir çerçeve doğururdu — liste kartının 16/10 için verdiği kararın aynısı.
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
      <FramedImage src={recipe.image.url} alt={recipe.name} ratio={RATIO_SOURCE} crop={recipe.image.crop} />
      <div className="flex flex-col gap-0.5">
        <span className="font-serif text-h2-sm text-ink">{recipe.name}</span>
        <span className="font-sans text-note text-muted">{meta}</span>
        {/* Çağrı kartın İÇİNDE bir bağ değil, kartın kendi bağının etiketi — kart zaten tıklanabilir.
            Bağ içinde bağ erişilebilirlikte geçersiz (liste kartıyla aynı karar). */}
        <span className="mt-0.5 font-sans text-note font-bold text-olive transition-colors group-hover:text-olive-dark">
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
          <span className="font-sans text-note font-semibold text-muted">
            {/* Künye: kaç ürünümüz + kaç ev malzemesi + toplam. Ev malzemesi sayısı YALNIZ masaüstünde
                (tasarım): dar kartta satır sarıp fiyatı aşağı itiyor. Tükendiğinde sayı yerine tek
                cümle kalır — alınamayan bir tarifte "1 ürün · 6,40 €" yazmak yanlış bir söz olurdu. */}
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
