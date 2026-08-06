'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@lezzet/types';
import { NavIcon } from './icons';
import { isActive, sectionsFor } from './ops-nav';
import { ThemeToggle } from './theme-toggle';

/**
 * AdminSidebar — Komponent Envanteri O1. Tüm admin sayfalarının TEK gezinme kaynağı (nav kopyalanmaz):
 * 214px açık ray, marka + 6 bölüm + tema anahtarı. Aktif öğe olive şerit + koyu metin. Aktiflik
 * route'tan türetilir; model `ops-nav.ts`'te (⌘K paleti de aynı listeyi okur).
 *
 * ── RAY 09.19'DA İNCELDİ ─────────────────────────────────────────────────────
 * Üç blok başlık barına taşındı: **depo bağlamı · arama (⌘K) · kullanıcı künyesi.** Kullanıcı
 * kararı (02.08): *"orası çok karmaşık ve dolu görünüyor."* Gerekçe sonradan da doğrulandı — üçü
 * de GEZİNME değil, sayfa-üstü bağlam: hangi evrendeyim, kimim, nereye atlarım. Ray artık tek bir
 * soruya cevap veriyor: **nereye gidiyorum.**
 *
 * Tema anahtarı bilinçle KALDI: o bir tercih, bağlam değil — barın yatay alanı sayfanın işine
 * ayrılmalı, günde bir kez dokunulan bir anahtara değil.
 */
interface AdminSidebarProps {
  /** Roller ÇOĞUL: gezinme kümesi hepsinin birleşimidir (en geniş rol seçilmez). */
  roles: readonly UserRole[];
}

export function AdminSidebar({ roles }: AdminSidebarProps) {
  const pathname = usePathname();
  const sections = sectionsFor(roles);

  // Operasyon web'i masaüstü-yalnız (06.08): telefon çekmecesi söküldü, ray akışın parçası ve hep
  // açık; mobil deneyim native uygulamada — `docs/uygulama`.
  return (
    <aside className="sticky top-0 flex h-screen w-[214px] flex-none flex-col overflow-y-auto border-r border-ops-line bg-ops-panel py-4 font-ops-body">
      {/* Marka */}
      <div className="flex items-center gap-2.5 px-4 pb-3">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-ops-ink font-ops-display text-ops-lead font-bold text-ops-olive-light">
          L
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Lezzet</span>
          <span className="font-ops-display text-ops-micro font-medium tracking-[0.2em] text-ops-muted">OPERASYON</span>
        </div>
      </div>

      {/* Bölümler */}
      <nav className="flex flex-col">
        {sections.length === 0 ? (
          // Rolüne açık HİÇBİR ekran yok — boş bir ray "sistem bozuk" gibi okunur; sebep yazılır.
          // Bugün depocu ve kurye bu hâle düşebilir: kendi ekranları (10/11) henüz yazılmadı.
          <p className="px-4 py-3 font-ops-body text-ops-xs leading-relaxed text-ops-muted">
            Rolünüze açık bir ekran henüz yok. Yöneticiniz yetki tanımladığında bölümler burada belirir.
          </p>
        ) : null}
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col">
            <span className="px-4 pb-1 pt-3 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.15em] text-ops-faint">
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
                    className={['flex-1 font-ops-display text-ops-base', on ? 'font-semibold text-ops-ink' : 'font-medium text-ops-body'].join(' ')}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Tema anahtarı — rayın en altı (`mt-auto` dibe iter); karanlık palet yalnız bu yüzeyde geçerli.
          Kullanıcı künyesi burada DEĞİL artık: başlık barına taşındı (09.19). */}
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}
