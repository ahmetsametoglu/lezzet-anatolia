import { serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { guarded, requireAdmin, requireFinance } from '@/lib/guard';
import { ProcurementClient } from './procurement-client';
import { readOrderPage, readPendingOrderCount, readSuggestionGroups, readSupplierCards } from './procurement-read';
import { parseProcurementUrl } from './procurement-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Tedarik ekranı (09.14) — YÖNETİCİ + MUHASEBE. Tedarikçi borcu ve vadesi muhasebenin de sorusudur;
// depocu ve kurye görmez (onun mal kabulü fiyatsızdır, 10.4). Sidebar da aynı kümeyi gösterir ama
// kapı BURADA: nav bir görgü kuralı, guard bir yetki kapısıdır (09.1 çift kat).
//
// OKUMA SEKMEYE BAĞLI (09.4'te ölçülen desen): öneri sekmesi stok eşiklerini, sipariş sekmesi PO
// sayfasını, tedarikçi sekmesi borç türetimini okur — üçünü birden okumak, açılan her sekmeye
// ötekilerin bedelini ödetirdi.

interface ProcurementPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProcurementPage({ searchParams }: ProcurementPageProps) {
  const access = await guarded(requireFinance);
  if (!access.ok) return <NoAccessPane title="Tedarik" reason="Alış fiyatı ve tedarikçi borcu operasyonun geri kalanına kapalıdır. Mal kabulü kendi ekranınızdan yapabilirsiniz." />;

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

  // İptal yalnız yöneticinin — muhasebeci zinciri okur, akışı durdurmaz. Ekran düğmeyi gizler,
  // action kendi kapısını ayrıca tutar (gizlemek bir güvence değildir).
  const canCancelOrders = (await guarded(requireAdmin)).ok;

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
      canCancelOrders={canCancelOrders}
    />
  );
}

