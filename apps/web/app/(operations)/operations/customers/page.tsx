import { UserProfileService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { readOverdueCustomerIds } from '@/lib/customer/scorecard';
import { detectDevice } from '@/lib/device';
import { guarded, requireAdmin } from '@/lib/guard';
import { CustomersClient } from './customers-client';
import { toCustomerRows } from './customers-read';
import { parseCustomersUrl, toCustomerFilters } from './customers-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Müşteriler ekranı (09.9) — yalnız ADMİN. Vade/limit, karne ve pazarlama izni operasyonun geri
// kalanına KAPALI (tasarım §6): depo ve kurye bir müşterinin ödeme geçmişini görmez. Guard bu yüzden
// `requireAdmin`, sayfa içi bir gizleme değil — ekranın düğmeyi göstermemesi bir güvence değildir.
//
// SÜZME VE ARAMA SUNUCUDA (`UserProfileService.list`): müşteri kümesi veriyle büyür, client'ta
// süzülemez. Yüklenmiş sayfada arayan bir kutu, ikinci sayfada duran müşteriyi "yok" gösterirdi.

interface CustomersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane title="Müşteriler" reason="Vade/limit, ödeme karnesi ve pazarlama izni bilgisi operasyonun geri kalanına kapalıdır. Bir düzeltme gerekiyorsa yöneticinize iletin." />;

  const urlState = parseCustomersUrl(await searchParams);
  const db = serviceDb();
  const profiles = new UserProfileService(db);

  // Liste + sayaçlar paralel. Sayaçlar SÜZGEÇLİ listeden bağımsız okunur ve bu bilinçli: "312
  // müşteri" toplam kümedir, çipin daralttığı küme değil — çip kendi sayısını saymamalı.
  const [page, counts, overdueIds] = await Promise.all([
    profiles.list({ ...toCustomerFilters(urlState), limit: DEFAULT_PAGE_SIZE }),
    profiles.counts(),
    readOverdueCustomerIds(db),
  ]);

  const device = await detectDevice();

  return (
    <CustomersClient
      data={{
        rows: toCustomerRows(page.rows, overdueIds),
        nextCursor: page.nextCursor,
        counts: { ...counts, overdue: overdueIds.size },
      }}
      device={device}
      urlState={urlState}
    />
  );
}

