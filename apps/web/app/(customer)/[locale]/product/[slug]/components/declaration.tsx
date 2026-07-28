import type { ReactNode } from 'react';
import type { TextSegment } from '@lezzet/helper';
import { ALLERGEN_LABELS, resolveLocalizedText } from '@lezzet/types';
import type { Nutrition, ProductAllergen } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { formatDecimal } from '@/lib/storefront/format';
import type { StorefrontDeclaration } from '@/lib/storefront/storefront-types';
import type { Messages } from '../product-types';

/**
 * Yasal beyan bölümleri (INCO) — içindekiler + alerjenler · besin değerleri · saklama.
 *
 * Bu bölümler bir "detay" değil, uzaktan satışın ÖNKOŞULU: satın alma öncesi erişilebilir olmak
 * zorundalar. Bu yüzden satın alma butonundan önce DOM'da bulunurlar; mobilde akordeon olsalar bile
 * başlıkları kapalıyken görünür (`musteri-urun-detay.md §7`).
 *
 * Boş bölüm çizilmez: beyanı girilmemiş ürün "beyan var ama boş" izlenimi vermemeli.
 */

/** Operatörün `**vurgu**` işareti — alerjen kelimesini metin içinde öne çıkarır (`helper/rich-text`). */
function Emphasized({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((s, i) => (s.strong ? <strong key={i} className="font-bold text-ink">{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

interface DeclarationCardProps {
  title: string;
  /** Başlığın sağındaki not (besin tablosunda "100 g için · Net ağırlık: 700 g"). */
  note?: string;
  /** Başlığın yanındaki uyarı işareti — alerjen taşıyan bölüm kapalıyken de fark edilsin. */
  warn?: boolean;
  compact?: boolean;
  children: ReactNode;
}

/**
 * Beyan bölümü. MASAÜSTÜNDE açık kart, MOBİLDE akordeon (`<details>`) — tasarımın kararı: dar
 * ekranda üç uzun beyan, satın alma çubuğunu ekranlarca aşağı iter.
 *
 * `<details>` bilinçli: yerli öğe, klavyeyle çalışır, JavaScript istemez ve **kapalıyken de içerik
 * DOM'da durur**. INCO gereği beyanın satın alma öncesi erişilebilir olması gerekiyor; içeriği
 * koşullu render eden bir akordeon bunu bozardı. Başlıklar kapalıyken de görünür.
 */
function DeclarationCard({ title, note, warn = false, compact = false, children }: DeclarationCardProps) {
  const heading = (
    <>
      <span className="flex items-baseline gap-2">
        <h2 className={['font-serif text-ink', compact ? 'text-body font-bold' : 'text-card-title'].join(' ')}>{title}</h2>
        {warn && <span className="font-sans text-note text-terracotta">⚠</span>}
      </span>
      {note && <span className="font-sans text-note text-muted">{note}</span>}
    </>
  );

  if (compact) {
    return (
      <details className="group rounded-soft border border-sand-200 bg-card px-4 [&[open]]:pb-3.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-1 items-baseline justify-between gap-3">{heading}</span>
          <span className="font-sans text-note text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="flex flex-col gap-2.5">{children}</div>
      </details>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-sand-100 bg-card px-7 py-6">
      <div className="flex items-baseline justify-between gap-3">{heading}</div>
      {children}
    </section>
  );
}

/** Alerjen listesini dile göre çözüp virgülle birleştirir — çapraz bulaşma cümlesi bundan kurulur. */
function allergenNames(codes: ProductAllergen[], locale: Locale): string {
  return codes.map((c) => resolveLocalizedText(ALLERGEN_LABELS[c], locale)).join(', ');
}

interface DeclarationProps {
  t: Messages;
  locale: Locale;
  declaration: StorefrontDeclaration;
  /**
   * SEÇİLİ boyun net ağırlığı — beyanın kendisi 100 g üzerinden sabittir ve ürüne aittir, ama
   * paketin ağırlığı boya göre değişir. Sabit kalsaydı 1 kg'lık boyu seçen müşteri tabloda hâlâ
   * "Net ağırlık: 700 g" görürdü.
   */
  netWeightG: number | null;
  compact?: boolean;
}

export function Declaration({ t, locale, declaration, netWeightG, compact = false }: DeclarationProps) {
  const { ingredients, allergens, traces, nutrition, storage } = declaration;
  const hasIngredientsBlock = ingredients !== null || allergens.length > 0 || traces.length > 0;

  return (
    <div className={['flex flex-col', compact ? 'gap-2' : 'gap-5.5'].join(' ')}>
      {hasIngredientsBlock && (
        <DeclarationCard title={t.declaration.ingredients} warn={allergens.length > 0} compact={compact}>
          {ingredients && (
            <p className="font-sans text-body-sm leading-relaxed text-body">
              <Emphasized segments={ingredients} />
            </p>
          )}
          {allergens.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allergens.map((a) => (
                <span key={a} className="w-max rounded-soft bg-terracotta-bg px-3.5 py-1.5 font-sans text-note font-bold text-terracotta">
                  ⚠ {resolveLocalizedText(ALLERGEN_LABELS[a], locale)}
                </span>
              ))}
            </div>
          )}
          {/* Çapraz bulaşma cümlesi ŞABLONDAN kurulur — serbest metin saklanmaz, dil tutarlı kalır. */}
          {traces.length > 0 && (
            <span className="font-sans text-note text-muted">{t.declaration.traces.replace('{list}', allergenNames(traces, locale))}</span>
          )}
        </DeclarationCard>
      )}

      {nutrition && (
        <DeclarationCard
          title={t.declaration.nutrition}
          // Net ağırlık da DİLE göre biçimlenir: 1500 g Türkçe/Fransızca'da binlik ayracı ister.
          // Ham şablon değişkeni tablonun içindeki sayılarla tutarsız kalıyordu.
          note={[t.declaration.per100g, netWeightG ? t.declaration.netWeight.replace('{weight}', gram(netWeightG, locale)) : null]
            .filter(Boolean)
            .join(' · ')}
          compact={compact}
        >
          <dl className="flex flex-col">
            {nutritionRows(nutrition, t, locale).map((row) => (
              <div key={row.label} className="flex justify-between gap-4 border-b border-sand-100 py-2 font-sans text-body-sm text-ink last:border-b-0">
                <dt>{row.label}</dt>
                <dd className="text-right font-bold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </DeclarationCard>
      )}

      {storage && (
        <DeclarationCard title={t.declaration.storage} compact={compact}>
          <p className="font-sans text-body-sm leading-relaxed text-body">
            <Emphasized segments={storage} />
          </p>
        </DeclarationCard>
      )}
    </div>
  );
}

/**
 * Besin tablosu satırları — beyanın SEKİZ kalemi BEŞ satıra iner (tasarım: `Musteri - Urun Detay`).
 *
 * İki enerji birimi tek satırda ("1932 kJ / 462 kcal"), alt kalemler ana kalemin yanında parantezde
 * ("Yağ (doymuş) — 24 g (9 g)"). Sekiz ayrı satır beyanı eksiksiz gösteriyordu ama tabloyu bir
 * mevzuat çıktısına çeviriyordu; müşterinin okuduğu şey bir etiket, bir form değil.
 *
 * Hiçbir değer KAYBOLMAZ: ana kalem girilmemişse alt kalem kendi satırında, kendi adıyla görünür —
 * beyan edilmiş bir değeri gizlemek, sadeleştirme değil eksiltmedir.
 */
interface NutritionRow {
  label: string;
  value: string;
}

/**
 * Gram değeri. Basamak sayısı INCO'nun yuvarlama kılavuzunu izler: 10 g ve üstü tam sayı, altı tek
 * ondalık; TUZ ayrıksıdır — 1 g'ın altında iki ondalıkla yazılır ("0,10 g"), çünkü orada üçüncü
 * hane tüketicinin günlük alımını değerlendirmesini değiştirir.
 */
function gram(value: number, locale: Locale, isSalt = false): string {
  const digits = isSalt && value < 1 ? 2 : Number.isInteger(value) ? 0 : 1;
  return `${formatDecimal(value, locale, digits)} g`;
}

/** Ana kalem + parantezdeki alt kalem; ana kalem yoksa alt kalem kendi adıyla tek başına durur. */
function nutrientPair(
  main: number | null,
  sub: number | null,
  labels: { main: string; withSub: string; subAlone: string },
  locale: Locale,
): NutritionRow | null {
  if (main !== null && sub !== null) {
    return { label: labels.withSub, value: `${gram(main, locale)} (${gram(sub, locale)})` };
  }
  if (main !== null) return { label: labels.main, value: gram(main, locale) };
  if (sub !== null) return { label: labels.subAlone, value: gram(sub, locale) };
  return null;
}

function nutritionRows(n: Nutrition, t: Messages, locale: Locale): NutritionRow[] {
  const energy = [
    n.energyKj !== null ? `${formatDecimal(n.energyKj, locale, 0)} kJ` : null,
    n.energyKcal !== null ? `${formatDecimal(n.energyKcal, locale, 0)} kcal` : null,
  ].filter(Boolean);

  return [
    energy.length > 0 ? { label: t.nutrition.energy, value: energy.join(' / ') } : null,
    nutrientPair(n.fatG, n.saturatedFatG, { main: t.nutrition.fat, withSub: t.nutrition.fatSat, subAlone: t.nutrition.saturated }, locale),
    nutrientPair(
      n.carbohydrateG,
      n.sugarsG,
      { main: t.nutrition.carbohydrate, withSub: t.nutrition.carbSugar, subAlone: t.nutrition.sugars },
      locale,
    ),
    n.proteinG !== null ? { label: t.nutrition.protein, value: gram(n.proteinG, locale) } : null,
    n.saltG !== null ? { label: t.nutrition.salt, value: gram(n.saltG, locale, true) } : null,
  ].filter((row): row is NutritionRow => row !== null);
}
