'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@lezzet/i18n';
import { LOCALES } from '@lezzet/i18n';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Başlıktaki dil seçici ("TR ▾"). Client bileşen: açılır menü dışarı-tıklama ve Escape dinleyicisi
 * ister (K18 sıralama seçicisiyle aynı gerekçe).
 *
 * Seçenekler AYNI SAYFANIN o dildeki hâline gider — `usePathname` locale'siz iç yolu verir, `Link`
 * hedef dile göre yerelleştirir (`/catalog` → `/fr/catalogue`). Ana sayfaya atmaz: dil değiştiren
 * kullanıcı okuduğu sayfada kalmalı.
 *
 * DİNAMİK rotada (`/product/[slug]`) yol tek başına yetmez, segment değerleri de gerekir; bunlar
 * `useParams`'tan gelir. Slug dil-bağımsız olduğu için değer aynen taşınır — dil değiştiren müşteri
 * aynı ürünün sayfasında kalır.
 */
const LOCALE_LABEL: Record<Locale, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

interface LocaleSwitchProps {
  locale: Locale;
}

export function LocaleSwitch({ locale }: LocaleSwitchProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useParams();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer font-sans text-body-sm font-semibold text-muted uppercase transition-colors hover:text-ink"
      >
        {locale} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 flex min-w-36 flex-col overflow-hidden rounded-soft border border-sand-200 bg-card">
          {LOCALES.map((l) => (
            <Link
              key={l}
              // Yol ve segment değerleri ayrı kaynaklardan gelir; TypeScript ikisinin BİRBİRİNE ait
              // olduğunu doğrulayamaz (rota şablonu çalışma anında belli). Etkin rotada eşleşmeleri
              // garanti olduğu için denetim burada bilinçli olarak susturulur.
              // @ts-expect-error -- pathname ↔ params eşleşmesi çalışma anında garanti
              href={{ pathname, params }}
              locale={l}
              onClick={() => setOpen(false)}
              className={[
                'cursor-pointer px-4 py-2.5 font-sans text-body-sm transition-colors hover:bg-hover-bg',
                l === locale ? 'text-olive' : 'text-ink',
              ].join(' ')}
            >
              {LOCALE_LABEL[l]}
              {l === locale ? ' ✓' : ''}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
