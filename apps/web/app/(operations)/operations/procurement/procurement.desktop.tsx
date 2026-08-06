import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { Select } from '@/components/operation/form/select';
import { OrdersTab } from './orders-tab';
import { SuggestionGroupCard, SuggestionsEmpty, SupplierCard } from './procurement-sections';
import { statusLabel } from './procurement-labels';
import { ORDER_STATUS_FILTERS, TAB_LABEL, type ProcurementUrlState } from './procurement-url';
import type { ProcurementData, PurchaseOrderRowView, SupplierCardView } from './procurement-types';

// Tedarik — masaüstü. Yerleşim `.dc`'ye göre: başlık + üç sekme; öneri kartları tam genişlik,
// sipariş listesi tablo, tedarikçi kartları iki kolon. Başlıktaki "+ Stok girişi" düğmesi burada
// YOK ve bu bilinçli: mal kabul bu sayfadan çıktı, Stok ekranının işi (kapsam kararı 02.08).

interface ProcurementViewProps {
  data: ProcurementData;
  urlState: ProcurementUrlState;
  onFilter: (patch: Partial<ProcurementUrlState>) => void;
  navPending: boolean;
  /** Sunucudan gelen ilk sayfa + action ile eklenenler. */
  orders: PurchaseOrderRowView[];
  hasMoreOrders: boolean;
  loadingMoreOrders: boolean;
  onLoadMoreOrders: () => void;
  onCreateDraft: (supplierId: string) => void;
  /** Taslağı açılmakta olan tedarikçi (yoksa null) — yalnız o kartın düğmesi kilitlenir. */
  creatingFor: string | null;
  actionError: string | null;
  onEditSupplier: (supplier: SupplierCardView | null) => void;
  onOpenOrder: (orderId: string) => void;
  onNewOrder: () => void;
}

export function ProcurementDesktop(props: ProcurementViewProps) {
  const { data, urlState, onFilter, navPending, orders, hasMoreOrders, loadingMoreOrders, onLoadMoreOrders, actionError } =
    props;
  const tab = urlState.tab;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Tedarik" subtitle={subtitleOf(data, urlState)}>
        {/* Elle sipariş yalnız kendi sekmesinde: öneri sekmesindeyken "yeni sipariş" demek, ekranın
            o an önerdiği işi görmezden gelmeye davet etmek olurdu. */}
        {tab === 'orders' ? (
          <Button variant="primary" size="sm" onClick={props.onNewOrder}>
            + Tedarik siparişi
          </Button>
        ) : null}
        {/* Yeni tedarikçi HER sekmede: kart olmadan sipariş de olmuyor, kurulumun ilk adımı bu. */}
        <Button variant="secondary" size="sm" onClick={() => props.onEditSupplier(null)}>
          + Tedarikçi
        </Button>
      </PageHeader>
      {actionError ? (
        <p role="alert" className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2 font-ops-body text-ops-sm text-ops-red">
          {actionError}
        </p>
      ) : null}
      <Tabs
        items={[
          // Rozet yalnız KARAR bekleyen iş: öneri listesi "senden sipariş bekleniyor" demektir;
          // bekleyen sipariş sayısı da "yolda ne var" uyarısıdır.
          { key: 'suggestions', label: TAB_LABEL.suggestions, badge: data.suggestions?.length ?? null },
          { key: 'orders', label: TAB_LABEL.orders, badge: data.pendingOrderCount },
          { key: 'suppliers', label: TAB_LABEL.suppliers, count: data.suppliers?.length ?? null },
        ]}
        active={tab}
        onSelect={(next) => onFilter({ tab: next })}
      />

      {/* Süzgeç şeridi YALNIZ sipariş sekmesinde — öteki iki sekmenin listesi zaten sınırlı ve
          süzülecek bir şeyi yok. Sayılı iki-üç seçenek `Chip`, açık uçlu süzgeç `Select variant="chip"`
          (sipariş/fiyat ekranlarının ayrımı). */}
      {tab === 'orders' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
          {ORDER_STATUS_FILTERS.map((s) => (
            <Chip key={s} active={urlState.status === s} onClick={() => onFilter({ status: s })}>
              {s === 'all' ? 'Tümü' : statusLabel(s)}
            </Chip>
          ))}
          <span className="ml-1 h-4 w-px bg-ops-line" />
          <Select
            variant="chip"
            value={urlState.supplier}
            onChange={(supplier) => onFilter({ supplier })}
            placeholder="+ tedarikçi"
            // İlk seçenek süzgeci KALDIRIR: boş değerli bir satır olmadan çip bir kez dolunca
            // temizlenemezdi — operatör süzgeci kurmanın yolunu bulur, bozmanın yolunu bulamazdı.
            options={[
              { value: '', label: 'Her tedarikçi' },
              ...(data.supplierOptions ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
      ) : null}

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
        {tab === 'suggestions' ? <SuggestionsPane {...props} /> : null}
        {tab === 'orders' ? (
          <OrdersTab
            rows={orders}
            today={data.today}
            hasMore={hasMoreOrders}
            loadingMore={loadingMoreOrders}
            onLoadMore={onLoadMoreOrders}
            busy={navPending}
            onOpenOrder={props.onOpenOrder}
          />
        ) : null}
        {tab === 'suppliers' ? <SuppliersPane {...props} /> : null}
      </div>
    </div>
  );
}

function subtitleOf(data: ProcurementData, urlState: ProcurementUrlState): string {
  if (urlState.tab === 'suggestions' && data.suggestions) {
    const lineCount = data.suggestions.reduce((sum, g) => sum + g.lines.length, 0);
    return lineCount === 0 ? 'Eşik altında ürün yok' : `${data.suggestions.length} tedarikçide ${lineCount} kalem eşik altında`;
  }
  if (urlState.tab === 'orders' && data.pendingOrderCount !== null) {
    // "Yolda ne var" — gönderilmiş ama kapanmamış sipariş. Sayı SÜZGEÇTEN bağımsızdır ve öyle
    // kalmalı: bu, ekranın daralttığı bakışın değil işin gerçeğinin sorusu. Sıfır da bir haberdir.
    return data.pendingOrderCount === 0
      ? 'Yolda bekleyen sipariş yok'
      : `${data.pendingOrderCount} sipariş yolda — kabul bekliyor`;
  }
  if (urlState.tab === 'suppliers' && data.suppliers) return `${data.suppliers.length} tedarikçi`;
  return 'Sistem hazırlar, siparişi siz verirsiniz';
}

function SuggestionsPane({ data, onCreateDraft, creatingFor }: ProcurementViewProps) {
  const groups = data.suggestions ?? [];
  if (groups.length === 0) return <SuggestionsEmpty />;
  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      {/* Tasarımın açıklama cümlesi: eşik depo bazlı bir gerçek, öneri sistemden, karar admin'den. */}
      <p className="font-ops-body text-ops-sm text-ops-muted">
        Asgari stok eşiğinin altına düşen ürünler, tedarikçiye göre gruplu. Eşik depo bazlıdır — aynı ürün iki depoda
        iki satır olarak çıkabilir. Yoldaki mal hesaba katılmıştır. Sistem önerir, siparişi siz verirsiniz.
      </p>
      {groups.map((group) => (
        <SuggestionGroupCard
          key={group.supplierId ?? 'unmapped'}
          group={group}
          onCreateDraft={onCreateDraft}
          creating={creatingFor === group.supplierId}
        />
      ))}
    </div>
  );
}

function SuppliersPane({ data, onEditSupplier }: ProcurementViewProps) {
  const suppliers = data.suppliers ?? [];
  if (suppliers.length === 0) {
    return (
      <EmptyState
        title="Henüz tedarikçi yok"
        description="Sipariş verebilmek için önce kimden aldığınızı tanıtın: ad yeter, vade ve telefonu sonra da ekleyebilirsiniz."
      >
        <Button variant="primary" size="sm" onClick={() => onEditSupplier(null)}>
          + İlk tedarikçiyi ekle
        </Button>
      </EmptyState>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 px-6 py-4">
      {suppliers.map((supplier) => (
        <SupplierCard key={supplier.id} supplier={supplier} onEdit={onEditSupplier} />
      ))}
    </div>
  );
}
