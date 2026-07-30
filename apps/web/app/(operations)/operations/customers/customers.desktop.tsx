'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Table, type Column } from '@/components/operation/ui/table';
import { CustomerPreview } from './components/customer-preview';
import { statusHint, statusOf, typeTone } from './customers-labels';
import { CustomerTypeEnum } from '@lezzet/types';
import { CUSTOMER_SCOPES, SCOPE_LABEL, TYPE_LABEL } from './customers-url';
import type { CustomerRow, CustomersViewProps } from './customers-types';

// Müşteriler — web: liste + seçili önizleme paneli (ürünler ekranının deseni, 1.95fr / 1fr).
// Tasarımın "Web → tam detay" kuralı: geri dönüşsüz işlemler (birleştirme, GDPR) ve izin görünümü
// buraya ait; mobil bilinçli olarak daha dar (bkz. `customers.mobile`).
//
// Sütun sırası kararın sırası: KİM (ad + telefon — telefon kimlik anahtarıdır) → NE TÜR → HANGİ HÂLDE.

const COLUMNS: Column<CustomerRow>[] = [
  {
    key: 'name',
    header: 'Müşteri',
    width: 'minmax(120px,1fr)',
    // Avatar YOK: tasarımın web listesi iki satırlık metin (ad + telefon). Avatar yalnız mobil
    // listede ve önizleme panelinde var — listede de göstermek satırı gereksiz şişiriyordu.
    cell: (r) => (
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.name}</span>
        {/* Telefon ADIN ALTINDA ve MONO: operatör WhatsApp yazışırken satırı telefondan tanır. */}
        <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{r.phone ?? r.email ?? '—'}</span>
      </span>
    ),
  },
  {
    key: 'type',
    header: 'Tip',
    width: '70px',
    align: 'center',
    // Renk ANLAM taşır (envanter O6): B2C olive, B2B amber. Nötr gri bir kanal rozeti, listeyi
    // tarayan gözün hiç kullanmadığı bir rozet olur.
    cell: (r) => <Badge tone={typeTone(r.type)}>{TYPE_LABEL[r.type]}</Badge>,
  },
  {
    key: 'status',
    header: 'Durum',
    width: '96px',
    align: 'right',
    cell: (r) => {
      const s = statusOf(r);
      return (
        <span title={statusHint(r)}>
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        </span>
      );
    },
  },
];

export function CustomersDesktop(props: CustomersViewProps) {
  const { data, rows, urlState, search, onSearch, onScope, onType, hasMore, loadingMore, onLoadMore } = props;
  const { selectedId, onSelect, detail, detailLoading, onOpenOrder, onEditCredit, onEdit, saving, saveError } = props;
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const { total, draft } = data.counts;

  // Alt başlık SUNUCU sayaçlarından: liste sayfalı olduğu için client görünen satırlardan türetemez
  // (türetse "312 müşteri" yerine "30 müşteri" yazardı). Sıfır olan parça HİÇ yazılmaz — "0 taslak"
  // okunacak bir bilgi değil, gürültü.
  const subtitle = [
    `${total} müşteri`,
    ...(draft > 0 ? [`${draft} taslak (birleştirme adayı)`] : []),
    ...(data.counts.overdue > 0 ? [`${data.counts.overdue} gecikmiş vade`] : []),
  ].join(' · ');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Müşteriler" subtitle={subtitle}>
        <SearchInput value={search} onChange={onSearch} placeholder="Telefon / ad ara" className="w-[210px]" />
      </PageHeader>

      {/* Süzgeç çipleri — TEK sıra, ayraçsız (tasarım): Tümü · B2C · B2B · Vadeli · Taslak.
          Tip çipleri "Tümü"nün yanında duruyor çünkü hepsi aynı soruyu daraltıyor ("kimler
          görünsün"); ayrı bir grup ve dikey ayraç tasarımda yok.
          `B2B onay bekleyen` tasarım HTML'inde çizilmemiş ama `admin-musteriler.md` §2 daraltmalar
          arasında istiyor (yerel kopyanın bayat olduğunun işaretlerinden biri) — korunuyor. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2.5">
        <Chip active={urlState.scope === 'all' && urlState.type === 'all'} onClick={() => onScope('all')}>
          {SCOPE_LABEL.all}
        </Chip>
        {CustomerTypeEnum.options.map((t) => (
          <Chip key={t} active={urlState.type === t} onClick={() => onType(urlState.type === t ? 'all' : t)}>
            {TYPE_LABEL[t]}
          </Chip>
        ))}
        {CUSTOMER_SCOPES.filter((s) => s !== 'all').map((s) => (
          <Chip key={s} active={urlState.scope === s} onClick={() => onScope(urlState.scope === s ? 'all' : s)}>
            {SCOPE_LABEL[s]}
          </Chip>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <Table
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => onSelect(r.id)}
            isRowActive={(r) => r.id === selectedId}
            empty={
              <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-ops-base text-ops-faint">
                {search || urlState.scope !== 'all' || urlState.type !== 'all'
                  ? 'Bu ölçüte uyan müşteri yok.'
                  : 'Henüz müşteri kaydı yok.'}
              </div>
            }
            footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
          />
        </div>
        <CustomerPreview
          row={selected}
          detail={detail}
          loading={detailLoading}
          saving={saving}
          saveError={saveError}
          onOpenOrder={onOpenOrder}
          onEditCredit={onEditCredit}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}
