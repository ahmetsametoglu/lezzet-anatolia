import { POINTS_SPARK_PATH } from '@lezzet/design-tokens/icons';
import type { Locale } from '@lezzet/i18n';
import awardMessages from '@lezzet/i18n/customer/points-award';

/*
  Puan kazanımının sonucu, native kitin `PointsAward` ikizi: kazanılanı ve toplamı her kazanma anında aynı biçimde söyler. Yolda
  yazım varken sayı yerine bekleme cümlesi çizilir, çünkü eksik toplam tam gibi okunurdu.
*/

interface PointsSparkProps {
  /** Kenar uzunluğu (px). */
  size: number;
  className?: string;
}

/** Kazanma anının dolu yıldızı; renk `currentColor`dan, çağıran metin rengiyle verir. */
export function PointsSpark({ size, className }: PointsSparkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d={POINTS_SPARK_PATH} fill="currentColor" />
    </svg>
  );
}

interface PointsAwardProps {
  locale: Locale;
  /** Yazılan puan; `null` ya da sıfır = ödülün sahibi yok ya da motor yazmadı, blok çizilmez. */
  points: number | null;
  /** Güncel bakiye; `null` = bilinmiyor, toplam satırı çizilmez. */
  balance: number | null;
  settling?: boolean;
  /** Tasarımın eğik kum kartı (değerlendirmenin sonu); varsayılan kutusuz küme (keşif turunun bitişi). */
  framed?: boolean;
}

export function PointsAward({ locale, points, balance, settling = false, framed = false }: PointsAwardProps) {
  const t = awardMessages[locale];

  if (settling) {
    return <p className="mt-2.5 text-center font-sans text-field-label text-body">{t.settling}</p>;
  }
  if (points === null || points <= 0) return null;

  return (
    <div
      className={[
        'flex flex-col items-center gap-1',
        framed ? 'my-1.5 -rotate-2 rounded-card bg-sand-150 px-7.5 py-4.5 shadow-hard' : 'mt-2.5',
      ].join(' ')}
    >
      <span className="font-serif text-h1-sm text-terracotta">{t.points.replace('{points}', String(points))}</span>
      <span className="font-sans text-field-label text-body">{t.note}</span>
      {balance !== null && (
        <span className="mt-0.5 rotate-2 rounded-badge bg-olive px-3.5 py-1.5 font-sans text-badge tracking-normal text-card">
          {t.total.replace('{points}', String(balance))}
        </span>
      )}
    </div>
  );
}
