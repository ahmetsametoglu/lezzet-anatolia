'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon, SearchIcon, type NavIconName } from './icons';
import { ThemeToggle } from './theme-toggle';

/**
 * AdminSidebar — Komponent Envanteri O1. Tüm admin sayfalarının TEK gezinme kaynağı (nav kopyalanmaz):
 * 214px açık ray, marka + arama + 5 bölüm + kullanıcı bloğu. Aktif öğe olive şerit + koyu metin.
 * Rozet sayaçları (bekleyen iş) veri bağlanınca eklenecek. Aktiflik route'tan türetilir (usePathname).
 */
interface NavItem {
  key: NavIconName;
  label: string;
  href: string;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

// URL segmentleri İngilizce (web-conventions kuralı operasyon yüzeyinde de geçerli); etiketler Türkçe.
const SECTIONS: NavSection[] = [
  {
    label: 'Günlük',
    items: [
      { key: 'panel', label: 'Panel', href: '/operations' },
      { key: 'siparisler', label: 'Siparişler', href: '/operations/orders' },
      { key: 'rotalar', label: 'Rotalar', href: '/operations/routes' },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { key: 'urunler', label: 'Ürünler', href: '/operations/products' },
      { key: 'fiyatlar', label: 'Fiyatlar', href: '/operations/prices' },
      { key: 'stok', label: 'Stok', href: '/operations/stock' },
      { key: 'satinalma', label: 'Satın Alma', href: '/operations/purchasing' },
    ],
  },
  {
    label: 'Para & analiz',
    items: [
      { key: 'para', label: 'Para', href: '/operations/finance' },
      { key: 'raporlar', label: 'Raporlar', href: '/operations/reports' },
      { key: 'analitik', label: 'Analitik', href: '/operations/analytics' },
    ],
  },
  {
    label: 'İlişki',
    items: [
      { key: 'musteriler', label: 'Müşteriler', href: '/operations/customers' },
      { key: 'b2b', label: 'B2B Onay', href: '/operations/b2b-approvals' },
      { key: 'talepler', label: 'Talepler', href: '/operations/tickets' },
      { key: 'geribildirim', label: 'Geri Bildirim', href: '/operations/feedback' },
      { key: 'whatsapp', label: 'WhatsApp', href: '/operations/whatsapp' },
    ],
  },
  {
    label: 'Sistem',
    items: [{ key: 'ayarlar', label: 'Ayarlar', href: '/operations/settings' }],
  },
];

// Panel kökü tam eşleşir (aksi halde her yolu yakalar); diğerleri önek eşleşir.
function isActive(pathname: string, href: string): boolean {
  return href === '/operations' ? pathname === '/operations' : pathname.startsWith(href);
}

// Rol → Türkçe etiket (tek rol; customer bu yüzeye giremez).
const ROLE_LABEL: Record<string, string> = { admin: 'Yönetici', warehouse: 'Depo', courier: 'Kurye' };

interface AdminSidebarProps {
  user: { email: string; role: string };
}

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const local = user.email.split('@')[0] || 'personel';
  const initials = local.slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABEL[user.role] ?? 'Personel';

  return (
    <aside className="sticky top-0 flex h-screen w-[214px] flex-none flex-col overflow-y-auto border-r border-ops-line bg-ops-panel py-4 font-ops-body">
      {/* Marka */}
      <div className="flex items-center gap-2.5 px-4 pb-3">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-ops-ink font-ops-display text-[15px] font-bold text-ops-olive-light">
          L
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-ops-display text-[15px] font-semibold text-ops-ink">Lezzet</span>
          <span className="font-ops-display text-[9px] font-medium tracking-[0.2em] text-ops-muted">OPERASYON</span>
        </div>
      </div>

      {/* Arama — görsel yer tutucu; işlev sonraki dilimde */}
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-ops-gray-300 bg-ops-line px-2.5 py-[7px] text-ops-faint">
        <SearchIcon />
        <span className="flex-1 font-ops-body text-xs">Ara…</span>
        <span className="rounded border border-ops-line-strong px-1 font-ops-mono text-[10px]">⌘K</span>
      </div>

      {/* Bölümler */}
      <nav className="flex flex-col">
        {SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col">
            <span className="px-4 pb-1 pt-3 font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.15em] text-ops-faint">
              {section.label}
            </span>
            {section.items.map((item) => {
              const on = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={[
                    'flex items-center gap-[11px] border-l-2 px-[15px] py-[7px] no-underline transition-colors',
                    on ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark' : 'border-transparent text-ops-faint hover:bg-ops-line',
                  ].join(' ')}
                >
                  <NavIcon name={item.key} />
                  <span
                    className={['flex-1 font-ops-display text-[13px]', on ? 'font-semibold text-ops-ink' : 'font-medium text-ops-body'].join(' ')}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Kullanıcı bloğu — `mt-auto` ile alt kümeyi rayın dibine iter */}
      <div className="mx-[15px] mt-auto flex items-center gap-2.5 border-t border-ops-line pt-3">
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-ops-olive font-ops-display text-xs font-semibold text-ops-card">
          {initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-ops-display text-[12.5px] font-semibold text-ops-ink">{local}</span>
          <span className="font-ops-body text-[10.5px] text-ops-muted">{roleLabel}</span>
        </div>
      </div>

      {/* Tema anahtarı — rayın en altı; karanlık palet yalnız bu yüzeyde geçerlidir */}
      <ThemeToggle />
    </aside>
  );
}
