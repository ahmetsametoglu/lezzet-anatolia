import type { ReactNode } from 'react';
import type { TextSegment } from '@lezzet/helper';
import { ALLERGEN_LABELS, NUTRITION_KEYS, resolveLocalizedText } from '@lezzet/types';
import type { Nutrition, ProductAllergen } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
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
  compact?: boolean;
  children: ReactNode;
}

function DeclarationCard({ title, note, compact = false, children }: DeclarationCardProps) {
  return (
    <section className={['flex flex-col gap-3 rounded-card border border-sand-100 bg-card', compact ? 'p-5' : 'px-7 py-6'].join(' ')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{title}</h2>
        {note && <span className="font-sans text-note text-muted">{note}</span>}
      </div>
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
  compact?: boolean;
}

export function Declaration({ t, locale, declaration, compact = false }: DeclarationProps) {
  const { ingredients, allergens, traces, nutrition, netWeightG, storage } = declaration;
  const hasIngredientsBlock = ingredients !== null || allergens.length > 0 || traces.length > 0;

  return (
    <div className="flex flex-col gap-5.5">
      {hasIngredientsBlock && (
        <DeclarationCard title={t.declaration.ingredients} compact={compact}>
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
          note={[t.declaration.per100g, netWeightG ? t.declaration.netWeight.replace('{weight}', `${netWeightG} g`) : null].filter(Boolean).join(' · ')}
          compact={compact}
        >
          {/* Satır sırası INCO'nun beyan sırasıdır ve TEK KAYNAKTAN gelir (`NUTRITION_KEYS`) —
              operasyon formu ile müşteri tablosu aynı sırayı izler. Girilmemiş kalem satır açmaz. */}
          <dl className="flex flex-col">
            {NUTRITION_KEYS.filter((k) => nutrition[k] !== null).map((k) => (
              <div key={k} className="flex justify-between border-b border-sand-100 py-2 font-sans text-body-sm text-ink last:border-b-0">
                <dt>{t.nutrition[k]}</dt>
                <dd className="font-bold">{formatNutrition(k, nutrition[k])}</dd>
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

/** Enerji birimsiz (başlıkta yazar), kalanı gram. Alan adındaki `G` soneki birimin tek kaynağıdır. */
function formatNutrition(key: keyof Nutrition, value: number | null): string {
  if (value === null) return '';
  return key.endsWith('G') ? `${value} g` : String(value);
}
