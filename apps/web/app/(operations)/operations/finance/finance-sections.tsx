'use client';

import type { ReactNode } from 'react';
import type { AccountType } from '@lezzet/types';
import { ActionMenu } from '@/components/operation/ui/action-menu';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { DateRangeFilterChip } from '@/components/operation/ui/date-range-filter-chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { BookIcon, DocumentIcon, NavIcon, PlusIcon, TransferIcon, UploadIcon } from '@/components/operation/ui/icons';
import { amount, dayMonthLong, money, num, weekdayName } from '@/components/operation/ui/format';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Tabs } from '@/components/operation/ui/tabs';
import { Combobox } from '@/components/operation/form/combobox';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { naturesForDirection } from '@/components/operation/form/movement-form/schema';
import { ACCOUNT_GROUP_LABEL, EXPLAINED_LABEL, MOVEMENT_SOURCE_LABEL, MOVEMENT_TYPE_CHIP, MOVEMENT_TYPE_ORDER, NOTES } from './finance-labels';
import { ledgerRowKey } from './finance-types';
import type { AccountView, DialogKind, MovementRowView, RowEditor } from './finance-types';
import { groupConsecutive } from './finance-read';
import { ALL_ACCOUNTS, type FinanceUrlState } from './finance-url';
import { GroupHeading, ROW_EDGE } from './list-parts';
import { MovementTypeIcon } from './movement-type-icon';
import { MovementMatchCell, type RowMatcher } from './row-actions';
import { useRowWrites } from './use-row-writes.hook';

// Para ekranının blokları: bakiye şeridi (hesap süzgeci), sekme ve süzgeç bandı, hareket listesi. Satırın bütün eylemleri
// satırın kendisindedir.

/** İşaretli tutarın rengi — giriş olive, çıkış nötr, iade kırmızı. */
export function amountTone(cents: number, isRefund: boolean): string {
  if (isRefund) return 'text-ops-red';
  return cents >= 0 ? 'text-ops-olive-dark' : 'text-ops-ink';
}

/** "+476,00" · "−92,40" — işaret GÖRÜNÜR yazılır, renge bırakılmaz (renk körlüğü + tarama hızı). */
export function signedAmount(cents: number): string {
  return `${cents >= 0 ? '+' : '−'}${amount(Math.abs(cents))}`;
}

/** Ortak carisinde eksi şirketin ortağa, artı ortağın şirkete borcudur; öteki hesapta işaret borcun yönünü söylemez. */
function partnerBalanceTone(cents: number): string {
  if (cents < 0) return 'text-ops-red';
  if (cents > 0) return 'text-ops-olive-dark';
  return 'text-ops-ink';
}

// ── Bakiye şeridi = hesap süzgeci ─────────────────────────────────────────────────────

/** Şeridin grup sırası: benzer hesaplar bir arada, kapananlar en sonda; toplam en solda, çünkü ilk okunan sayıdır. */
const ACCOUNT_GROUP_ORDER = ['bank', 'cash', 'provider', 'partner'] as const satisfies readonly AccountType[];

interface AccountStripProps {
  accounts: AccountView[];
  totalCents: number;
  /** Seçili hesap ya da `all` — kart hem bakiyeyi söyler hem listeyi süzer. */
  selected: string;
  onSelect: (acct: string) => void;
}

/**
 * Kart bakiyeyi söyler ve listeyi o hesaba daraltır; bakiye hareketlerden gelir. Sığmayan şerit yatay kayar, kartlar daralmaz,
 * çünkü daralan kartta tutar sayının ortasından kırılır.
 */
export function AccountStrip({ accounts, totalCents, selected, onSelect }: AccountStripProps) {
  const groups = ACCOUNT_GROUP_ORDER.map((type) => ({
    type,
    items: accounts.filter((account) => account.isActive && account.type === type),
  })).filter((group) => group.items.length > 0);
  const closed = accounts.filter((account) => !account.isActive);

  return (
    <div className="flex items-stretch gap-3 overflow-x-auto border-b border-ops-line-soft bg-ops-surface-sunken px-6 py-3">
      <AccountGroup label="Tümü" first>
        <AccountCard
          name={<span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-olive-dark">Toplam</span>}
          balanceCents={totalCents}
          caption={`${num(accounts.length)} hesap`}
          active={selected === ALL_ACCOUNTS}
          onClick={() => onSelect(ALL_ACCOUNTS)}
        />
      </AccountGroup>
      {groups.map((group) => (
        <AccountGroup key={group.type} label={ACCOUNT_GROUP_LABEL[group.type]}>
          {group.items.map((account) => (
            <AccountTile key={account.id} account={account} active={selected === account.id} onSelect={onSelect} />
          ))}
        </AccountGroup>
      ))}
      {/* Kapananlar HEP EN SONDA ve soluk: geçmişleri okunur, yeni harekete kapalıdırlar. */}
      {closed.length > 0 ? (
        <AccountGroup label="Kapalı">
          {closed.map((account) => (
            <AccountTile key={account.id} account={account} active={selected === account.id} onSelect={onSelect} dimmed />
          ))}
        </AccountGroup>
      ) : null}
    </div>
  );
}

interface AccountGroupProps {
  label: string;
  /** İlk grup ayraç çizmez — şeridin başıdır. */
  first?: boolean;
  children: ReactNode;
}

function AccountGroup({ label, first = false, children }: AccountGroupProps) {
  return (
    <div className={`flex shrink-0 flex-col gap-1 ${first ? '' : 'border-l border-ops-line pl-3'}`}>
      <span className="px-1 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-faint">{label}</span>
      <div className="flex items-stretch gap-1.5">{children}</div>
    </div>
  );
}

interface AccountTileProps {
  account: AccountView;
  active: boolean;
  dimmed?: boolean;
  onSelect: (acct: string) => void;
}

function AccountTile({ account, active, dimmed = false, onSelect }: AccountTileProps) {
  return (
    <AccountCard
      name={
        <Badge tone={account.tone} dot>
          {account.name}
        </Badge>
      }
      balanceCents={account.balanceCents}
      caption={account.movementCount > 0 ? `${num(account.movementCount)} hareket` : 'henüz hareket yok'}
      // Ortak carisinde işaret borcun yönünü söyler; renk o yönü sayının kendisinde okutur.
      balanceTone={account.type === 'partner' ? partnerBalanceTone(account.balanceCents) : undefined}
      active={active}
      dimmed={dimmed}
      onClick={() => onSelect(account.id)}
    />
  );
}

interface AccountCardProps {
  name: ReactNode;
  balanceCents: number;
  caption: string;
  /** Bakiyenin rengi (sınıf) — varsayılan mürekkep; ortak carisinde işarete göre (`partnerBalanceTone`). */
  balanceTone?: string;
  active: boolean;
  dimmed?: boolean;
  onClick: () => void;
}

function AccountCard({ name, balanceCents, caption, balanceTone = 'text-ops-ink', active, dimmed = false, onClick }: AccountCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-[172px] shrink-0 cursor-pointer flex-col gap-1 rounded-ops-card border px-3.5 py-2.5 text-left transition-colors ${
        active ? 'border-ops-olive bg-ops-card' : 'border-transparent hover:border-ops-line-strong hover:bg-ops-card'
      } ${dimmed ? 'opacity-70' : ''}`}
    >
      <span className="flex min-h-[20px] min-w-0 items-center">{name}</span>
      {/* Tutar sarmaz: sayının ortasından kırılan para okuyanı bir an başka bir sayıya baktırır. */}
      <span className={`whitespace-nowrap font-ops-mono text-ops-title tracking-tight ${balanceTone}`}>{money(balanceCents)}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{caption}</span>
    </button>
  );
}

// ── Sekme ve süzgeç bandı ─────────────────────────────────────────────────────────────

interface FinanceToolbarProps {
  urlState: FinanceUrlState;
  /** İzah edilmemiş hareket sayısı; `null` = sayaç kapısı yok. */
  unexplainedCount: number | null;
  openDocumentCount: number;
  /** Açık hesap sayısı — kapalı eylem gizlenmez, sebebiyle soluk çizilir. */
  writableAccountCount: number;
  onChange: (next: Partial<FinanceUrlState>) => void;
  onOpenDialog: (kind: DialogKind) => void;
}

/**
 * Tek bant: solda sekme, sağda süzgeçler, izah sayacı ve eylemler menüsü. Sayaç kuyruğun kapısıdır, dokununca aynı ölçütle süzülmüş
 * listeye iner; tarih aralığı iki sekmede aynı anlamdadır (değer günü · belge günü).
 */
export function FinanceToolbar({ urlState, unexplainedCount, openDocumentCount, writableAccountCount, onChange, onOpenDialog }: FinanceToolbarProps) {
  const unexplainedActive = urlState.scope === 'unmatched';

  return (
    <Tabs
      items={[
        { key: 'movements', label: 'Hareketler' },
        // Rozet AÇIK belge sayısı: ödenmemiş fatura bir iştir ("burada senden bir şey bekleniyor").
        { key: 'documents', label: 'Belgeler', badge: openDocumentCount },
      ]}
      active={urlState.tab}
      onSelect={(tab) => onChange({ tab })}
      action={
        <>
          {urlState.tab === 'movements' ? (
            // "+ tip", çünkü "tür" sözlükteki sınıflandırmanın adı ve satırın "+ tür" menüsü aynı ekranda; bu süzgeç kaba tipi süzer.
            <FilterChip
              value={urlState.type}
              emptyValue="all"
              placeholder="+ tip"
              options={MOVEMENT_TYPE_ORDER.map((type) => ({ value: type, label: MOVEMENT_TYPE_CHIP[type], icon: <MovementTypeIcon type={type} size={14} /> }))}
              menuWidth={210}
              onChange={(type) => onChange({ type })}
            />
          ) : (
            <Chip active={urlState.open} onClick={() => onChange({ open: !urlState.open })}>
              Yalnız açık
            </Chip>
          )}
          <DateRangeFilterChip from={urlState.from} to={urlState.to} placeholder="+ tarih" label="Tarih" onChange={(from, to) => onChange({ from, to })} />
          {/* Sayaç `null` ise HİÇ BASILMAZ — "0 izahsız" yazmak, sayacı olmayan bir ekranda dolu bir
              iş kuyruğunu "her şey izahlı" diye okuturdu (CLAUDE.md §1: ölçülemeyen değer sıfır değil). */}
          {unexplainedCount === null ? null : (
            <Chip
              active={unexplainedActive}
              tone={unexplainedCount > 0 ? 'amber' : 'olive'}
              onClick={() => onChange({ tab: 'movements', scope: unexplainedActive ? ALL_ACCOUNTS : 'unmatched' })}
            >
              {unexplainedCount > 0 ? `${num(unexplainedCount)} izah bekleyen hareket` : 'Her şey izahlı'}
            </Chip>
          )}
          <ActionMenu
            label="Eylemler"
            items={[
              {
                key: 'movement',
                icon: <NavIcon name="para" />,
                label: 'Hareket ekle',
                hint: writableAccountCount > 0 ? 'gider, sermaye ya da henüz sınıflandırılmamış para' : 'önce açık bir hesap gerekir',
                disabled: writableAccountCount === 0,
                onSelect: () => onOpenDialog('movement'),
              },
              {
                key: 'transfer',
                icon: <TransferIcon />,
                label: 'Transfer',
                hint:
                  writableAccountCount >= 2 ? 'hesaptan hesaba — kasadan bankaya, kart ödemeleri aktarımı' : 'en az iki açık hesap gerekir',
                disabled: writableAccountCount < 2,
                onSelect: () => onOpenDialog('transfer'),
              },
              { key: 'document', icon: <DocumentIcon />, label: 'Belge ekle', hint: 'fatura, fiş, bordro — borç burada doğar, ödeme sonra bağlanır', onSelect: () => onOpenDialog('document') },
              {
                key: 'bankImport',
                icon: <UploadIcon />,
                label: 'Banka dosyası yükle',
                hint: writableAccountCount > 0 ? 'ekstre satırları listeye izah bekleyen olarak düşer' : 'önce açık bir hesap gerekir',
                disabled: writableAccountCount === 0,
                onSelect: () => onOpenDialog('bankImport'),
              },
              { key: 'dictionary', icon: <BookIcon />, label: 'Sözlük', hint: 'tür · cari · etiket', onSelect: () => onOpenDialog('dictionary') },
              {
                key: 'account',
                icon: <PlusIcon />,
                label: 'Hesap ekle',
                hint: 'banka hesabı, kasa, ödeme sağlayıcı ya da ortak cari',
                onSelect: () => onOpenDialog('account'),
              },
            ]}
          />
        </>
      }
    />
  );
}

// ── Hareket listesi ───────────────────────────────────────────────────────────────────────────

/** Başlıklar ve hücreler aynı diziyi okur, hiza elle tutulmaz. Tutar satırın en büyük yazısıdır ve sağ kenardadır. */
const ROW_GRID = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,180px)_132px] items-center gap-x-3';

interface MovementListProps {
  rows: MovementRowView[];
  /** Boşken basılacak cümle — "hiç yok" ile "bu süzgeçte yok" ayrı cümlelerdir. */
  note: string | null;
  editor: RowEditor;
  /** Satırın bağ kararları — "Karşılığı" sütununun hapı ve ✓'si. */
  matcher: RowMatcher;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function MovementList({ rows, note, editor, matcher, hasMore, loadingMore, onLoadMore }: MovementListProps) {
  if (rows.length === 0) return <EmptyState title="Hareket yok" description={note ?? NOTES.emptyLedger} />;
  // Yıl yalnız en yeni günün yılından farklı başlıkta yazılır — saat okunmaz (bkz. `dayMonthLong`).
  const newestYear = rows[0]?.valueDate.slice(0, 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`${ROW_GRID} border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint`}
      >
        <span>Açıklama</span>
        <span>Tür · cari · etiket</span>
        <span>Karşılığı</span>
        {/* "Tip", "tür" değil: bu sütun kaba tipi (gider · transfer · sipariş ödemesi) söyler. */}
        <span>Hesap · tip</span>
        <span className="text-right">Tutar</span>
      </div>
      <ul aria-label="Hareketler" className="min-h-0 flex-1 overflow-y-auto">
        {groupConsecutive(rows, (row) => row.valueDate.slice(0, 10)).map((group) => {
          const date = dayMonthLong(group.key, group.key.slice(0, 4) !== newestYear);
          const weekday = weekdayName(group.key);
          return (
            // Gün başlığı yapışkan ve toplamsız — bkz. `GroupHeading`.
            <li key={group.key}>
              <GroupHeading title={date} detail={weekday} />
              <ul aria-label={`${date} ${weekday}`}>
                {group.rows.map((row) => (
                  // Satır seçilmez, her iş satırın kendi kontrolündedir.
                  <li
                    key={ledgerRowKey(row)}
                    className={`${ROW_GRID} border-b border-ops-line-soft px-6 py-2 transition-colors hover:bg-ops-subtle ${row.explained ? '' : ROW_EDGE.amber}`}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {/* Kesilen açıklamanın tamamı fareyle üstüne gelince okunur. */}
                      <span title={row.title} className="truncate font-ops-body text-ops-base text-ops-ink">
                        {row.title}
                      </span>
                      {row.ref ? <RefLine row={row} /> : null}
                      {row.explained ? null : <span className="sr-only">{EXPLAINED_LABEL.unexplained}</span>}
                    </div>
                    <RowCell row={row} editor={editor} />
                    {/* Hücre her satırda durur, bağsız satırda boş kalır; yoksa ızgarada sütunlar bir sola kayar. */}
                    <div className="flex min-w-0 items-center">
                      <MovementMatchCell row={row} matcher={matcher} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-ops-body text-ops-xs text-ops-ink">{row.accountName}</span>
                      {/* Kaynak (ekstre · elle · sistem) tipin yanında. */}
                      <span className="flex min-w-0 items-center gap-1 font-ops-body text-ops-micro text-ops-faint">
                        <MovementTypeIcon type={row.type} size={12} />
                        <span title={`${row.typeLabel} · ${MOVEMENT_SOURCE_LABEL[row.source]}`} className="truncate">
                          {row.typeLabel} · {MOVEMENT_SOURCE_LABEL[row.source]}
                        </span>
                      </span>
                    </div>
                    {/* Rakamlar sağ kenarda alt alta hizalı taranır. */}
                    <span
                      className={`whitespace-nowrap text-right font-ops-mono text-ops-lead font-semibold ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}
                    >
                      {signedAmount(row.signedAmountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {/* Gözcü listenin İÇİNDE: kaydırma kabı bu `ul` — dışında dursaydı hep görünür sayılır ve
            sayfalar kendiliğinden art arda çekilirdi. */}
        <li className="list-none">
          <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
        </li>
      </ul>
    </div>
  );
}

interface RowCellProps {
  row: MovementRowView;
  editor: RowEditor;
}

/**
 * Satırın orta hücresi: tür · cari · etiket tek satırda, satır yüksekliği artmaz; menüde yazılır, Kaydet yok. Hücre dar ve hiçbir
 * kontrol ondan düşmez: etiket tek çip, tür ve cari adlarını keser, cari iki kat hızlı daralır çünkü açıklamada çoğu kez yazılıdır.
 */
function RowCell({ row, editor }: RowCellProps) {
  const writes = useRowWrites(row, editor);

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {row.canClassify ? (
        <>
          <Combobox
            variant="cell"
            tone="olive"
            className="min-w-[1.75rem] max-w-[9.5rem]"
            value={writes.nature ?? ''}
            selectedLabel={writes.natureLabel}
            onChange={(next) => writes.writeNature(next)}
            options={naturesForDirection(editor.natureOptions, row.direction).map(({ value, label }) => ({ value, label }))}
            placeholder="+ tür"
            searchPlaceholder="Tür ara…"
            emptyText="Bu yöne uyan tür yok — Sözlük penceresinden ekleyin"
            onClear={() => writes.writeNature(null)}
            clearLabel="Türü kaldır"
          />
          <Combobox
            variant="cell"
            tone="olive"
            className="min-w-[1.75rem] max-w-[8.5rem] shrink-2"
            value={writes.counterpartyId ?? ''}
            selectedLabel={writes.counterpartyName}
            onChange={(next) => writes.writeCounterparty(next)}
            options={editor.counterpartyOptions.map(({ value, label }) => ({ value, label }))}
            placeholder="+ cari"
            searchPlaceholder="Cari ara…"
            emptyText="Cari yok — Sözlük penceresinden ekleyin"
            onClear={() => writes.writeCounterparty(null)}
            clearLabel="Cariyi kaldır"
          />
        </>
      ) : null}
      <div className={row.canClassify ? 'min-w-0 max-w-[5.5rem] shrink-0' : 'min-w-0'}>
        <MultiSelect
          size="cell"
          maxVisible={1}
          options={writes.tagOptions}
          selected={writes.tags}
          onChange={writes.writeTags}
          addLabel={row.canClassify ? '+' : '+ etiket'}
          addAriaLabel="Etiket ekle"
          searchPlaceholder="Etiket ara ya da yaz…"
          emptyText="Etiket yok"
          onCreate={(label) => void writes.createTag(label)}
        />
      </div>
    </div>
  );
}

function RefLine({ row }: { row: MovementRowView }) {
  const tone = row.refTone === 'olive' ? 'text-ops-olive-dark' : row.refTone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-faint';
  return <span className={`truncate font-ops-body text-ops-micro ${tone}`}>{row.ref}</span>;
}
