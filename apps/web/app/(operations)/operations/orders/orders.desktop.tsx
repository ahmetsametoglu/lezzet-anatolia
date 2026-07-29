'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Select } from '@/components/operation/form/select';
import { Table, type Column } from '@/components/operation/ui/table';
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
  deliveryDayOptions,
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
  const { rows, counts, urlState, today, onFilter, search, onSearch, hasMore, loadingMore, onLoadMore, onOpen } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* BEKLEYEN(09.8): başlıktaki "+ Sipariş" girişi — elle sipariş/kapı satışı ekranı yok. Arka
          ucu hazır (`lib/order/quick-sale.ts`) ama düğme bugün açacak bir yer bulamazdı; ölü
          düğme, olmayan sayfaya davet eden linkten daha kötüdür (basılır, hiçbir şey olmaz). */}
      <PageHeader title="Siparişler" subtitle={summaryText(counts)}>
        <SearchInput value={search} onChange={onSearch} placeholder="Referans no, müşteri ara" />
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
        <Select
          variant="chip"
          value={urlState.del === 'all' ? '' : urlState.del}
          onChange={(del) => onFilter({ del: del as OrdersViewProps['urlState']['del'] })}
          placeholder="+ teslim türü"
          options={DELIVERY_FILTERS.map((d) => ({ value: d, label: DELIVERY_LABEL[d] }))}
        />
        <Select
          variant="chip"
          value={urlState.pay === 'all' ? '' : urlState.pay}
          onChange={(pay) => onFilter({ pay: pay as OrdersViewProps['urlState']['pay'] })}
          placeholder="+ tahsilat"
          options={PAYMENT_FILTERS.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))}
        />

        {/* TESLİM GÜNÜ — tasarımın şerit sağındaki "bugün · 24 Tem ▾" kontrolü. Alan URL
            sözleşmesinde baştan vardı ve servise gidiyordu ama ekranda hiçbir kontrolü yoktu:
            yalnız adresi elle yazan kullanabiliyordu. Yazılmış ama bağlanmamış kod. */}
        <span className="ml-auto">
          <Select
            variant="chip"
            value={urlState.day}
            onChange={(day) => onFilter({ day })}
            placeholder="+ teslim günü"
            options={deliveryDayOptions(today)}
          />
        </span>
      </div>

      <Table
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpen(r.id)}
        empty={
          <div className="flex flex-1 items-center justify-center p-10">
            <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen sipariş yok.</span>
          </div>
        }
        footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
      />

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

/** Sütunlar tasarımın grid'i: no · müşteri · tutar · kanal · teslim · durum · tahsilat. */
const COLUMNS: Column<OrderRow>[] = [
  {
    key: 'no',
    header: 'No',
    width: '104px',
    // NUMARA DOĞRUDAN DETAYA gider; satırın gerisi hızlı bakışı açar. İki niyet iki hedef: "şu
    // siparişle işim var" ile "bu satır neydi?" aynı tıklamayla karşılanamaz. Tıklama satıra
    // YAYILMAZ — yoksa arkada pencere de açılırdı.
    cell: (row) => (
      <Link
        href={`${ORDERS_PATH}/${row.id}`}
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer font-ops-mono text-ops-xs text-ops-muted transition-colors hover:text-ops-olive-dark hover:underline"
      >
        {row.referenceNo ?? '—'}
      </Link>
    ),
  },
  {
    key: 'customer',
    header: 'Müşteri',
    width: 'minmax(160px,1fr)',
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">
          {row.customerName}
          {row.isGift ? <span className="ml-1.5 font-ops-display text-ops-micro text-ops-olive">ikram</span> : null}
        </span>
        <span className="truncate font-ops-body text-ops-micro text-ops-muted">{contentText(row)}</span>
      </div>
    ),
  },
  {
    key: 'total',
    header: 'Tutar',
    width: '84px',
    align: 'right',
    cell: (row) => <span className="font-ops-mono text-ops-sm text-ops-ink">{amount(row.totalCents)}</span>,
  },
  {
    key: 'channel',
    header: 'Kanal',
    width: '54px',
    cell: (row) => <Badge tone={CHANNEL_TONE[row.channel]}>{row.channel.toUpperCase()}</Badge>,
  },
  {
    key: 'delivery',
    header: 'Teslim',
    width: 'minmax(110px,140px)',
    cell: (row) => {
      const { main, meta } = deliveryText(row, shortDate);
      return (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-xs text-ops-body">{main}</span>
          <span className="truncate font-ops-body text-ops-micro text-ops-muted">{meta}</span>
        </div>
      );
    },
  },
  {
    key: 'status',
    header: 'Durum',
    width: '116px',
    cell: (row) => (
      <Badge tone={statusTone(row.status)} dot>
        {statusLabel(row.status)}
      </Badge>
    ),
  },
  {
    key: 'payment',
    header: 'Tahsilat',
    width: 'minmax(120px,150px)',
    cell: (row) => (
      <span className={`truncate font-ops-mono text-ops-micro ${paymentToneClass(row)}`}>{paymentText(row, money)}</span>
    ),
  },
];
