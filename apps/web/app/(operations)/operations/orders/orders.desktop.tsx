'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ordersColumnTracks } from './orders-columns';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { DateFilterChip } from '@/components/operation/ui/date-filter-chip';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { OrderPreview } from './order-preview';
import { WarehouseFilterChip, WarehouseFilterNotice } from '@/components/operation/ui/warehouse-filter-bar';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { Tabs } from '@/components/operation/ui/tabs';
import { amount, money, shortDate } from '@/components/operation/ui/format';
import { contentText, deliveryText, paymentText, paymentToneClass, statusLabel, statusTone, summaryText } from './orders-labels';
import {
  CHANNEL_FILTERS,
  CHANNEL_LABEL,
  CHANNEL_TONE,
  DELIVERY_FILTERS,
  DELIVERY_LABEL,
  ORDERS_PATH,
  ORDER_TABS,
  PAYMENT_FILTERS,
  PAYMENT_LABEL,
  tabLabel,
} from './orders-url';
import type { OrderRow, OrdersViewProps } from './orders-types';

// Siparişler — MASAÜSTÜ ("tezgâh"). Tasarımın sözleşmesi: durum omurgası (sekme sayaçları canlı iş
// kuyruğu), kanal ayrımı, tahsilat sütunu ve satırdan detaya geçiş.
//
// Tablo ORTAK komponenttir (`Table`): sütun genişlikleri tasarımın grid'inden gelir, satır çizimi
// değil. Kendi tablosunu yazan ekran, bir gün başlık hizasını da kaydırır.

export function OrdersDesktop(props: OrdersViewProps) {
  const { rows, pinned, counts, warehouse, urlState, onFilter, search, onSearch, hasMore, loadingMore, onLoadMore, selectedId, onSelect, navPending } =
    props;
  // Seçili kayıt GÖRÜNEN listeden çözülür (ürünler deseni); listede yoksa sunucunun HEDEFLİ okuması
  // (`pinned`, `?o=` bağlantısı sayfa 2+'daki siparişi gösterdiğinde) — o da yoksa panel davete döner.
  const selected = rows.find((r) => r.id === selectedId) ?? (pinned && pinned.id === selectedId ? pinned : null) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Arama HEADER'DA DEĞİL (15.08, kullanıcı kararı — fiyatlar emsali): header sekmelere ve
          süzgeçlere bağlı kontrol taşımaz; arama süzgeç şeridinin sağ ucunda, süzdüğü listenin yanında.
          "+ Sipariş" ise bir SÜZGEÇ DEĞİL, sayfanın eylemidir — yeri burasıdır (09.8).
          KAPIDA SATIŞ BU DÜĞMENİN ARDINDA DEĞİL (26.08): yerinde satış — depo kapısı ve kuryenin
          aracı — native uygulamanın kurye/depo bölümünün işi (`DOMAIN §17`: "Admin yerinde satış
          yapmaz"); `lib/order/quick-sale.ts` orada çağrılacak. Buradaki giriş TELEFONLA gelen
          siparişin masada yazılmasıdır. */}
      <PageHeader title="Siparişler" subtitle={summaryText(counts)}>
        <Link href="/operations/orders/new" className="cursor-pointer">
          <Button variant="primary" size="sm">
            + Sipariş
          </Button>
        </Link>
      </PageHeader>

      {/* Sekmeler = DURUMLAR; sayılar süzgecin TAMAMINDAN gelir (yüklenmiş sayfadan değil). */}
      <Tabs
        items={ORDER_TABS.map((key) => ({
          key,
          label: tabLabel(key),
          count: key === 'all' ? counts.total : (counts.byStatus[key] ?? 0),
        }))}
        active={urlState.tab}
        onSelect={(tab) => onFilter({ tab })}
      />

      {/* Süzgeç şeridi — fiyat/stok ekranlarıyla AYNI desen: sayılı iki-üç seçenek `Chip` (hepsi
          görünür, tek tık), açık uçlu süzgeç `Select variant="chip"` ("+ …" davetiyle). İkisini
          karıştırmak şeridi ekranlar arasında farklı okuturdu. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
        {CHANNEL_FILTERS.map((c) => (
          <Chip key={c} tone={CHANNEL_TONE[c]} active={urlState.chan === c} onClick={() => onFilter({ chan: c })}>
            {CHANNEL_LABEL[c]}
          </Chip>
        ))}
        <span className="ml-1 h-4 w-px bg-ops-line" />
        {/* Süzgeçler `FilterChip` (15.08, kullanıcı bildirimi: "seçtiğim filtreyi kaldıramıyorum"):
            `Select variant="chip"`in süzgeç olarak kullanılmayacağı kitin kendi künyesinde yazılıydı —
            form alanının "boş" hâli yoktur, süzgecin vardır ve TEK tıkla kalkmalıdır. */}
        <FilterChip
          value={urlState.del}
          emptyValue="all"
          placeholder="+ teslim türü"
          menuWidth={150}
          options={DELIVERY_FILTERS.filter((d) => d !== 'all').map((d) => ({ value: d, label: DELIVERY_LABEL[d] }))}
          onChange={(del) => onFilter({ del })}
        />
        <FilterChip
          value={urlState.pay}
          emptyValue="all"
          placeholder="+ tahsilat"
          menuWidth={170}
          options={PAYMENT_FILTERS.filter((p) => p !== 'all').map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))}
          onChange={(pay) => onFilter({ pay })}
        />

        {/* DEPO — bir karar süzgeci değil bir BAKIŞ daraltmasıdır; bu yüzden dolu hâli mavi, olive
            değil. Yalnız bağlam "tüm depolar" iken çizilir (kural 2): tek depolu bir evrende
            daraltacak bir şey yoktur. */}
        {warehouse.available ? (
          <WarehouseFilterChip
            value={urlState.depo}
            onChange={(depo) => onFilter({ depo })}
            options={warehouse.options}
          />
        ) : null}

        {/* TESLİM GÜNÜ artık TAKVİM (15.08, kullanıcı bildirimi): eski kontrol "bugün + 7 gün"lük
            kapalı listeydi — geçmiş bir günü süzmenin yolu yoktu. Takvim her günü açar; okuma yolu
            (`deliveryFrom/To`) zaten herhangi bir tarihi kabul ediyordu, kısıt yalnız ekrandaydı. */}
        <span className="ml-auto flex items-center gap-2">
          <DateFilterChip value={urlState.day} placeholder="+ teslim günü" label="Teslim" onChange={(day) => onFilter({ day })} />
          <SearchInput value={search} onChange={onSearch} placeholder="Referans no, müşteri ara" size="sm" className="w-[230px]" />
        </span>
      </div>

      <WarehouseFilterNotice
        active={warehouse.active}
        dropped={warehouse.dropped}
        detail={`sekme sayıları ve alt toplam tüm depoların gerçeğidir, tablo bu deponun ${rows.length} satırını gösteriyor.`}
        onClear={() => onFilter({ depo: '' })}
      />

      {/* Liste + seçili panel (15.08, kullanıcı kararı — ürünler ekranının deseni): hızlı bakış
          artık pencere değil sağ sütun; liste görünür kalır, seçim satırdan satıra tek tıkla gezer. */}
      <div className="grid min-h-0 flex-1 grid-cols-[2.1fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <Table
            busy={navPending}
            columns={columnsOf(warehouse.showColumn)}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => onSelect(r.id)}
            empty={
              <div className="flex flex-1 items-center justify-center p-10">
                <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen sipariş yok.</span>
              </div>
            }
            footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
          />
        </div>
        <OrderPreview row={selected} />
      </div>

      {/* Alt şerit — tasarımın özeti. Sayılar SÜZGECİN TAMAMINA ait; "kaydırdıkça yüklenir" notu
          listenin bir parçasının görünür olduğunu söyler. */}
      <div className="flex items-center justify-between gap-4 border-t border-ops-line bg-ops-subtle px-6 py-3">
        {/* TUTARLAR ŞERİDİN EN KOYU ÖĞESİ (tasarım): çevresindeki metin sönük (`muted`), toplam
            `ink`. Tutarı gövde tonunda yazmak şeridi tek renge indirip sayıyı cümlenin içinde
            kaybediyordu — göz önce rakamı bulmalı. */}
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {counts.total} sipariş · toplam <strong className="font-ops-mono font-medium text-ops-ink">{money(counts.totalCents)}</strong>
          {counts.codCount > 0 ? (
            <>
              {' · kapıda tahsilat '}
              <strong className="font-ops-mono font-medium text-ops-amber">{money(counts.codOpenCents)}</strong>
              {` (${counts.codCount} sipariş)`}
            </>
          ) : null}
        </span>
        <span className="font-ops-body text-ops-micro text-ops-faint">{rows.length} satır yüklendi · kaydırdıkça yüklenir</span>
      </div>
    </div>
  );
}

/**
 * Sütunlar tasarımın grid'i: no · müşteri · tutar · kanal · (depo) · teslim · durum · tahsilat.
 *
 * Depo hücresi şerit olmadığında da tanımlı kalır ve bu zararsız: `withCells` yalnız şeritteki
 * anahtarları çizer. Hücreyi de koşullu yapmak, aynı kararı iki yerde tutmak olurdu.
 */
const CELLS: Record<string, (row: OrderRow) => ReactNode> = {
  // NUMARA DOĞRUDAN DETAYA gider; satırın gerisi hızlı bakışı açar. İki niyet iki hedef: "şu
  // siparişle işim var" ile "bu satır neydi?" aynı tıklamayla karşılanamaz. Tıklama satıra
  // YAYILMAZ — yoksa arkada pencere de açılırdı.
  no: (row) => (
    <Link
      href={`${ORDERS_PATH}/${row.id}`}
      onClick={(e) => e.stopPropagation()}
      className="cursor-pointer font-ops-mono text-ops-xs text-ops-muted transition-colors hover:text-ops-olive-dark hover:underline"
    >
      {row.referenceNo ?? '—'}
    </Link>
  ),
  customer: (row) => (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">
        {row.customerName}
        {row.isGift ? <span className="ml-1.5 font-ops-display text-ops-micro text-ops-olive">ikram</span> : null}
      </span>
      <span className="truncate font-ops-body text-ops-micro text-ops-muted">{contentText(row)}</span>
    </div>
  ),
  total: (row) => <span className="font-ops-mono text-ops-sm text-ops-ink">{amount(row.totalCents)}</span>,
  channel: (row) => <Badge tone={CHANNEL_TONE[row.channel]}>{row.channel.toUpperCase()}</Badge>,
  // Kod yeter, tam ad künyede (tasarım O3D "sütun" biçimi): sipariş tek depodan çıkar, satırda
  // uzun ad taşımak tarama düzenini bozardı.
  warehouse: (row) =>
    row.warehouse ? (
      <Badge tone="blue" className="font-ops-mono">
        {row.warehouse.code}
      </Badge>
    ) : (
      <span className="font-ops-body text-ops-micro text-ops-faint">—</span>
    ),
  delivery: (row) => {
    const { main, meta } = deliveryText(row, shortDate);
    return (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-xs text-ops-body">{main}</span>
        <span className="truncate font-ops-body text-ops-micro text-ops-muted">{meta}</span>
      </div>
    );
  },
  status: (row) => (
    <Badge tone={statusTone(row.status)} dot>
      {statusLabel(row.status)}
    </Badge>
  ),
  // İKİ SATIR (15.08, panelli dar liste): karar üstte ("Kapıda 16,60 €"), yöntem altta ("nakit").
  // Tek satırken dar kolonda yöntem kırpılıyordu; ayraç (`·`) zaten iki ayrı bilgiyi yapıştırıyordu.
  payment: (row) => {
    const [main, ...rest] = paymentText(row, money).split(' · ');
    return (
      <div className={`flex min-w-0 flex-col gap-px font-ops-mono text-ops-micro ${paymentToneClass(row)}`}>
        <span className="truncate">{main}</span>
        {rest.length > 0 ? <span className="truncate opacity-75">{rest.join(' · ')}</span> : null}
      </div>
    );
  },
};

/** Şerit + hücreler; depo sütunu yalnız çok depolu bakışta (bkz. `ordersColumnTracks`). */
function columnsOf(withWarehouse: boolean): Column<OrderRow>[] {
  return withCells<OrderRow>(ordersColumnTracks(withWarehouse), CELLS);
}
