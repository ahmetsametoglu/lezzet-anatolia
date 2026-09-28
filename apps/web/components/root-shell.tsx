import type { ReactNode } from 'react';
import '../app/globals.css';
import { ThemeScript } from './operation/ui/theme-toggle';

/**
 * İki yüzeyin ortak kök kabuğu: `<html lang>`, `<body>` ve global stil tek yerde, her root layout yalnız kendi farkını geçer. Çok-root
 * kullanılır, çünkü müşteri `/de` adresi dile doğru `<html lang>` ister.
 */
interface RootShellProps {
  lang: string;
  className?: string;
  /**
   * Hangi evren, `<html data-surface>` olarak yazılır: sayfa zemini ve karanlık mod buna bağlıdır, koyu palet yalnız operasyonda ve
   * işletim sistemi koyu temadayken devreye girer.
   */
  surface: 'customer' | 'operations';
  children: ReactNode;
}

export function RootShell({ lang, className, surface, children }: RootShellProps) {
  return (
    <html
      lang={lang}
      className={className}
      data-surface={surface}
      /**
       * `data-theme`i sunucu değil `ThemeScript` yazar, çünkü tercih `localStorage`da ve ilk boyamadan önce uygulanmazsa koyu panel
       * bir kare beyaz yanıp söner; bu yüzden hidrasyon uyarısı yalnız bu düğümde ve yalnız operasyonda susturulur.
       */
      suppressHydrationWarning={surface === 'operations'}
    >
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
