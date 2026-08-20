'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { BackButton } from './back-button';

/**
 * Hamburgersiz mobil sayfaların ORTAK başlığı (kullanıcı kararı 20.08, dördüncü→yedinci tur):
 * `‹` ikon → (eyebrow) → büyük serif başlık. Önce sepet+checkout için doğdu (*"birden fazla çeşit
 * header yapısı olmaz"*); yedinci turda kapsam BÜTÜN hamburgersiz sayfalara genişledi — detay
 * (ürün/paket/tarif) ve hesap alanı da aynı yapıyı kullanır. Üç ayrı geri düğmesi biçimi, tek
 * sayfada logo, tek katmanda yapışkanlık kalmıştı; artık tek dil. Sayfa kendi yapısını kurmaz,
 * bunu çağırır — huni sayfaları doğrudan, detay/hesap `SiteFrame` üzerinden.
 *
 * ── YAPIŞKAN KİMLİK (beşinci tur) ───────────────────────────────────────────
 * *"Sticky olan kısım sayfanın ne sayfası olduğunu anlatan kısım olmalı."* iOS'un büyük-başlık
 * deseni: büyük başlık içerikle AKAR; ekrandan çıktığı anda üstteki yapışkan satırda kompakt adı
 * belirir. Yapışkan satır hep durur (geri yolu kaydırırken de erişilebilir — native üç-durak
 * kuralının ölçütü), ama adı ancak büyük başlık görünmezken taşır: ikisi aynı anda görünse aynı
 * kelime ekranda iki kez dururdu. Gözlemci `IntersectionObserver` — kaydırma dinleyicisi değil:
 * her karede koşmaz, yalnız eşik geçişinde tetiklenir.
 *
 * Ürün/paket detayı bu bileşeni KULLANMAZ (sekizinci tur, 20.08): orada hiç başlık yok — görsel
 * tepeye yaslı, geri düğmesi fotoğrafın üstünde (`BackButton photo`), sepet sağ alttaki `CartFab`.
 * Yedinci turun `watchId` (içerik h1'ini gözleme) yeteneği bu kararla söküldü — tek kullanıcısı
 * o iki sayfaydı.
 *
 * Checkout'un çip şeridi (altıncı tur) barın ALTINA yapışır: kendi başına ikinci bir kimlik
 * katmanı değil, barın uzantısıdır — `top` değeri BAR_HEIGHT'tır ve orada yinelenir
 * (`checkout-progress.tsx`), bar boyu değişirse ikisi birlikte değişmeli.
 *
 * Eyebrow TERRACOTTA (yedinci tur, kullanıcı isteği "kurumsal renk dokunuşu"): native uygulamanın
 * "sayfa başlığı" durağı birebir böyle (`KARARLAR.md` "üç header" 16.08 — terracotta eyebrow +
 * mürekkep serif başlık); harf aralığı token'da gömülü, elle yazılmaz.
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
      <div className="sticky top-0 z-20 flex items-center gap-1.5 bg-cream/95 px-4 py-1 backdrop-blur">
        <BackButton label={backLabel} fallback={fallback} />
        <span
          aria-hidden={!collapsed}
          className={[
            'min-w-0 flex-1 truncate font-serif text-card-title-sm text-ink transition-opacity duration-150',
            collapsed ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          {title}
        </span>
        {right && <div className="flex flex-none items-center gap-3.5">{right}</div>}
      </div>
      <div className="flex flex-col gap-1 px-4 pt-1">
        {eyebrow && <span className="font-sans text-eyebrow-sm text-terracotta uppercase">{eyebrow}</span>}
        <h1 ref={heroRef} className="font-serif text-h1-sm text-ink">
          {title}
        </h1>
      </div>
    </>
  );
}
