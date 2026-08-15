import { serviceDb } from '@lezzet/database';
import { guarded, requireAdmin } from '@/lib/guard';
import { OrdersClient } from './orders-client';
import { readOrdersPage } from './orders-page-read';
import { parseOrdersUrl } from './orders-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Sipariş ekranı (09.7) — yalnız ADMİN. Depocu hazırlık listesini, kurye kendi teslimatlarını kendi
// ekranında görür; tutar/tahsilat/müşteri bilgisi o yüzeylere taşınmaz (tasarım §6). Guard bu yüzden
// `requireAdmin`, sayfa içi bir gizleme değil.
//
// Okuma tek yerde (`orders-page-read`): sonsuz kaydırmanın action'ı da aynı okumayı çağırır, yoksa
// ilk sayfa ile sonraki sayfalar farklı süzgeçlerle gelebilirdi.

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane title="Siparişler" reason="Sipariş tutarları, tahsilat ve müşteri bilgisi operasyonun geri kalanına kapalıdır. Hazırlık listesi depo ekranında, teslimatlar kurye ekranındadır." />;

  const urlState = parseOrdersUrl(await searchParams);
  const data = await readOrdersPage(serviceDb(), urlState);

  return <OrdersClient data={data} urlState={urlState} />;
}

