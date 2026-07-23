import type { ReactNode } from 'react';
import '../app/globals.css';

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
  children: ReactNode;
}

export function RootShell({ lang, className, children }: RootShellProps) {
  return (
    <html lang={lang} className={className}>
      <body>{children}</body>
    </html>
  );
}
