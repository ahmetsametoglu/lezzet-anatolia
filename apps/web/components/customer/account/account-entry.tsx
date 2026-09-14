'use client';

import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { focusRingClass } from '@/components/customer/ui/button';
import { menuItemClass, menuPanelClass } from '@/components/customer/ui/menu';
import { useDismiss } from '@/components/customer/ui/use-dismiss.hook';
import { useAccount } from './account-context';
import { useSignOut } from './use-sign-out.hook';
import { useUnreadNotifications } from './use-unread-notifications.hook';
import messages from './account-messages.json';

/**
 * Başlıktaki hesap girişi — v1 (13.09): baş harfli yuvarlak avatar ve açılır hesap menüsü.
 *
 * Misafirde çerçeveli "Giriş yap" hapı. Girişli müşteride avatar; menünün BAŞINDA ad ve e-posta —
 * paylaşılan bir cihazda siparişin kime bağlandığını gösteren yer burası (29.07 kullanıcı isteği:
 * kim olduğu başlıktan okunmalı). Satırlar tasarımın sırasıyla: Hesabım · Siparişlerim · Taleplerim ·
 * Professionnels, ayraç, Çıkış yap. Menü yüzeyi ve satırı kitte (`menu.ts`), kapanma sözleşmesi de
 * (`useDismiss`) — seçim alanıyla ortak.
 *
 * İki bilinçli sapma:
 *  · **"Geri bildirim" yok** — v1'de var, ama değerlendirme sayfası yalnız davetin jetonuyla açılıyor
 *    (`/feedback/[token]`); menüden gidilecek bir adres yok.
 *  · **"Bildirimler" var** — v1'de zil çizilmemiş; bildirim akışı gerçek bir yüzey ve masaüstü
 *    başlığında zil kalmayınca tek girişi burası. Okunmamış varsa sayı satırda ve avatarın rozetinde.
 */
interface AccountEntryProps {
  locale: Locale;
  /** Satır adları site çerçevesinin sözlüğünden — aynı adlar başlıkta ve menüde tek yerden. */
  labels: { orders: string; support: string; pro: string };
}

type MenuItem = { href: ComponentProps<typeof Link>['href']; label: string; count?: number };

/** "Claire Weber" → "CW"; adsız müşteride e-postanın ilk harfi. */
function initialsOf(name: string, email: string | null | undefined, locale: Locale): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) return parts.slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase(locale)).join('');
  return (email?.charAt(0) || '?').toLocaleUpperCase(locale);
}

export function AccountEntry({ locale, labels }: AccountEntryProps) {
  const t = messages[locale];
  const account = useAccount();
  const unread = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const { busy, signOut } = useSignOut();
  const box = useRef<HTMLDivElement>(null);

  // Dışarı basınca ve Escape'le kapanır: açık kalan bir menü sayfanın geri kalanını tıklanmaz gösterir.
  useDismiss(box, open, () => setOpen(false));

  if (!account) {
    return (
      <Link
        href="/login"
        className={`flex-none cursor-pointer rounded-pill border-[1.5px] border-sand-300 bg-card px-4.5 py-2.5 font-sans text-note font-bold whitespace-nowrap text-ink transition-colors hover:border-olive ${focusRingClass}`}
      >
        {t.signIn}
      </Link>
    );
  }

  const count = unread !== null && unread > 0 ? unread : undefined;
  const items: MenuItem[] = [
    { href: '/account', label: t.myAccount },
    { href: '/orders', label: labels.orders },
    { href: '/support', label: labels.support },
    { href: '/account/notifications', label: t.notifications, count },
    { href: '/professionals', label: labels.pro },
  ];

  return (
    <div ref={box} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.myAccount}
        title={t.myAccount}
        className={[
          'relative grid size-10 cursor-pointer place-items-center rounded-full border-2 bg-honey-line font-sans text-note font-bold text-honey transition-colors',
          focusRingClass,
          open ? 'border-olive' : 'border-sand-300 hover:border-olive',
        ].join(' ')}
      >
        {initialsOf(account.name, account.email, locale)}
        {count !== undefined && (
          <span aria-hidden className="absolute -top-1 -right-1.5 rounded-pill border-2 border-cream bg-terracotta px-1 font-sans text-micro leading-tight font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute top-[calc(100%+12px)] right-0 z-40 min-w-[232px] ${menuPanelClass}`}>
          <div className="mb-1 flex flex-col gap-0.5 border-b border-sand-200 px-3 pt-2.5 pb-2.5">
            <span className="font-sans text-body-sm font-bold text-ink">{account.name || account.email}</span>
            {account.email && account.name && <span className="truncate font-sans text-micro text-muted">{account.email}</span>}
          </div>
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`${menuItemClass} flex items-center justify-between gap-3 text-ink hover:bg-hover-bg`}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="rounded-pill bg-terracotta px-1.5 font-sans text-micro font-bold text-white">{item.count > 99 ? '99+' : item.count}</span>
              )}
            </Link>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className={`${menuItemClass} mt-0.5 border-t border-sand-200 text-left text-terracotta hover:bg-terracotta-bg disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
