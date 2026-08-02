import { serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { guarded, requireAdmin } from '@/lib/guard';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon } from '@/components/operation/ui/icons';
import { ProcurementClient } from './procurement-client';
import { readOrderPage, readPendingOrderCount, readSuggestionGroups, readSupplierCards } from './procurement-read';
import { parseProcurementUrl } from './procurement-url';

// Tedarik ekranı (09.14) — yalnız ADMİN: alış fiyatı, borç ve tedarikçi ilişkisi operasyonun geri
// kalanına kapalı (depocunun kendi mal kabulü fiyatsızdır, 10.4).
//
// OKUMA SEKMEYE BAĞLI (09.4'te ölçülen desen): öneri sekmesi stok eşiklerini, sipariş sekmesi PO
// sayfasını, tedarikçi sekmesi borç türetimini okur — üçünü birden okumak, açılan her sekmeye
// ötekilerin bedelini ödetirdi.

interface ProcurementPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProcurementPage({ searchParams }: ProcurementPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane />;

  const urlState = parseProcurementUrl(await searchParams);
  const db = serviceDb();

  const [suggestions, suppliers, orders, pendingOrderCount, device] = await Promise.all([
    urlState.tab === 'suggestions' ? readSuggestionGroups(db) : Promise.resolve(null),
    urlState.tab === 'suppliers' ? readSupplierCards(db) : Promise.resolve(null),
    urlState.tab === 'orders' ? readOrderPage(db) : Promise.resolve(null),
    // Sayaç YALNIZ sipariş sekmesinde okunur: başka sekmedeyken "0" yazmak yanlış haber olurdu
    // (fiyat ekranının rozet kuralı).
    urlState.tab === 'orders' ? readPendingOrderCount(db) : Promise.resolve(null),
    detectDevice(),
  ]);

  return (
    <ProcurementClient
      data={{
        suggestions,
        suppliers,
        orders: orders?.rows ?? null,
        ordersCursor: orders?.nextCursor ?? null,
        pendingOrderCount,
      }}
      device={device}
      urlState={urlState}
    />
  );
}

/** Personel ama admin değil — kabuk (sidebar) korunur, yalnız pane kapanır (fiyat ekranının deseni). */
function NoAccessPane() {
  return (
    <>
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-ops-section font-semibold text-ops-ink">Tedarik</span>
        <span className="rounded-md border border-ops-line bg-ops-gray-25 px-2 py-[3px] font-ops-mono text-ops-xs font-medium text-ops-muted">
          kapalı
        </span>
      </div>
      <ErrorState
        tone="warn"
        icon={<AlertIcon />}
        title="Bu ekran yalnız yöneticiye açık"
        description="Alış fiyatı ve tedarikçi borcu operasyonun geri kalanına kapalıdır. Mal kabulü kendi ekranınızdan yapabilirsiniz."
      />
    </>
  );
}
