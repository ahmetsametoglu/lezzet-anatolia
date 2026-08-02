import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { OrdersTab } from './orders-tab';
import { SuggestionGroupCard, SuggestionsEmpty, SupplierCard } from './procurement-sections';
import { TAB_LABEL, type ProcurementTab } from './procurement-url';
import type { ProcurementData, PurchaseOrderRowView } from './procurement-types';

// Tedarik — masaüstü. Yerleşim `.dc`'ye göre: başlık + üç sekme; öneri kartları tam genişlik,
// sipariş listesi tablo, tedarikçi kartları iki kolon. Başlıktaki "+ Stok girişi / + Tedarik
// siparişi" düğmeleri diyaloglarıyla birlikte iner (BEKLEYEN(09.14)) — ölü düğme konmaz.

export interface ProcurementViewProps {
  data: ProcurementData;
  tab: ProcurementTab;
  onTab: (tab: ProcurementTab) => void;
  navPending: boolean;
  /** Sunucudan gelen ilk sayfa + action ile eklenenler. */
  orders: PurchaseOrderRowView[];
  hasMoreOrders: boolean;
  loadingMoreOrders: boolean;
  onLoadMoreOrders: () => void;
}

export function ProcurementDesktop(props: ProcurementViewProps) {
  const { data, tab, onTab, navPending, orders, hasMoreOrders, loadingMoreOrders, onLoadMoreOrders } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Tedarik" subtitle={subtitleOf(data, tab)} />
      <Tabs
        items={[
          // Rozet yalnız KARAR bekleyen iş: öneri listesi "senden sipariş bekleniyor" demektir;
          // bekleyen sipariş sayısı da "yolda ne var" uyarısıdır.
          { key: 'suggestions', label: TAB_LABEL.suggestions, badge: data.suggestions?.length ?? null },
          { key: 'orders', label: TAB_LABEL.orders, badge: data.pendingOrderCount },
          { key: 'suppliers', label: TAB_LABEL.suppliers, count: data.suppliers?.length ?? null },
        ]}
        active={tab}
        onSelect={onTab}
      />
      {/* Sekme turu sürerken içerik soluklaşır — tıklamanın karşılığı görünür (09.2 navPending).
          Sipariş sekmesi kendi `busy` yeteneğini kullanır: tablo satırları yerinde soluklaşır. */}
      <div
        aria-busy={navPending || undefined}
        className={[
          'flex min-h-0 flex-1 flex-col',
          tab === 'orders' ? 'overflow-hidden' : 'overflow-y-auto',
          navPending && tab !== 'orders' ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        {tab === 'suggestions' ? <SuggestionsPane data={data} /> : null}
        {tab === 'orders' ? (
          <OrdersTab
            rows={orders}
            hasMore={hasMoreOrders}
            loadingMore={loadingMoreOrders}
            onLoadMore={onLoadMoreOrders}
            busy={navPending}
          />
        ) : null}
        {tab === 'suppliers' ? <SuppliersPane data={data} /> : null}
      </div>
    </div>
  );
}

function subtitleOf(data: ProcurementData, tab: ProcurementTab): string {
  if (tab === 'suggestions' && data.suggestions) {
    const lineCount = data.suggestions.reduce((sum, g) => sum + g.lines.length, 0);
    return lineCount === 0 ? 'Eşik altında ürün yok' : `${data.suggestions.length} tedarikçide ${lineCount} kalem eşik altında`;
  }
  if (tab === 'orders' && data.pendingOrderCount !== null) {
    // "Yolda ne var" — gönderilmiş ama kapanmamış sipariş. Sıfır da bir haberdir (beklenen yok).
    return data.pendingOrderCount === 0
      ? 'Yolda bekleyen sipariş yok'
      : `${data.pendingOrderCount} sipariş yolda — kabul bekliyor`;
  }
  if (tab === 'suppliers' && data.suppliers) return `${data.suppliers.length} tedarikçi`;
  return 'Sistem hazırlar, siparişi siz verirsiniz';
}

function SuggestionsPane({ data }: { data: ProcurementData }) {
  const groups = data.suggestions ?? [];
  if (groups.length === 0) return <SuggestionsEmpty />;
  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      {/* Tasarımın açıklama cümlesi: eşik depo bazlı bir gerçek, öneri sistemden, karar admin'den. */}
      <p className="font-ops-body text-ops-sm text-ops-muted">
        Asgari stok eşiğinin altına düşen ürünler, tedarikçiye göre gruplu. Eşik depo bazlıdır — aynı ürün iki depoda
        iki satır olarak çıkabilir. Sistem önerir, siparişi siz verirsiniz.
      </p>
      {groups.map((group) => (
        <SuggestionGroupCard key={group.supplierId ?? 'unmapped'} group={group} />
      ))}
    </div>
  );
}

function SuppliersPane({ data }: { data: ProcurementData }) {
  const suppliers = data.suppliers ?? [];
  if (suppliers.length === 0) {
    return (
      <p className="px-6 py-8 text-center font-ops-body text-ops-sm text-ops-muted">
        Henüz tedarikçi kaydı yok — ilk kayıt tedarikçi formuyla birlikte geliyor.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 px-6 py-4">
      {suppliers.map((supplier) => (
        <SupplierCard key={supplier.id} supplier={supplier} />
      ))}
    </div>
  );
}
