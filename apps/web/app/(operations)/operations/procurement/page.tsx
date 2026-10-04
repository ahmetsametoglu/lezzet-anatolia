import { serviceDb } from '@lezzet/database';
import { parisDateOf } from '@lezzet/helper';
import { guarded, requireAdmin, requireFinance } from '@/lib/guard';
import { ProcurementClient } from './procurement-client';
import {
  readOrderPage,
  readPendingOrderCount,
  readSuggestionGroups,
  readSupplierCards,
  readSupplierOptions,
} from './procurement-read';
import { parseProcurementUrl, toOrderFilters } from './procurement-url';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Tedarik ekranı yönetici ve muhasebenindir: tedarikçi borcu ve vadesi muhasebenin de sorusudur, depocu ve kurye görmez. Okuma sekmeye
// bağlıdır, çünkü üç sekmeyi birden okumak açılan her sekmeye ötekilerin bedelini ödetirdi.

interface ProcurementPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProcurementPage({ searchParams }: ProcurementPageProps) {
  const access = await guarded(requireFinance);
  if (!access.ok) return <NoAccessPane title="Tedarik" reason="Alış fiyatı ve tedarikçi borcu operasyonun geri kalanına kapalıdır. Mal kabulü kendi ekranınızdan yapabilirsiniz." />;

  const urlState = parseProcurementUrl(await searchParams);
  const db = serviceDb();

  const [suggestions, suppliers, orders, pendingOrderCount, supplierOptions] = await Promise.all([
    urlState.tab === 'suggestions' ? readSuggestionGroups(db) : Promise.resolve(null),
    urlState.tab === 'suppliers' ? readSupplierCards(db) : Promise.resolve(null),
    urlState.tab === 'orders' ? readOrderPage(db, toOrderFilters(urlState)) : Promise.resolve(null),
    // Sayaç YALNIZ sipariş sekmesinde okunur: başka sekmedeyken "0" yazmak yanlış haber olurdu
    // (fiyat ekranının rozet kuralı). Sayaç SÜZGEÇTEN bağımsızdır ve öyle kalmalı: "yolda ne var"
    // ekranın daralttığı bakışın değil, işin gerçeğinin sorusudur.
    urlState.tab === 'orders' ? readPendingOrderCount(db) : Promise.resolve(null),
    // Süzgeç satırı ve elle sipariş penceresi aynı listeyi kullanır, ikisi de sipariş sekmesinde.
    urlState.tab === 'orders' ? readSupplierOptions(db) : Promise.resolve(null),
  ]);

  // Hedef depo seçenekleri BAĞLAMDAN gelir: kapsam dışı depo hiçbir seçicide görünmez (kapının
  // kendi kuralı) — elle siparişte de aynı evren geçerli.
  const ctx = urlState.tab === 'orders' ? await readWarehouseContext() : null;

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
        supplierOptions,
        // Yalnız TESİSLER: satın alma siparişi bir araca teslim edilmez (bağlamın `facilities` künyesi).
        warehouseOptions: ctx?.facilities.map((w) => ({ id: w.id, code: w.code, name: w.name })) ?? null,
        // Gün sunucudan ve Paris takviminden: istemcide hesaplansaydı gece yarısını geçen bir istekte iki taraf farklı gün üretirdi.
        today: parisDateOf(new Date()),
      }}
      urlState={urlState}
      canCancelOrders={canCancelOrders}
    />
  );
}

