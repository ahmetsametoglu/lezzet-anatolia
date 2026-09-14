import type { ReactNode } from 'react';
import type { TextSegment } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type productMessages from '@lezzet/i18n/customer/product';
import { NUTRITION_KEYS, type Nutrition } from '@lezzet/types';
import type { StorefrontDeclaration } from '@lezzet/application';
import { formatDecimal } from '@/lib/storefront/format';
import { allergenNames, gram } from './declaration';

/*
  BEYAN AKORDEONLARI — native ürün detayının üç akordeonunun (`product-detail-screen.tsx`, v3:281-288) web
  telefon ikizi (14.09): üstte ve altta düz mürekkep çizgi, aralarda kesik kum; başlık `note` kalın, sağda ▾.
  İçerik native'in dilinde: içindekiler + TEK satır alerjen (terracotta) + çapraz bulaşma cümlesi · "100 g
  için: …" tek satırı + net ağırlık · saklama.

  ── WEB'E ÖZGÜ: `<details>` ─────────────────────────────────────────────────────
  INCO beyanı satın alma ÖNCESİ erişilebilir olmalı: `<details>` kapalıyken de içeriği sayfada tutar (arama
  motoru ve ekran okuyucu okur), klavyeyle çalışır, JavaScript istemez — masaüstü beyanının aynı kararı
  (`declaration.tsx`). Native içeriği yalnız açıkken çiziyor; ekranda görünen aynı.

  Sayılar dile göre biçimlenir ve INCO'nun yuvarlama kılavuzunu izler (`gram` — masaüstü tablosuyla aynı
  kural): native ham sayı yazıyor ("0.5"), Fransız müşteri "0,5" okumalı.
*/

type ProductCopy = LocalizedCopy<typeof productMessages>;

/** Operatörün `**vurgu**` işareti — alerjen kelimesi metnin içinde kalın (`helper/rich-text`). */
function Segments({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? (
          <strong key={index} className="font-bold">
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * "100 g için" satırının parçaları — native'in tek satırı (`nutritionLine`): dolu kalemler INCO sırasıyla
 * (`NUTRITION_KEYS`), enerji iki birimi tek kalemde taşır (aynı şeyin iki ölçümü iki kalem gibi okunmasın).
 */
function nutritionLine(nutrition: Nutrition, t: ProductCopy['nutrition'], locale: Locale): string {
  const parts: string[] = [];
  if (nutrition.energyKj !== null || nutrition.energyKcal !== null) {
    const units = [
      nutrition.energyKj === null ? null : `${formatDecimal(nutrition.energyKj, locale, 0)} kJ`,
      nutrition.energyKcal === null ? null : `${formatDecimal(nutrition.energyKcal, locale, 0)} kcal`,
    ].filter((unit) => unit !== null);
    parts.push(`${t.energy} ${units.join(' / ')}`);
  }
  const labels: Partial<Record<keyof Nutrition, string>> = {
    fatG: t.fat,
    saturatedFatG: t.saturatedFat,
    carbohydrateG: t.carbohydrate,
    sugarsG: t.sugars,
    proteinG: t.protein,
    saltG: t.salt,
  };
  for (const key of NUTRITION_KEYS) {
    const label = labels[key];
    const value = nutrition[key];
    if (label === undefined || value === null) continue;
    parts.push(`${label} ${gram(value, locale, key === 'saltG')}`);
  }
  return parts.join(' · ');
}

interface AccordionProps {
  title: string;
  /** İlk bölüm dışındakilerin üstünde kesik kum çizgi (native `accordionDivided`). */
  divided: boolean;
  children: ReactNode;
}

function Accordion({ title, divided, children }: AccordionProps) {
  return (
    <details className={['group', divided ? 'border-t-[1.5px] border-dashed border-sand-400' : ''].filter(Boolean).join(' ')}>
      <summary className="flex cursor-pointer list-none items-center justify-between p-2.5 [&::-webkit-details-marker]:hidden">
        <span className="font-sans text-note font-bold text-ink">{title}</span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-1 px-2.5 pb-2.5">{children}</div>
    </details>
  );
}

interface PhoneDeclarationProps {
  copy: ProductCopy;
  locale: Locale;
  declaration: StorefrontDeclaration;
  /** SEÇİLİ boyun net ağırlığı — beyan 100 g üzerinden sabit, paketin ağırlığı boya göre değişir. */
  netWeightG: number | null;
}

export function PhoneDeclaration({ copy, locale, declaration, netWeightG }: PhoneDeclarationProps) {
  const text = 'font-sans text-note leading-[1.6] text-body';
  return (
    <div className="mx-3 my-1 border-y-[1.5px] border-ink">
      <Accordion title={copy.accordion.ingredients} divided={false}>
        {declaration.ingredients !== null && (
          <p className={text}>
            <Segments segments={declaration.ingredients} />
          </p>
        )}
        {declaration.allergens.length > 0 && (
          <p className="font-sans text-body-sm font-bold text-terracotta">
            {copy.accordion.allergens.replace('{list}', allergenNames(declaration.allergens, locale))}
          </p>
        )}
        {declaration.traces.length > 0 && <p className={text}>{copy.accordion.traces.replace('{list}', allergenNames(declaration.traces, locale))}</p>}
      </Accordion>
      <Accordion title={copy.accordion.nutrition} divided>
        {declaration.nutrition !== null && (
          <p className={text}>{copy.accordion.per100.replace('{rows}', nutritionLine(declaration.nutrition, copy.nutrition, locale))}</p>
        )}
        {netWeightG !== null && (
          <p className="font-sans text-micro font-semibold text-ink">{copy.accordion.netWeight.replace('{grams}', formatDecimal(netWeightG, locale, 0))}</p>
        )}
      </Accordion>
      <Accordion title={copy.accordion.storage} divided>
        {declaration.storage !== null && (
          <p className={text}>
            <Segments segments={declaration.storage} />
          </p>
        )}
      </Accordion>
    </div>
  );
}
