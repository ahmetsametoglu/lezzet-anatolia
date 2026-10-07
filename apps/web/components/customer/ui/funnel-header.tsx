'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { BackButton } from './back-button';

/**
 * Huni ve eylemsiz bölüm sayfalarının telefon başlığı; büyük başlık içerikle akar, ekrandan çıkınca yapışkan satırda kompakt adı
 * belirir ki aynı kelime ekranda iki kez durmasın. Checkout'un çip şeridi barın altına `BAR_HEIGHT` ile yapışır, bar boyu değişirse
 * ikisi birlikte değişmeli.
 */
interface FunnelHeaderProps {
  /** Geri ikonunun ekran okuyucu adı ("Geri" / "Retour" / "Zurück"). */
  backLabel: string;
  /** Tarayıcı geçmişi boşken gidilecek yer (`BackButton` sözleşmesi). */
  fallback: ComponentProps<typeof BackButton>['fallback'];
  /** Başlığın üstündeki küçük bağlam satırı — verilmezse çizilmez. */
  eyebrow?: string;
  title: string;
  /** Barın sağ ucu — detayda sepet rozeti, hesapta ekran aksiyonu ("Çıkış" vb.). */
  right?: ReactNode;
}

/** Yapışkan barın yüksekliği (px) — gözlemcinin "başlık barın altına girdi mi" eşiği. */
const BAR_HEIGHT = 52;

export function FunnelHeader({ backLabel, fallback, eyebrow, title, right }: FunnelHeaderProps) {
  const heroRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(entry ? !entry.isIntersecting : false), {
      // Üst kenar bar kadar içeri çekilir: başlık bar'ın ALTINA girdiği anda "görünmez" sayılır.
      rootMargin: `-${BAR_HEIGHT}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Ebeveyn pedsiz ve sayfa boyu olmalı: `sticky` en yakın kaydırılan atası boyunca yapışır, dar sarmalayıcı bitince bar da akıp
    // gider. Fragment döner ki bar kök konteynerin doğrudan çocuğu olsun.
    <>
      <div className="sticky top-0 z-20 flex items-center gap-1.5 bg-sand-50/96 px-4 py-1.5 backdrop-blur-sm">
        {/* Daire sayfa dolgusuna taşar: glif başlığın sol kenarıyla hizalı (native `backRow` −16). */}
        <span className="-ml-4 flex flex-none">
          <BackButton label={backLabel} fallback={fallback} />
        </span>
        <span
          aria-hidden={!collapsed}
          className={[
            'min-w-0 flex-1 truncate font-serif text-screen-title text-ink transition-opacity duration-150',
            collapsed ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          {title}
        </span>
        {right && <div className="flex flex-none items-center gap-3.5">{right}</div>}
      </div>
      <div className="flex flex-col gap-1 px-4 pt-1">
        {eyebrow && <span className="font-sans text-eyebrow-xs text-terracotta-dark uppercase">{eyebrow}</span>}
        <h1 ref={heroRef} className="font-serif text-page-title-sm text-ink">
          {title}
        </h1>
      </div>
    </>
  );
}
