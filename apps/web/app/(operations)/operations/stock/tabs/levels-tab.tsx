'use client';

import { Badge } from '@/components/operation/ui/badge';
import { STOCK_COLUMN_TRACKS } from '../stock-columns';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { templateOf } from '@/components/operation/ui/table-columns';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { shortDate } from '@/components/operation/ui/format';
import { expiryBadge } from '@/lib/stock/batch-labels';
import { ProductHistoryPanel } from '@/components/operation/stock/product-history-panel';
import type { StockLevelRow, StockViewProps } from '../stock-types';

// Stok seviyeleri — SOL tabloda boylar (fiili/ayrılmış/kullanılabilir + en yakın tarih), SAĞ panelde
// SEÇİLİ BOYUN stok geçmişi (22.30).
//
// Panelde eskiden karar kuyruğunun ilk üçü vardı ve seçime bağlı DEĞİLDİ; gerekçesi tutarlıydı ama
// sonucu bir tekrardı — aynı liste bir sekme ötede duruyor ve başlık satırı kaç parti beklediğini
// zaten söylüyor. Aynı alan artık başka hiçbir yerde cevabı olmayan soruya ayrılıyor: "bu üründen ne
// zaman, kaça girdi; ne kadarı satıldı, ne kadarı çöpe gitti".

export function LevelsTab({
  data,
  levels,
  selectedId,
  onSelect,
  hasMoreLevels,
  loadingLevels,
  onLoadMoreLevels,
  navPending,
  openVariantId,
  onToggleSplit,
  warehouseFilter,
}: StockViewProps) {
  const { warehouse } = data;
  // Seçili satır KİMLİKLE bulunur, kopya tutulmaz: liste tazelenince satır nesnesi değişir ama
  // kimlik durur ve panel bayat bir kopyayı göstermez.
  const selected = levels.find((r) => r.variantId === selectedId) ?? null;
  const warehouseNames = new Map(warehouse.options.map((w) => [w.id, w.name]));
  const columns: Column<StockLevelRow>[] = withCells<StockLevelRow>(STOCK_COLUMN_TRACKS, {
    name: (r) => (
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Görsel ADIN SOLUNDA ve küçük (22.30, kullanıcı tespiti): depoda ürünler adlarıyla değil
            görünüşleriyle hatırlanır, uzun listede satırı okumadan tanıtır. Görsel yoksa YER TUTULUR
            (`Thumbnail` zaten yer tutucu çiziyor) — kayan bir sütun, tarama düzenini görselin
            kendisinden çok bozar. Ham `<img>` yazılmıyor: kutu ortak havuzda. */}
        <Thumbnail src={r.imageUrl} alt="" size={36} />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
          <span className="flex items-center gap-1.5 font-ops-body text-ops-xs text-ops-muted">
            <span className="truncate">
              {r.categoryName} · {r.batches.length === 0 ? 'parti yok' : `${r.batches.length} parti`}
              {/* Satılamaz olmak stoğu yok saymaz — mal duruyor, satışı kapalı. İkisini ayırmak, "neden
                  satmıyorum" sorusunu ekranda cevaplar. */}
              {r.status === 'passive' ? ' · ürün pasif' : r.status === 'candidate' ? ' · aday ürün' : ''}
              {r.variantActive ? '' : ' · boy kapalı'}
            </span>
            {/* "N depoda" — sayı DİZİDEN okunur, ayrıca tutulmaz: iki gerçek ayrışamaz. Tek depoda
                doğrudan kod yazılır, çünkü "1 depoda" hiçbir şey söylemez. */}
            {warehouse.showSplit && r.warehouses.length > 0 ? (
              <Badge tone="blue" className="flex-none font-ops-mono">
                {r.warehouses.length > 1 ? `${r.warehouses.length} depoda` : r.warehouses[0]?.code}
                {r.warehouses.length > 1 ? (openVariantId === r.variantId ? ' ▴' : ' ▾') : ''}
              </Badge>
            ) : null}
          </span>
        </div>
      </div>
    ),
    available: (r) => (
      <div className="flex flex-col items-end gap-px">
        <span
          className={`font-ops-mono text-ops-base ${r.availableQty === 0 ? 'text-ops-red' : 'text-ops-ink'}`}
          title="Fiili − aktif rezervasyon"
        >
          {r.availableQty}
        </span>
        {r.belowMin ? (
          <span className="font-ops-mono text-ops-micro text-ops-amber" title="Sipariş eşiğinin altında">
            eşik {r.minStockQty}
          </span>
        ) : null}
      </div>
    ),
    reserved: (r) => (
      <span className="font-ops-mono text-ops-sm text-ops-muted" title="Siparişe ayrılmış — mal depoda duruyor ama satılabilir değil">
        {r.reservedQty}
      </span>
    ),
    physical: (r) => <span className="font-ops-mono text-ops-sm text-ops-muted">{r.physicalQty}</span>,
    nearest: (r) => {
      if (!r.nearest) return <span className="font-ops-body text-ops-xs text-ops-faint">stok yok</span>;
      const badge = expiryBadge(r.nearest);
      return (
        <div className="flex flex-col items-end gap-px">
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <span className="font-ops-mono text-ops-micro text-ops-muted">{shortDate(r.nearest.expiryDate)}</span>
        </div>
      );
    },
  });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col border-r border-ops-line">
        <Table
          busy={navPending}
          columns={columns}
          rows={levels}
          rowKey={(r) => r.variantId}
          onRowClick={(r) => {
            onSelect(r.variantId);
            // Kırılım YALNIZ çok depolu satırda açılır; tek depolu satırda açacak bir şey yok ve
            // tıklama seçimden ibaret kalır.
            if (warehouse.showSplit && r.warehouses.length > 1) onToggleSplit(r.variantId);
          }}
          isRowActive={(r) => r.variantId === selectedId}
          renderSubRow={(r) =>
            warehouse.showSplit && openVariantId === r.variantId && r.warehouses.length > 1 ? (
              <WarehouseSplit row={r} />
            ) : null
          }
          empty={
            <div className="flex flex-1 items-center justify-center p-10">
              <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen boy yok — süzgeci gevşetin.</span>
            </div>
          }
          footer={<LoadMoreSentinel hasMore={hasMoreLevels} loading={loadingLevels} onLoadMore={onLoadMoreLevels} />}
        />
      </div>

      {/* Sağ panel SEÇİLİ ÜRÜNÜN geçmişi (22.30). Burada karar kuyruğunun ilk üçü duruyordu ve tamamı
          bir sekme ötedeydi; ekranın en geniş boş alanı artık başka hiçbir yerde cevabı olmayan bir
          soruya ayrılıyor. Aciliyet başlık satırında sayıyla ve kendi sekmesinde duruyor. */}
      <ProductHistoryPanel
        row={selected}
        warehouseNames={warehouseNames}
        // Depo adı yalnız çok depolu bakışta anlamlı — tek depoda aynı bilgi gürültüdür (eksen kural 4).
        // Süzgeç aktifken de gereksiz: panelin tamamı zaten o depo ve başlıkta yazıyor.
        showWarehouse={(warehouse.showSplit || warehouse.available) && warehouse.active === null}
        warehouseFilter={warehouseFilter}
        warehouseFilterName={warehouse.active?.name ?? null}
      />
    </div>
  );
}

/**
 * Depo kırılımı — satırın altında açılan blok.
 *
 * Sayılar satırın toplamının parçalarıdır, ayrı bir okuma değil (`toLevelRows`). Blok bir KARAR
 * yeri değil bir bakış: transfer kararı burada verilmez, çünkü karar iki deponun ihtiyacını
 * karşılaştırmayı gerektirir ve o karşılaştırma Transfer ekranının işidir.
 */
function WarehouseSplit({ row }: { row: StockLevelRow }) {
  /**
   * **KIRILIM TABLONUN KENDİ IZGARASINI KULLANIR** (22.33, kullanıcı tespiti 14.08).
   *
   * Blok kendi `flex` düzenini kurmuştu ve sayıları elle verilmiş genişliklerle sağa itiyordu:
   * "ayrılmış" değeri Ayrılmış sütununun altına denk gelmiyordu, ötekiler de kaymıştı. Kırılım
   * satırın PARÇASIDIR — aynı sütunların altında durmalı, yoksa okuyan hangi sayının hangi başlığa
   * ait olduğunu göz kararı eşleştirir.
   *
   * Şablon, dolgu ve sütun boşluğu tablonunkiyle BİREBİR aynı kaynaktan (`STOCK_COLUMN_TRACKS` +
   * `templateOf`); iskeletin elle yazılmış ölçüleri tutmadığında yaşanan hatanın aynısı
   * (`table-columns` künyesi).
   */
  return (
    <div className="flex flex-col gap-1.5 border-b border-ops-line-soft bg-ops-subtle py-2.5">
      {row.warehouses.map((w) => (
        <div
          key={w.warehouseId}
          style={{ gridTemplateColumns: templateOf(STOCK_COLUMN_TRACKS) }}
          className="grid items-center gap-x-2.5 px-5"
        >
          {/* Girinti 46px = görsel (36) + boşluk (10): kırılım satırları ürün ADININ hizasından
              başlıyor, görselin altından değil — böylece "bunlar o ürünün parçası" okunuyor. */}
          <span className="flex min-w-0 items-center gap-2 pl-[46px]">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-ops-blue" />
            <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-strong">
              {w.name} <span className="font-ops-mono text-ops-micro text-ops-muted">{w.code}</span>
            </span>
          </span>
          <span className="justify-self-end font-ops-mono text-ops-xs text-ops-ink">{w.availableQty}</span>
          <span className="justify-self-end font-ops-mono text-ops-xs text-ops-muted">
            {w.reservedQty > 0 ? w.reservedQty : ''}
          </span>
          <span className="justify-self-end font-ops-mono text-ops-xs text-ops-muted">{w.physicalQty}</span>
          <span className="justify-self-end font-ops-mono text-ops-micro text-ops-muted">
            {w.nearestExpiry ? shortDate(w.nearestExpiry) : ''}
          </span>
        </div>
      ))}
      <span className="pl-[66px] pr-5 font-ops-body text-ops-micro text-ops-faint">
        Transfer kararı burada verilmez — Transfer ekranından. Eşik ve karar kuyruğu depo bazlıdır,
        yaklaşan tarihli sekmesinde deposuyla görünür.
      </span>
    </div>
  );
}

