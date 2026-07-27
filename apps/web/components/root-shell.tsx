import type { ReactNode } from 'react';
import '../app/globals.css';
import { ThemeScript } from './operation/ui/theme-toggle';

/**
 * İki yüzeyin ortak kök kabuğu (base). `<html lang>`/`<body>` + global stil TEK yerde;
 * her root layout yalnız kendi farkını geçer — `lang`, font sınıfı, sarmalayıcılar.
 *
 * Not: Referans proje tek root + sabit `lang="fr"` kullanır (Türkçe admin'i de fr ile servis
 * eder). Biz locale-doğru `<html lang>` (müşteri /de → `de`) için çok-root kullanıyoruz; bu
 * kabuk da html/body/globals tekrarını engeller.
 */
interface RootShellProps {
  lang: string;
  className?: string;
  /**
   * Hangi evren — `<html data-surface>` olarak yazılır. Sayfa zemini ve KARANLIK MOD buna bağlıdır:
   * koyu palet yalnız `operations` ağacında ve yalnız işletim sistemi koyu temadayken devreye girer
   * (globals.css). Müşteri vitrini bilerek tek temalıdır.
   */
  surface: 'customer' | 'operations';
  children: ReactNode;
}

export function RootShell({ lang, className, surface, children }: RootShellProps) {
  return (
    <html lang={lang} className={className} data-surface={surface}>
      {/* Tema yalnız operasyonda seçilebilir; müşteri vitrini tek temalıdır (envanter kararı). */}
      {surface === 'operations' ? (
        <head>
          <ThemeScript />
        </head>
      ) : null}
      <body>{children}</body>
    </html>
  );
}
