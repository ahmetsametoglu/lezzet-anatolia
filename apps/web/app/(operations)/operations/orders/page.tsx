import { serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { guarded, requireAdmin } from '@/lib/guard';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon } from '@/components/operation/ui/icons';
import { OrdersClient } from './orders-client';
import { readOrdersPage } from './orders-page-read';
import { parseOrdersUrl } from './orders-url';

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
  if (!access.ok) return <NoAccessPane />;

  const urlState = parseOrdersUrl(await searchParams);
  const data = await readOrdersPage(serviceDb(), urlState);
  const device = await detectDevice();

  // Bugün SUNUCUDAN: gün süzgecinin etiketleri iki tarafta aynı günü göstersin (bkz. `deliveryDayOptions`).
  return <OrdersClient data={data} device={device} urlState={urlState} today={new Date().toISOString().slice(0, 10)} />;
}

/** Personel ama admin değil — kabuk (sidebar) korunur, yalnız pane kapanır (fiyat ekranıyla aynı). */
function NoAccessPane() {
  return (
    <>
      <div className="flex items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="font-ops-display text-ops-section font-semibold text-ops-ink">Siparişler</span>
        <span className="rounded-md border border-ops-line bg-ops-gray-25 px-2 py-[3px] font-ops-mono text-ops-xs font-medium text-ops-muted">
          kapalı
        </span>
      </div>
      <ErrorState
        tone="warn"
        icon={<AlertIcon />}
        title="Bu ekran yalnız yöneticiye açık"
        description="Sipariş tutarları, tahsilat ve müşteri bilgisi operasyonun geri kalanına kapalıdır. Hazırlık listesi depo ekranında, teslimatlar kurye ekranındadır."
      />
    </>
  );
}
