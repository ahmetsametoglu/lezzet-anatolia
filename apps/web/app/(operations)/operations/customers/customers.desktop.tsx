'use client';

import { Badge } from '@/components/operation/ui/badge';
import { CUSTOMERS_COLUMN_TRACKS } from './customers-columns';
import { Chip } from '@/components/operation/ui/chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { CustomerPreview } from './components/customer-preview';
import { statusHint, statusOf, typeTone } from './customers-labels';
import { CustomerTypeEnum } from '@lezzet/types';
import { CUSTOMER_SCOPES, MARKETING_CHANNELS, MARKETING_CHANNEL_LABEL, SCOPE_LABEL, TYPE_LABEL } from './customers-url';
import type { CustomerRow, CustomersViewProps } from './customers-types';

// Müşteriler — liste + seçili önizleme paneli (ürünler ekranının deseni, 1.95fr / 1fr).
// Geri dönüşsüz işlemler (birleştirme, GDPR) ve izin görünümü buraya ait. Operasyon web'i
// masaüstü-yalnız; mobil deneyim native uygulamada (`docs/uygulama`).
//
// Sütun sırası kararın sırası: KİM (ad + telefon — telefon kimlik anahtarıdır) → NE TÜR → HANGİ HÂLDE.

const COLUMNS: Column<CustomerRow>[] = withCells<CustomerRow>(CUSTOMERS_COLUMN_TRACKS, {
  // Avatar YOK: tasarımın web listesi iki satırlık metin (ad + telefon). Avatar yalnız önizleme
  // panelinde var — listede de göstermek satırı gereksiz şişiriyordu.
  name: (r) => (
    <span className="flex min-w-0 flex-col gap-px">
      <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.name}</span>
      {/* Telefon ADIN ALTINDA ve MONO: operatör WhatsApp yazışırken satırı telefondan tanır. */}
      <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{r.phone ?? r.email ?? '—'}</span>
    </span>
  ),
  // Renk ANLAM taşır (envanter O6): B2C olive, B2B amber. Nötr gri bir kanal rozeti, listeyi
  // tarayan gözün hiç kullanmadığı bir rozet olur.
  type: (r) => <Badge tone={typeTone(r.type)}>{TYPE_LABEL[r.type]}</Badge>,
  status: (r) => {
    const s = statusOf(r);
    return (
      <span title={statusHint(r)}>
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      </span>
    );
  },
});

export function CustomersDesktop(props: CustomersViewProps) {
  const { data, rows, urlState, search, onSearch, onScope, onType, onChannel, hasMore, loadingMore, onLoadMore, navPending } = props;
  const { selectedId, onSelect, detail, detailLoading, detailError, onOpenOrder, onEditCredit, onEdit, onOpenB2b, saving, saveError } = props;
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
      <PageHeader
        title="Müşteriler"
        subtitle={subtitle}
        search={{ value: search, onChange: onSearch, placeholder: 'Telefon / ad ara' }}
      />

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

      {/* Kanal daraltması YALNIZ pazarlama kümesi seçiliyken — ve ikinci bir sırada, çip sırasının
          içinde değil: kanal bir daraltma değil, seçili kümenin İÇİNDEKİ bir ayrım. Aynı sıraya
          konsaydı "E-posta" çipi "Vadeli"nin kardeşi gibi okunurdu; oysa biri kimi gösterdiğimizi,
          öteki hangi izne baktığımızı söylüyor.
          Ayrım şart (tasarım §2): e-postaya izin verenle WhatsApp'a izin veren aynı küme değil. */}
      {urlState.scope === 'marketing' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2">
          <span className="font-ops-body text-ops-xs text-ops-muted">İzin kanalı</span>
          {MARKETING_CHANNELS.map((c) => (
            <Chip key={c} active={urlState.mc === c} onClick={() => onChannel(c)}>
              {MARKETING_CHANNEL_LABEL[c]}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <Table
            busy={navPending}
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => onSelect(r.id)}
            isRowActive={(r) => r.id === selectedId}
            empty={
              <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-ops-base text-ops-faint">
                {search || urlState.scope !== 'all' || urlState.type !== 'all' ? 'Bu ölçüte uyan müşteri yok.' : 'Henüz müşteri kaydı yok.'}
              </div>
            }
            footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
          />
        </div>
        <CustomerPreview
          row={selected}
          detail={detail}
          loading={detailLoading}
          detailError={detailError}
          saving={saving}
          saveError={saveError}
          onOpenOrder={onOpenOrder}
          onEditCredit={onEditCredit}
          onEdit={onEdit}
          onOpenB2b={onOpenB2b}
        />
      </div>
    </div>
  );
}
