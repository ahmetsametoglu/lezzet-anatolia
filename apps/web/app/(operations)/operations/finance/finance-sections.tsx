'use client';

import type { ReactNode } from 'react';
import type { AccountType } from '@lezzet/types';
import { ActionMenu } from '@/components/operation/ui/action-menu';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { DateRangeFilterChip } from '@/components/operation/ui/date-range-filter-chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { amount, dayMonth, money, num } from '@/components/operation/ui/format';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Tabs } from '@/components/operation/ui/tabs';
import { Combobox } from '@/components/operation/form/combobox';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { naturesForDirection, type NatureOption } from '@/components/operation/form/movement-form/schema';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { ACCOUNT_GROUP_LABEL, EXPLAINED_LABEL, MOVEMENT_TYPE_CHIP, MOVEMENT_TYPE_ORDER, NOTES, SUGGESTION_VIEW } from './finance-labels';
import { ledgerRowKey } from './finance-types';
import type { AccountView, DialogKind, MatchOptionsView, MatchRowView, MatchTargetView, MovementRowView, RowEditor } from './finance-types';
import { ALL_ACCOUNTS, type FinanceUrlState } from './finance-url';
import { MovementMatchSelector } from './match-selector';
import { useRowWrites } from './use-row-writes.hook';

// Para ekranının blokları (12.17 düzeni): bakiye şeridi (hesap süzgeci) · sekme ve süzgeç bandı ·
// hareket listesi · banka eşleştirme kuyruğu. Operasyon web'i masaüstü-yalnız (06.08) — telefon
// kartı ve `stacked` kipi söküldü; personelin mobil deneyimi native uygulamada.

/** İşaretli tutarın rengi — giriş olive, çıkış nötr, iade kırmızı. */
export function amountTone(cents: number, isRefund: boolean): string {
  if (isRefund) return 'text-ops-red';
  return cents >= 0 ? 'text-ops-olive-dark' : 'text-ops-ink';
}

/** "+476,00" · "−92,40" — işaret GÖRÜNÜR yazılır, renge bırakılmaz (renk körlüğü + tarama hızı). */
export function signedAmount(cents: number): string {
  return `${cents >= 0 ? '+' : '−'}${amount(Math.abs(cents))}`;
}

/** Ortak carisinin bakiye cümlesi — şema künyesi: eksi = şirket ortağa borçlu, artı = ortak şirkete borçlu. */
function partnerBalanceCaption(cents: number): string {
  if (cents < 0) return 'şirket ortağa borçlu';
  if (cents > 0) return 'ortak şirkete borçlu';
  return 'hesap denk';
}

// ── Bakiye şeridi = hesap süzgeci (12.17) ─────────────────────────────────────────────────────

/**
 * Şeridin grup sırası — kullanıcı isteği (13.09): "benzer şeyler bir arada; banka, kasa birbirinden
 * ayrılsın, arka arkaya gelsin; kapananlar hep en sonda". Toplam en solda: ilk okunacak sayı
 * "elimde ne kadar var".
 */
const ACCOUNT_GROUP_ORDER = ['bank', 'cash', 'provider', 'partner'] as const satisfies readonly AccountType[];

interface AccountStripProps {
  accounts: AccountView[];
  totalCents: number;
  /** Seçili hesap ya da `all` — kart hem bakiyeyi söyler hem listeyi süzer. */
  selected: string;
  onSelect: (acct: string) => void;
}

/**
 * "Param nerede, ne kadar" — tek bakışta; ve 12.17'den beri HESAP SÜZGECİ: karta dokunmak listeyi o
 * hesaba daraltır, "Toplam" kartı daraltmayı kaldırır. Süzgeç çubuğundaki "Hesap" çipleri kalktı —
 * aynı hesabın adı iki yerde yazıyordu (kullanıcı isteği 13.09).
 *
 * Bakiye HAREKETLERDEN gelir, saklanmaz (`account_balance`). Sığmayan şerit yatay kayar; kartlar
 * daralmaz — daralan kartta tutar kırılır ve para sayısının ortasından bölünmesi okuyanı yanıltır.
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
      // ORTAK CARİSİNDE İŞARET CÜMLEYLE (12.12): eksi/artı bir kasada "para var/yok" derken burada
      // borcun YÖNÜNÜ söylüyor — sayıyı tek başına bırakmak operatörü tersten okutur.
      subCaption={account.type === 'partner' ? partnerBalanceCaption(account.balanceCents) : null}
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
  subCaption?: string | null;
  active: boolean;
  dimmed?: boolean;
  onClick: () => void;
}

function AccountCard({ name, balanceCents, caption, subCaption = null, active, dimmed = false, onClick }: AccountCardProps) {
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
      {/* Tutar SARMAZ: binlik ayracı geldikten sonra dar kartta "12.931,53 €" ikiye bölünüyordu — para
          sayısının ortasından kırılması, okuyanı bir an için başka bir sayıya baktırır. */}
      <span className="whitespace-nowrap font-ops-mono text-ops-title tracking-tight text-ops-ink">{money(balanceCents)}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{caption}</span>
      {subCaption ? <span className="font-ops-body text-ops-micro text-ops-muted">{subCaption}</span> : null}
    </button>
  );
}

// ── Sekme ve süzgeç bandı (12.17) ─────────────────────────────────────────────────────────────

interface FinanceToolbarProps {
  urlState: FinanceUrlState;
  /** İzah edilmemiş hareket sayısı (13.09); `null` = sayaç kapısı yok. */
  unexplainedCount: number | null;
  openDocumentCount: number;
  /** Açık hesap sayısı — kapalı eylem gizlenmez, sebebiyle soluk çizilir. */
  writableAccountCount: number;
  onChange: (next: Partial<FinanceUrlState>) => void;
  onOpenDialog: (kind: DialogKind) => void;
}

/**
 * TEK BANT: solda "Hareketler | Belgeler" sekmesi, sağda o sekmenin süzgeçleri, izah sayacı ve
 * EYLEMLER menüsü (kullanıcı isteği 13.09: başlıktaki beş düğme süzgeç satırının en sağına, izah
 * rozetinin yanına, tek menüye). Sayaç bir rozet değil kuyruğun KAPISI: dokununca aynı ölçütle
 * süzülmüş listeye iner. Tarih aralığı iki sekmede aynı anlamda (değer günü · belge günü).
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
            // "+ tip", çizimdeki "+ tür" DEĞİL (13.09): "tür" artık sözlükteki sınıflandırmanın adı
            // ve satırın "+ tür" menüsü aynı ekranda; bu süzgeç kaba tipi süzer.
            <FilterChip
              value={urlState.type}
              emptyValue="all"
              placeholder="+ tip"
              options={MOVEMENT_TYPE_ORDER.map((type) => ({ value: type, label: MOVEMENT_TYPE_CHIP[type] }))}
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
                label: 'Hareket ekle',
                hint: writableAccountCount > 0 ? 'gider, sermaye ya da henüz sınıflandırılmamış para' : 'önce açık bir hesap gerekir',
                disabled: writableAccountCount === 0,
                onSelect: () => onOpenDialog('movement'),
              },
              {
                key: 'transfer',
                label: 'Transfer',
                hint: writableAccountCount >= 2 ? 'hesaptan hesaba — kasadan bankaya, Stripe payout' : 'en az iki açık hesap gerekir',
                disabled: writableAccountCount < 2,
                onSelect: () => onOpenDialog('transfer'),
              },
              { key: 'document', label: 'Belge ekle', hint: 'fatura, fiş, bordro — borç burada doğar, ödeme sonra bağlanır', onSelect: () => onOpenDialog('document') },
              {
                key: 'bankImport',
                label: 'Banka dosyası yükle',
                hint: writableAccountCount > 0 ? 'ekstre satırları eşleştirme kuyruğuna düşer' : 'önce açık bir hesap gerekir',
                disabled: writableAccountCount === 0,
                onSelect: () => onOpenDialog('bankImport'),
              },
              { key: 'dictionary', label: 'Sözlük', hint: 'tür · cari · etiket', onSelect: () => onOpenDialog('dictionary') },
            ]}
          />
        </>
      }
    />
  );
}

// ── Hareket listesi ───────────────────────────────────────────────────────────────────────────

/**
 * Tablo şeridi — başlıklar ve hücreler AYNI diziyi okur, hiza elle tutulmaz. Orta sütun (12.17):
 * tür · cari · etiket — kullanıcı "etiketleri ortadaki boş alana koy, satır yüksekliği artmasın" dedi.
 */
const ROW_GRID = 'grid grid-cols-[56px_minmax(0,1.2fr)_minmax(0,1fr)_96px_minmax(0,112px)_10px] items-center gap-x-3';

interface MovementListProps {
  rows: MovementRowView[];
  /** Boşken basılacak cümle — "hiç yok" ile "bu süzgeçte yok" ayrı cümlelerdir. */
  note: string | null;
  editor: RowEditor;
  selectedKey: string | null;
  onSelect: (row: MovementRowView) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function MovementList({ rows, note, editor, selectedKey, onSelect, hasMore, loadingMore, onLoadMore }: MovementListProps) {
  if (rows.length === 0) return <EmptyState title="Hareket yok" description={note ?? NOTES.emptyLedger} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`${ROW_GRID} border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint`}
      >
        <span>Tarih</span>
        <span>Açıklama</span>
        <span>Tür · cari · etiket</span>
        <span className="text-right">Tutar</span>
        {/* "Tip", "tür" değil (13.09): bu sütun kaba tipi (gider · transfer · sipariş ödemesi) söyler. */}
        <span>Hesap · tip</span>
        <span />
      </div>
      <ul aria-label="Hareketler" className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => {
          const key = ledgerRowKey(row);
          const selected = key === selectedKey;
          return (
            // SATIR TIKLANIR (12.17 · kullanıcı bulgusu: "kayıtların üzerine tıklayınca sağ tarafta bir
            // şey olmuyor") — sağ sütunda hareketin ayrıntısı açılır: karşılığı, belgesi, geri alma.
            <li
              key={key}
              tabIndex={0}
              aria-selected={selected}
              onClick={() => onSelect(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row);
                }
              }}
              className={`${ROW_GRID} cursor-pointer border-b border-ops-line-soft px-6 py-2 outline-none transition-colors focus-visible:bg-ops-subtle ${
                selected ? 'bg-ops-olive-bg' : 'hover:bg-ops-subtle'
              }`}
            >
              <span className="font-ops-mono text-ops-xs text-ops-faint">{dayMonth(row.valueDate)}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
                {row.ref ? <RefLine row={row} /> : null}
              </div>
              <RowCell row={row} editor={editor} />
              <span className={`text-right font-ops-mono text-ops-sm ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
                {signedAmount(row.signedAmountCents)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-ops-body text-ops-xs text-ops-ink">{row.accountName}</span>
                <span className="truncate font-ops-body text-ops-micro text-ops-faint">{row.typeLabel}</span>
              </div>
              <MatchDot explained={row.explained} />
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
 * Satırın ORTA hücresi (12.17) — tür · cari · etiket, tablo hücresi ölçüsünde (`cell`), tek satırda;
 * satır yüksekliği artmaz. muhasebeci deseni: aranabilir menü, dokunuşta yazılır, Kaydet yok; etiket
 * menüsü bütün etiketleri seçilileri işaretli gösterir ve menüde olmayanı oluşturur. Hücrede tek
 * etiket çizilir, kalanı "+N" çipinde sayılır. Tür ve cari yalnız sınıflandırılabilen satırda.
 *
 * GENİŞLİK BÜTÇESİ: hücre dar (1440 pikselde 177px) ve hiçbir kontrol ondan DÜŞMEZ. Tür/cari taşıyan
 * satırda etiket alanı daralmaz ama sınırlıdır (tek çip, adı kesik); tür ve cari kalanı paylaşıp
 * adlarını keser (tam ad sağdaki ayrıntıda). Taşımayan satırda hücrenin tamamı etiketindir. Cari İKİ kat hızlı daralır: satırın izahı türdür, cari çoğu kez açıklamada
 * zaten yazılı. Tür/cari taşıyan satırda etiket daveti "+" (üçüncü bir "+ x" yazısı yer yiyordu).
 * Ölçüldü 13.09: uzun cari adı ("Cabinet Comptable Muller") etiket düğmesini hücrenin dışına itiyordu
 * ve o satırda etiket eklenemiyordu; ilk düzeltmede de tür 41px'e ("Mu…") düşüyordu.
 */
function RowCell({ row, editor }: RowCellProps) {
  const writes = useRowWrites(row, editor);

  return (
    // Hücredeki dokunuş satırı SEÇMEZ: menü açmak ile ayrıntıya gitmek ayrı niyetlerdir. Menü portal
    // ile çizilse de tıklaması React ağacında buraya kabarır — kesilen yer burası.
    <div
      className="flex min-w-0 items-center gap-1 overflow-hidden"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
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

/**
 * İzah noktası (13.09) — `title` ile okunur hâli de var. Bir tur banka mutabakat bayrağını okuyordu
 * ve sistemin kendi yazdığı her tahsilat amber görünüyordu; şimdi "bu satırın ne olduğu biliniyor
 * mu" sorusunu okuyor (`explained`).
 *
 * Tek başına bir renk noktası ekran okuyucuya hiçbir şey söylemez ve renk körü kullanıcıda iki hâl
 * ayrışmaz; `title` + `aria-label` ikisini de kapatıyor.
 */
function MatchDot({ explained, className = '' }: { explained: boolean; className?: string }) {
  const label = explained ? EXPLAINED_LABEL.explained : EXPLAINED_LABEL.unexplained;
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`size-2 rounded-full ${explained ? 'bg-ops-olive' : 'bg-ops-amber'} ${className}`}
    />
  );
}

// ── Banka eşleştirme kuyruğu ──────────────────────────────────────────────────────────────────

interface MatchQueueProps {
  rows: MatchRowView[];
  accountSelected: boolean;
  busyId: string | null;
  /** Tür sözlüğü (13.09) — kartın "Türünü koy" menüsü; yalnız aktif türler. */
  natureOptions: NatureOption[];
  /** Sayfanın hedef listesi — kartın seçicisi onu okur, ikinci bir sunucu turu açılmaz. */
  targets: MatchTargetView[];
  onApprove: (row: MatchRowView) => void;
  onApplyTarget: (row: MatchRowView, target: MatchTarget) => void;
  onClassify: (row: MatchRowView, nature: string) => void;
  onDismiss: (row: MatchRowView) => void;
}

/**
 * "Sistem önerir, siz onaylarsınız" — üç hâl, üç ayrı eylem.
 *
 * Kuyruk HESABA bağlıdır (`matchQueue(accountId)`) ve bu doğal: banka dosyası bir hesaba yüklenir,
 * eşleştirme de o hesabın satırları içindir. "Tümü" seçiliyken kuyruk yerine sebebi yazılıyor —
 * boş bir panel, kuyruğun boş olduğu anlamına gelirdi. Tek satırın eşleştirmesi ise hesap seçmeden
 * de yapılır: satıra dokununca sağ panelde (12.17).
 */
export function MatchQueue({ rows, accountSelected, busyId, natureOptions, targets, onApprove, onApplyTarget, onClassify, onDismiss }: MatchQueueProps) {
  if (!accountSelected) {
    return (
      <EmptyState
        title="Eşleştirme için hesap seçin"
        description="Banka dosyası bir hesaba yüklenir; kuyruk da o hesabın satırlarını gösterir. Yukarıdan bir hesap kartı seçin — ya da bir satıra dokunup onu burada tek başına eşleştirin."
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="Kuyruk boş" description={NOTES.allMatched} />;
  }

  return (
    <ul className="flex flex-col gap-3 overflow-y-auto p-4">
      {rows.map((row) => (
        <MatchCard
          key={row.movementId}
          row={row}
          busy={busyId === row.movementId}
          natureOptions={natureOptions}
          targets={targets}
          onApprove={onApprove}
          onApplyTarget={onApplyTarget}
          onClassify={onClassify}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}

interface MatchCardProps extends Pick<MatchQueueProps, 'natureOptions' | 'targets' | 'onApprove' | 'onApplyTarget' | 'onClassify' | 'onDismiss'> {
  row: MatchRowView;
  busy: boolean;
}

const CARD_BUTTON =
  'cursor-pointer rounded-ops-btn border px-3 py-2 font-ops-display text-ops-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60';

function MatchCard({ row, busy, natureOptions, targets, onApprove, onApplyTarget, onClassify, onDismiss }: MatchCardProps) {
  const view = SUGGESTION_VIEW[row.strength];
  // Kartın seçicisi sayfanın hedef listesini okur — kuyruk onu zaten kurdu, ikinci tur yok.
  const options: MatchOptionsView = { row, targets, bankRow: true };
  const selector = (label: string, triggerClassName: string, className?: string) => (
    <MovementMatchSelector
      amountCents={Math.abs(row.signedAmountCents)}
      remainingCents={row.remainingCents}
      linkedDocuments={[]}
      removable={false}
      options={options}
      onApplyTarget={(target) => onApplyTarget(row, target)}
      triggerLabel={label}
      triggerClassName={triggerClassName}
      className={className}
      disabled={busy}
    />
  );

  return (
    <li className="flex flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-surface p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-ops-body text-ops-sm text-ops-ink">{row.bankLine}</span>
        <span className={`shrink-0 font-ops-mono text-ops-base ${amountTone(row.signedAmountCents, false)}`}>
          {signedAmount(row.signedAmountCents)}
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-sm bg-ops-surface-sunken px-2.5 py-2">
        <Badge tone={view.tone} outline className="shrink-0">
          {view.label}
        </Badge>
        <span className="font-ops-body text-ops-xs text-ops-muted">{row.sentence}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {row.strength === 'strong' ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(row)}
              className={`flex-1 ${CARD_BUTTON} border-ops-olive bg-ops-olive text-ops-on-olive hover:bg-ops-olive-dark`}
            >
              {view.action}
            </button>
            {/* **"Düzelt"in asıl işi güçlü adayda:** öneri güçlü ama yanlışsa tek çare "Atla" olurdu —
                o da satırı kuyruktan düşürüp doğru eşleşmeyi de kaybettirirdi. */}
            {selector('Düzelt', `${CARD_BUTTON} border-ops-line-strong text-ops-muted hover:bg-ops-surface-sunken`)}
          </>
        ) : (
          selector(view.action, `w-full ${CARD_BUTTON} border-ops-line-strong text-ops-ink hover:bg-ops-surface-sunken`, 'flex-1')
        )}
        {/* TÜRÜNÜ KOY (13.09 · ikinci karar) — bir kayda bağlanmayan satır tek dokunuşla TEK türle
            sınıflanır: çıkışta gider türü, girişte sermaye ya da gelir türü (satırın yönüne uyanlar). */}
        <Combobox
          variant="chip"
          value=""
          onChange={(nature) => onClassify(row, nature)}
          options={naturesForDirection(natureOptions, row.direction).map(({ value, label }) => ({ value, label }))}
          placeholder="Türünü koy"
          searchPlaceholder="Tür ara…"
          emptyText="Bu yöne uyan tür yok — Sözlük penceresinden ekleyin"
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onDismiss(row)}
          title="Kuyruktan düşür — hareket silinmez, yalnız eşleştirme beklemez"
          className={`${CARD_BUTTON} border-ops-line text-ops-muted hover:bg-ops-surface-sunken`}
        >
          Atla
        </button>
      </div>
    </li>
  );
}
