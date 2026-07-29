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
    <html
      lang={lang}
      className={className}
      data-surface={surface}
      /**
       * `data-theme`i SUNUCU YAZMAZ, `ThemeScript` yazar — React de bu yüzden hidrasyonda uyarıyor:
       * sunucudan gelen `<html>`de o özellik yok, tarayıcıdaki düğümde var.
       *
       * Kaçınılmaz bir SIRA sorunu, bir tutarsızlık değil: tercih `localStorage`da ve işletim
       * sisteminin temasında yaşıyor — ikisi de sunucuda okunamaz. Betik ilk boyamadan ÖNCE koşmak
       * zorunda, yoksa koyu temada açılan panel bir kare beyaz yanıp söner (FOUC). Yani ya uyarı ya
       * göz alan bir titreme.
       *
       * `suppressHydrationWarning` React'in bu durum için verdiği kapıdır ve KAPSAMI DARDIR: yalnız
       * bu düğümün kendi özelliklerini susturur, ağacın geri kalanını değil. Yalnız operasyonda
       * açık — müşteri vitrininde tema betiği yok, orada çıkacak bir uyarı GERÇEK bir sapma olur ve
       * duyulmaya devam etmeli.
       *
       * Alternatif, tercihi çereze taşıyıp sunucuda yazmaktı; o zaman uyarı da titreme de olmazdı.
       * Yapılmadı: tema bir görünüm tercihi, her isteğe takılmasının bir bedeli var ve `localStorage`
       * kararı zaten alınmış (`theme-toggle`). Çereze taşınırsa bu satır kalkar.
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
