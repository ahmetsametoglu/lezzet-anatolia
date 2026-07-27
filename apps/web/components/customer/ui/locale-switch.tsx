'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@lezzet/i18n';
import { LOCALES } from '@lezzet/i18n';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Dil seçimi — başlıktaki açılır menü (K12) ve footer'daki liste (K16) AYNI parçayı kullanır.
 *
 * Her ikisi de AYNI SAYFANIN o dildeki hâline gider: `usePathname` locale'siz iç yolu verir, `Link`
 * hedef dile göre yerelleştirir (`/catalog` → `/fr/catalogue`). Dil değiştiren kullanıcı okuduğu
 * sayfada kalmalı — ana sayfaya atmak, okuduğu şeyi bulmak için kullanıcıyı yeniden gezdirir.
 *
 * DİNAMİK rotada (`/product/[slug]`) yol tek başına yetmez, segment değerleri de gerekir; bunlar
 * `useParams`'tan gelir. Slug dil-bağımsız olduğu için değer aynen taşınır — dil değiştiren müşteri
 * aynı ürünün sayfasında kalır.
 *
 * Bileşen client olmak ZORUNDA (`usePathname`), bu yüzden sunucu bileşeni olan `SiteFrame` footer'ı
 * da buradan besleniyor. Footer'da ayrı bir liste yazılmıştı ve hedefi sabit `/` idi — dil
 * değiştiren herkes ana sayfaya düşüyordu. Kopyalanan ikinci liste, kaymanın kendisiydi.
 */
const LOCALE_LABEL: Record<Locale, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/** Etkin sayfanın başka dildeki hâli. Yol + segment değerleri ayrı kaynaklardan gelir. */
function useSamePageHref() {
  const pathname = usePathname();
  const params = useParams();
  // Yol ve segment değerlerinin BİRBİRİNE ait olduğunu TypeScript doğrulayamaz: `pathname` çalışma
  // anında belli olan bir rota şablonu, `params` de ondan bağımsız gelen değerler. Etkin rotada
  // eşleşmeleri garanti olduğu için tip burada çağrı yerine değil, TEK noktada sabitlenir.
  return { pathname, params } as Parameters<typeof Link>[0]['href'];
}

interface LocaleLinksProps {
  locale: Locale;
  /** Bağlantı sınıfı çağırandan gelir: açık zeminde menü, koyu zeminde footer. */
  className: string;
  /** Seçili dilin sınıfı (menüde yeşil metin; footer'da fark yok). */
  activeClassName?: string;
  /** Verilirse bağlantılar arasına konur — footer'ın mobil satırı "Türkçe ✓ · Français · Deutsch". */
  separator?: string;
  onNavigate?: () => void;
}

/** Üç dilin bağlantı listesi — sunum çağıranın, hedef burasının işi. */
export function LocaleLinks({ locale, className, activeClassName = '', separator, onNavigate }: LocaleLinksProps) {
  const href = useSamePageHref();
  return (
    <>
      {LOCALES.map((l, i) => (
        <Fragment key={l}>
          {separator && i > 0 && <span aria-hidden>{separator}</span>}
          <Link
            href={href}
            locale={l}
            onClick={onNavigate}
            className={[className, l === locale ? activeClassName : ''].filter(Boolean).join(' ')}
          >
            {LOCALE_LABEL[l]}
            {l === locale ? ' ✓' : ''}
          </Link>
        </Fragment>
      ))}
    </>
  );
}

interface LocaleSwitchProps {
  locale: Locale;
}

/** K12 · Başlıktaki dil seçici ("TR ▾"). Açılır menü dışarı-tıklama ve Escape dinleyicisi ister. */
export function LocaleSwitch({ locale }: LocaleSwitchProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <LocaleLinks
            locale={locale}
            className="cursor-pointer px-4 py-2.5 font-sans text-body-sm text-ink transition-colors hover:bg-hover-bg"
            activeClassName="!text-olive"
            onNavigate={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
