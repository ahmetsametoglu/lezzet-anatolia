'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { BackButton } from './back-button';

/**
 * Huni sayfalarının (sepet · checkout) mobil başlığı (kullanıcı kararı 20.08): `‹` ikon →
 * (eyebrow) → büyük serif başlık. Yedinci turda detay ve hesap alanı da bunu kullanıyordu; Mobil v1
 * (13.09) onları çerçevenin üst barına taşıdı (`site-frame.mobile.tsx`). Bugün çerçeve eylemsiz bölüm
 * sayfalarında da (siparişlerim · puan geçmişi · bildirimler) bunu çiziyor — native'in "sayfa başlığı" durağı.
 *
 * ── YAPIŞKAN KİMLİK (beşinci tur) ───────────────────────────────────────────
 * *"Sticky olan kısım sayfanın ne sayfası olduğunu anlatan kısım olmalı."* iOS'un büyük-başlık
 * deseni: büyük başlık içerikle AKAR; ekrandan çıktığı anda üstteki yapışkan satırda kompakt adı
 * belirir. Yapışkan satır hep durur (geri yolu kaydırırken de erişilebilir — native üç-durak
 * kuralının ölçütü), ama adı ancak büyük başlık görünmezken taşır: ikisi aynı anda görünse aynı
 * kelime ekranda iki kez dururdu. Gözlemci `IntersectionObserver` — kaydırma dinleyicisi değil:
 * her karede koşmaz, yalnız eşik geçişinde tetiklenir.
 *
 * Checkout'un çip şeridi (altıncı tur) barın ALTINA yapışır: kendi başına ikinci bir kimlik
 * katmanı değil, barın uzantısıdır — `top` değeri BAR_HEIGHT'tır ve orada yinelenir
 * (`checkout-progress.tsx`), bar boyu değişirse ikisi birlikte değişmeli. Zemin de ikisinde aynı.
 *
 * ── NATIVE'İN ÖLÇÜLERİ (14.09 · kullanıcı bulgusu "başlıklar kötü") ─────────
 * Değerler native siparişler ekranının başlığından (`apps/mobile/src/screens/orders/orders-screen.tsx`):
 * üstbaşlık native'in kademesi (`eyebrow-xs` — 10 · 700 · .18em, terracotta; harf aralığı token'a gömülü),
 * başlık sayfa başlığı kademesi (`page-title-sm`). `‹` sayfa dolgusuna taşar ki glifi başlığın sol kenarıyla
 * hizalansın (native `backRow` −16). Yapışkan satırın zemini sayfanınki (`sand-50`) krem camda; kompakt ad
 * başlık çubuğunun kademesinde (`screen-title`). Satırın boyu değişmedi: 6 + 40 + 6 = 52 (BAR_HEIGHT).
 * Önceki hâl: üstbaşlık web'in eski mobil kademesi (`eyebrow-sm` 11 · 600 · .1em), başlık 30'luk `h1-sm`,
 * satır zemini `cream/95` — sayfanın üstünde açık bir şerit gibi duruyordu.
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
    // Ebeveyn PEDSİZ ve SAYFA BOYU olmalı: `sticky` en yakın kaydırılan atası boyunca yapışır —
    // başlık dar bir sarmalayıcıya konursa sarmalayıcı bitince bar da akıp gider (yaşandı, sepette
    // ölçüldü). Fragment döner ki bar uzun kök konteynerin DOĞRUDAN çocuğu olsun; yatay pedi
    // iki parça da kendi taşır.
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
        {eyebrow && <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{eyebrow}</span>}
        <h1 ref={heroRef} className="font-serif text-page-title-sm text-ink">
          {title}
        </h1>
      </div>
    </>
  );
}
