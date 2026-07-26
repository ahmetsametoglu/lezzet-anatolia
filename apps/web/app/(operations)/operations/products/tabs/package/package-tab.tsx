import { PackageIcon } from '@/components/operation/ui/icons';

// Paketler sekmesi — bundle veri modeli (paket + kalemleri) HENÜZ YOK; şema/servis/migration sonraki
// dilimde kurulacak. O yüzden burada UI iskeleti + niyet metni var, işlevsel eylem yok (bilinçli stub).

export function PackagesTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="mr-auto font-ops-body text-[12px] text-ops-muted">
          Kalem fiyatları toplamı = paket fiyatı · sistem doğrular · yeni ürün yaratmaz
        </span>
        <span className="rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-display text-[12px] font-semibold text-ops-card">+ Paket</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-ops-faint">
        <PackageIcon />
        <span className="font-ops-body text-[13px] text-ops-body">Paket (bundle) modeli sonraki dilimde kurulacak.</span>
      </div>
    </div>
  );
}
