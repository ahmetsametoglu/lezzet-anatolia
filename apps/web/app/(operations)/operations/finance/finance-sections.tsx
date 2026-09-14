'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { AccountType } from '@lezzet/types';
import { ActionMenu } from '@/components/operation/ui/action-menu';
import { Button } from '@/components/operation/ui/button';
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
import { naturesForDirection } from '@/components/operation/form/movement-form/schema';
import { ACCOUNT_GROUP_LABEL, EXPLAINED_LABEL, MOVEMENT_TYPE_CHIP, MOVEMENT_TYPE_ORDER, NOTES } from './finance-labels';
import { ledgerRowKey } from './finance-types';
import type { AccountView, DialogKind, MovementRowView, RowEditor } from './finance-types';
import { ALL_ACCOUNTS, type FinanceUrlState } from './finance-url';
import { MovementTypeIcon } from './movement-type-icon';
import { useRowWrites } from './use-row-writes.hook';

// Para ekranının blokları (12.17 düzeni): bakiye şeridi (hesap süzgeci) · sekme ve süzgeç bandı ·
// hareket listesi · izah özeti (12.19: kuyruk kartları kalktı, öneri satırda, onay panelde). Operasyon web'i masaüstü-yalnız (06.08) — telefon
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

/**
 * Ortak carisinin bakiye RENGİ — şema künyesi: eksi = şirket ortağa borçlu (kırmızı), artı = ortak
 * şirkete borçlu (olive). 14.09'da cümlenin yerini aldı (kullanıcı isteği: "artı eksi zaten bunu ifade
 * ediyor"; kart bir satır kısaldı). Öteki hesapta işaret borcun yönünü söylemez, bakiye mürekkep kalır.
 */
function partnerBalanceTone(cents: number): string {
  if (cents < 0) return 'text-ops-red';
  if (cents > 0) return 'text-ops-olive-dark';
  return 'text-ops-ink';
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
      // ORTAK CARİSİNDE İŞARET RENKLE (12.12'de cümleydi, 14.09 renk): eksi/artı bir kasada "para
      // var/yok" derken burada borcun YÖNÜNÜ söylüyor — renk o yönü sayının kendisinde okutur.
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
      {/* Tutar SARMAZ: binlik ayracı geldikten sonra dar kartta "12.931,53 €" ikiye bölünüyordu — para
          sayısının ortasından kırılması, okuyanı bir an için başka bir sayıya baktırır. */}
      <span className={`whitespace-nowrap font-ops-mono text-ops-title tracking-tight ${balanceTone}`}>{money(balanceCents)}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{caption}</span>
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
  // Seçilen satır GÖRÜNÜR kalır (12.19): panel karardan sonra sıradakine geçince ya da "Sıradakini aç"
  // denince açılan satır listenin alt kenarında yarım kalıyordu — operatör neyin açıldığını görmüyordu.
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

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
              ref={selected ? selectedRef : undefined}
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
                <span className="flex min-w-0 items-center gap-1 font-ops-body text-ops-micro text-ops-faint">
                  <MovementTypeIcon type={row.type} size={12} />
                  <span className="truncate">{row.typeLabel}</span>
                </span>
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

interface ExplainSummaryProps {
  /** Hesap-üstü izahsız hareket sayısı — `null` sayaç kapısı yok demek ("bilinmiyor"), sıfır değil. */
  unexplainedCount: number | null;
  /** Yüklü satırlardaki güçlü öneri sayısı — onaya hazır iş. */
  strongCount: number;
  /** Listede açılabilecek izah bekleyen satır var mı. */
  canOpenNext: boolean;
  /** Liste zaten izah bekleyenlere süzülü mü. */
  filtered: boolean;
  onOpenNext: () => void;
  onShowUnexplained: () => void;
}

/**
 * Sağ sütun, satır seçili değilken (12.19 · kullanıcı kararı "tek liste + tek panel"). Banka
 * eşleştirme kuyruğunun kartları kalktı: aynı satırlar solda ve sağda iki ayrı arayüzle duruyordu,
 * kart soldaki satırı bilmiyordu (kullanıcı: "ekranın solu ve sağı birbirinden kopuk"). İş kuyruğu
 * artık listenin kendisi (izah bekleyen süzgeci); öneri satırın ikinci satırında, onay satırın
 * panelinde. Burada yalnız ne kadar iş kaldığı ve sıradakine giden kapı durur.
 */
export function ExplainSummary({ unexplainedCount, strongCount, canOpenNext, filtered, onOpenNext, onShowUnexplained }: ExplainSummaryProps) {
  return (
    <section aria-label="İzah özeti" className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-col gap-0.5">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">İzah bekleyen hareketler</span>
        <span className="font-ops-body text-ops-xs text-ops-faint">sistem önerir, siz onaylarsınız · satıra dokununca ayrıntısı burada açılır</span>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <SummaryFigure label="izah bekleyen" value={unexplainedCount === null ? '—' : num(unexplainedCount)} />
        <SummaryFigure label="bu listede güçlü öneri" value={num(strongCount)} />
      </dl>
      {unexplainedCount === 0 ? (
        <p className="font-ops-body text-ops-sm text-ops-olive-dark">Her hareket izahlı.</p>
      ) : canOpenNext ? (
        <div className="flex flex-col items-start gap-1.5">
          <Button size="sm" onClick={onOpenNext}>
            Sıradakini aç
          </Button>
          <span className="font-ops-body text-ops-xs text-ops-faint">
            Onayladıkça sıradaki satır kendiliğinden açılır; "Atla" satıra bir şey yazmadan geçer.
          </span>
        </div>
      ) : filtered ? (
        <p className="font-ops-body text-ops-sm text-ops-muted">Bu süzgeçte izah bekleyen satır yok.</p>
      ) : (
        <div className="flex">
          <Button variant="secondary" size="sm" onClick={onShowUnexplained}>
            İzah bekleyenleri listele
          </Button>
        </div>
      )}
    </section>
  );
}

interface SummaryFigureProps {
  label: string;
  value: string;
}

function SummaryFigure({ label, value }: SummaryFigureProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-card px-3 py-2.5">
      <dd className="font-ops-mono text-ops-title text-ops-ink">{value}</dd>
      <dt className="font-ops-body text-ops-micro text-ops-faint">{label}</dt>
    </div>
  );
}
