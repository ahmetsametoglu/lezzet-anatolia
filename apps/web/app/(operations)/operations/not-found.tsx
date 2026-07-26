'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { SearchOffIcon } from '@/components/operation/ui/icons';

/**
 * Operasyon 404 — eşleşmeyen `/operations/…` yolları ve `notFound()` buraya düşer. AdminSidebar
 * (layout) korunur; hata pane ortasında gösterilir, operatör boş sayfaya atılmaz. Aktif ray YOK:
 * hiçbir bölümle eşleşmeyen yol → sidebar hiçbir öğeyi işaretlemez (varsayılanı bozulmaz).
 */
export default function OperationsNotFound() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* Üst bar — çerçeve pane içinde de korunur */}
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-[17px] font-semibold text-ops-ink">Sayfa bulunamadı</span>
        <span className="rounded-md border border-ops-line bg-[#f2f3ee] px-2 py-[3px] font-ops-mono text-[11px] font-medium text-ops-muted">
          404
        </span>
      </div>

      <ErrorState
        tone="neutral"
        icon={<SearchOffIcon />}
        title="Bu adreste bir ekran yok"
        description="Bağlantı eski olabilir ya da kayıt taşınmış/silinmiş olabilir. Aşağıdan devam edin."
      >
        {/* Denenen yol — teknik ayrıntı değil, yalnız adres */}
        <span className="rounded-md border border-ops-line bg-[#f2f3ee] px-2.5 py-[5px] font-ops-mono text-xs text-ops-muted">
          {pathname}
        </span>

        <div className="mt-0.5 flex gap-2">
          <Link href="/operations" className={buttonClass({ variant: 'primary' })}>
            Panele dön
          </Link>
          <Button variant="secondary" onClick={() => router.back()}>
            Geri
          </Button>
        </div>

        {/* Ana bölüm kısayolları (sidebar ile aynı hedefler) */}
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <span className="font-ops-display text-[10.5px] font-medium uppercase tracking-[0.06em] text-ops-muted">
            Sık kullanılan ekranlar
          </span>
          <div className="flex gap-2">
            {[
              { label: 'Siparişler', href: '/operations/orders' },
              { label: 'Stok', href: '/operations/stock' },
              { label: 'Rotalar', href: '/operations/routes' },
            ].map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="cursor-pointer rounded-[14px] border border-ops-line-strong bg-ops-card px-3 py-[5px] font-ops-display text-xs font-semibold text-ops-strong transition-colors hover:border-ops-olive"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </ErrorState>
    </>
  );
}
