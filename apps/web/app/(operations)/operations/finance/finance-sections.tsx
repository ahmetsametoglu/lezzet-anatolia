'use client';

import { useOptimistic, useTransition } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { amount, dayMonth, money, num } from '@/components/operation/ui/format';
import { Combobox } from '@/components/operation/form/combobox';
import { MultiSelect } from '@/components/operation/form/multi-select';
import {
  naturesForDirection,
  type CounterpartyOption,
  type NatureOption,
  type TagOption,
} from '@/components/operation/form/movement-form/schema';
import {
  EXPLAINED_LABEL,
  MOVEMENT_TYPE_CHIP,
  MOVEMENT_TYPE_ORDER,
  NOTES,
  SUGGESTION_VIEW,
} from './finance-labels';
import { ledgerRowKey } from './finance-types';
import type { AccountView, LedgerView, MatchRowView, MovementRowView } from './finance-types';
import { ALL_ACCOUNTS, FINANCE_PERIODS, PERIOD_LABEL, type FinanceUrlState } from './finance-url';

// Para ekranının blokları — masaüstü ve mobil ikisi de buradan besleniyor.
//
// Cihaz farkı `stacked` gibi PROP'larla taşınıyor, `md:` ile DEĞİL (CLAUDE.md §2 · ADR Sapma 3):
// ölçü sunucudan gelen cihaz ipucuyla biliniyor, akışkan responsive yazılmıyor.

/** İşaretli tutarın rengi — giriş olive, çıkış nötr, iade kırmızı. */
function amountTone(cents: number, isRefund: boolean): string {
  if (isRefund) return 'text-ops-red';
  return cents >= 0 ? 'text-ops-olive-dark' : 'text-ops-ink';
}

/** "+476,00" · "−92,40" — işaret GÖRÜNÜR yazılır, renge bırakılmaz (renk körlüğü + tarama hızı). */
function signedAmount(cents: number): string {
  return `${cents >= 0 ? '+' : '−'}${amount(Math.abs(cents))}`;
}

/** Ortak carisinin bakiye cümlesi — şema künyesi: eksi = şirket ortağa borçlu, artı = ortak şirkete borçlu. */
function partnerBalanceCaption(cents: number): string {
  if (cents < 0) return 'şirket ortağa borçlu';
  if (cents > 0) return 'ortak şirkete borçlu';
  return 'hesap denk';
}

// ── Hesap bakiyeleri şeridi ────────────────────────────────────────────────────────────────────

interface AccountStripProps {
  accounts: AccountView[];
  totalCents: number;
  stacked?: boolean;
}

/**
 * "Param nerede, ne kadar" — tek bakışta.
 *
 * Bakiye HAREKETLERDEN gelir, saklanmaz (`account_balance` görünümü) ve ekran onu yeniden
 * hesaplamaz. Hiç hareketi olmayan hesap 0 gösterir ve bu doğru: kayıt yok demek para yok demektir,
 * "bilinmiyor" demek değil (ölçüm düşmüyor, kayıt hiç yok).
 */
export function AccountStrip({ accounts, totalCents, stacked = false }: AccountStripProps) {
  // Telefonda YATAY ŞERİT, ızgara değil (04.08, `ui:shot` ölçümü): iki sütunlu ızgarada beş hesap
  // altı hücre eder ve ekranın ilk katının tamamını yiyordu — operatör Para'yı açtığında yalnız
  // bakiyeleri görüyor, hareketlere ulaşmak için kaydırıyordu. Oysa telefonun işi (§7) hızlı giriş
  // ve tarama. Toplam ÖNCE geliyor: dar ekranda ilk okunacak sayı "elimde ne kadar var".
  return (
    <div
      className={`border-b border-ops-line-soft bg-ops-surface-sunken ${
        stacked ? 'flex items-stretch gap-4 overflow-x-auto px-4 py-3' : 'flex items-stretch px-6 py-4'
      }`}
    >
      {stacked ? <TotalCell accounts={accounts} totalCents={totalCents} stacked /> : null}
      {accounts.map((account) => (
        <div
          key={account.id}
          className={
            stacked
              ? 'flex shrink-0 flex-col gap-1 border-l border-ops-line-soft pl-4'
              : 'flex flex-1 flex-col gap-1 border-r border-ops-line-soft px-5'
          }
        >
          <span className="flex items-center gap-1.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
            <Badge tone={account.tone} dot>
              {account.name}
            </Badge>
          </span>
          {/* Tutar SARMAZ: binlik ayracı geldikten sonra altı hesaplı bir şeritte son hücre daralıyor
          ve "12.931,53 €" ikiye bölünüyordu — para sayısının ortasından kırılması, okuyanı bir an
          için başka bir sayıya baktırır. */}
      <span className="whitespace-nowrap font-ops-mono text-ops-title tracking-tight text-ops-ink">{money(account.balanceCents)}</span>
          <span className="font-ops-mono text-ops-micro text-ops-faint">
            {account.movementCount > 0 ? `${num(account.movementCount)} hareket` : 'henüz hareket yok'}
          </span>
          {/* ORTAK CARİSİNDE İŞARET CÜMLEYLE (12.12): eksi/artı bir kasada "para var/yok" derken
              burada borcun YÖNÜNÜ söylüyor — sayıyı tek başına bırakmak operatörü tersten okutur. */}
          {account.type === 'partner' ? (
            <span className="font-ops-body text-ops-micro text-ops-muted">{partnerBalanceCaption(account.balanceCents)}</span>
          ) : null}
        </div>
      ))}

      {stacked ? null : <TotalCell accounts={accounts} totalCents={totalCents} />}
    </div>
  );
}

/** Toplam hücresi — masaüstünde şeridin SONUNDA, telefonda BAŞINDA (okuma sırası farklı). */
function TotalCell({ accounts, totalCents, stacked = false }: AccountStripProps) {
  return (
    <div className={stacked ? 'flex shrink-0 flex-col gap-1' : 'flex flex-1 flex-col gap-1 px-5'}>
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-olive-dark">
        Toplam
      </span>
      {/* Tutar SARMAZ: binlik ayracı geldikten sonra altı hesaplı bir şeritte son hücre daralıyor
          ve "12.931,53 €" ikiye bölünüyordu — para sayısının ortasından kırılması, okuyanı bir an
          için başka bir sayıya baktırır. */}
      <span className="whitespace-nowrap font-ops-mono text-ops-title tracking-tight text-ops-ink">{money(totalCents)}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{num(accounts.length)} hesap</span>
    </div>
  );
}

// ── Süzgeç barı ───────────────────────────────────────────────────────────────────────────────

interface FilterBarProps {
  accounts: AccountView[];
  urlState: FinanceUrlState;
  /** İzah edilmemiş hareket sayısı (13.09); `null` = sayaç kapısı yok. */
  unexplainedCount: number | null;
  onChange: (next: Partial<FinanceUrlState>) => void;
  stacked?: boolean;
}

/**
 * Hesap · tip · dönem çipleri + izah sayacı.
 *
 * **Hesap bir daraltmadır, bir eksen değil** — tasarımın tezgâh sözleşmesi bunu yazıyor ve bütün
 * ekranın kurgusu buna dayanıyor: "Tümü" varsayılan, kasa ile bankanın ayrı ekranı yok.
 *
 * Sayaç bir ROZET değil, kuyruğun KAPISI: tıklanınca aynı ölçütle süzülmüş listeye iner. Süs olarak
 * bırakılsaydı operatör gördüğü sayının kümesini açmak için ayrıca aramak zorunda kalırdı.
 */
export function FilterBar({ accounts, urlState, unexplainedCount, onChange, stacked = false }: FilterBarProps) {
  // Adres parametresi `unmatched` kaldı (paylaşılmış bağlantılar kırılmasın), anlamı İZAH kuyruğu.
  const unmatchedActive = urlState.scope === 'unmatched';

  return (
    <div className={`flex flex-wrap items-center gap-2 border-b border-ops-line-soft ${stacked ? 'px-4 py-2.5' : 'px-6 py-3'}`}>
      <span className="mr-0.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-faint">
        Hesap
      </span>
      <Chip active={urlState.acct === ALL_ACCOUNTS} onClick={() => onChange({ acct: ALL_ACCOUNTS })}>
        Tümü
      </Chip>
      {accounts.map((account) => (
        <Chip key={account.id} active={urlState.acct === account.id} onClick={() => onChange({ acct: account.id })}>
          {account.name}
        </Chip>
      ))}

      <span aria-hidden className="mx-1 h-4 w-px bg-ops-line" />

      {/* Tip ve tarih ÇİP DEĞİL seçici: yedi tip ve dört aralık çip olarak basılsaydı bar iki satıra
          taşar ve asıl daraltma olan hesap çipleri arasında kaybolurdu. Tasarımın "+ tür"/"+ tarih"
          kesikli hapları da zaten "buradan bir şey seçilecek" diyor, hepsini birden göstermiyor. */}
      {/* **Ham `<select>` DEĞİL, kitin `Select`i — `variant="chip"`** (CLAUDE.md §2: form kitini
          kullan, ham eleman son çare). İlk yazımda ham `<select>` konmuştu ve iki şeyi birden
          kaybediyordu: tasarımın kesikli "+ …" çip biçimini (kutu, çiplerin yanında yabancı
          duruyordu) ve tarayıcının yerleştirdiği okun hizasını — ok çipin sağ kenarına yapışıyordu.
          Kitin çip kipi tam bu şerit için yazılmış; ikinci bir biçim icat etmeye gerek yoktu.

          Tip süzgeci bir tur ekranda YOKTU (kapısı gelmemişti) — arka uç `LedgerFilter.type`'ı
          açınca bağlandı; süzme sunucuda, yani liste kuyruğuyla birlikte daralıyor.

          Çip "+ tip" diyor, çizimdeki "+ tür" DEĞİL (13.09): "tür" artık sözlükteki sınıflandırmanın
          adı (kira, maaş…) ve satırın "+ tür" menüsü aynı ekranda; bu süzgeç kaba tipi süzer. */}
      <FilterChip
        value={urlState.type}
        emptyValue="all"
        placeholder="+ tip"
        options={MOVEMENT_TYPE_ORDER.map((type) => ({ value: type, label: MOVEMENT_TYPE_CHIP[type] }))}
        onChange={(type) => onChange({ type })}
      />

      <FilterChip
        value={urlState.period}
        emptyValue="all"
        placeholder="+ tarih"
        menuWidth={150}
        options={FINANCE_PERIODS.filter((period) => period !== 'all').map((period) => ({
          value: period,
          label: PERIOD_LABEL[period],
        }))}
        onChange={(period) => onChange({ period })}
      />

      {/* Sayaç `null` ise HİÇ BASILMAZ — "0 izahsız" yazmak, sayacı olmayan bir ekranda dolu bir
          iş kuyruğunu "her şey izahlı" diye okuturdu (CLAUDE.md §1: ölçülemeyen değer sıfır değil). */}
      {unexplainedCount === null ? null : (
        <Chip
          className="ml-auto"
          active={unmatchedActive}
          tone={unexplainedCount > 0 ? 'amber' : 'olive'}
          onClick={() => onChange({ scope: unmatchedActive ? ALL_ACCOUNTS : 'unmatched' })}
        >
          {unexplainedCount > 0 ? `${num(unexplainedCount)} izah bekleyen hareket` : 'Her şey izahlı'}
        </Chip>
      )}
    </div>
  );
}

// ── Hareket listesi ───────────────────────────────────────────────────────────────────────────

/** Tablo şeridi — başlıklar ve hücreler AYNI diziyi okur, hiza elle tutulmaz. */
const ROW_GRID = 'grid grid-cols-[62px_minmax(0,1fr)_100px_120px_14px] items-start gap-x-3';

/**
 * Defter satırının düzenleme sözleşmesi (13.09 · kullanıcı bulgusu: "eşleştirmeyle ilgili düzenleme
 * yapamıyorum") — tür, cari, etiket, belge bağı ve eşleşmeyi geri alma satırın üstünde.
 */
interface RowEditor {
  natureOptions: NatureOption[];
  counterpartyOptions: CounterpartyOption[];
  tagOptions: TagOption[];
  /** Bütün etiketlerin adı (pasifler dâhil) — satır pasif etiketi taşımaya devam eder. */
  tagLabels: ReadonlyMap<string, string>;
  /** Hesabın eşleştirme kuyruğu — satır kuyruktaysa "Bağla…" aynı seçim penceresini açar. */
  queue: MatchRowView[];
  busyId: string | null;
  onSetNature: (movementId: string, nature: string | null) => Promise<boolean>;
  onSetCounterparty: (movementId: string, counterpartyId: string | null) => Promise<boolean>;
  onTag: (movementId: string, tags: string[]) => Promise<boolean>;
  onCreateTag: (label: string) => Promise<string | null>;
  onPick: (row: MatchRowView) => void;
  onUnmatch: (movementId: string) => void;
  onRemoveAllocation: (movementId: string, documentId: string) => void;
}

interface MovementListProps {
  ledger: LedgerView;
  stacked?: boolean;
  /** Satırın düzenleme araçları (13.09); verilmezse satır salt okunur. */
  editor?: RowEditor;
}

export function MovementList({ ledger, stacked = false, editor }: MovementListProps) {
  if (ledger.state !== 'ready') {
    return (
      <EmptyState
        title="Hareket yok"
        description={ledger.note ?? NOTES.emptyLedger}
      />
    );
  }

  if (stacked) {
    return (
      <ul className="flex flex-col">
        {ledger.rows.map((row) => (
          <MovementCard key={ledgerRowKey(row)} row={row} />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`${ROW_GRID} border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint`}
      >
        <span>Tarih</span>
        <span>Açıklama</span>
        <span className="text-right">Tutar</span>
        {/* "Tip", "tür" değil (13.09): tür artık sözlükteki sınıflandırmanın adı ve satırın
            araçlarında okunuyor; bu sütun kaba tipi (gider · transfer · sipariş ödemesi) söyler. */}
        <span>Hesap · tip</span>
        <span />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {ledger.rows.map((row) => (
          <li key={ledgerRowKey(row)} className={`${ROW_GRID} border-b border-ops-line-soft px-6 py-2.5`}>
            <span className="pt-0.5 font-ops-mono text-ops-xs text-ops-faint">{dayMonth(row.valueDate)}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
              {row.ref ? <RefLine row={row} /> : null}
              {editor ? <RowTools row={row} editor={editor} /> : null}
            </div>
            <span className={`pt-0.5 text-right font-ops-mono text-ops-sm ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
              {signedAmount(row.signedAmountCents)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-ops-body text-ops-xs text-ops-ink">{row.accountName}</span>
              <span className="font-ops-body text-ops-micro text-ops-faint">{row.typeLabel}</span>
            </div>
            <MatchDot explained={row.explained} className="mt-1.5" />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RowToolsProps {
  row: MovementRowView;
  editor: RowEditor;
}

/**
 * Satırın araçları (13.09 · muhasebeci deseni) — TÜR tek seçim, CARİ tek seçim, ETİKET çoklu;
 * hepsi aranabilir açılır menüden ve DOKUNUŞTA yazılır, "Kaydet" yok (kullanıcı isteği). Menüde
 * olmayan etiket menünün kendisinden oluşturulur.
 *
 * Gösterim İYİMSER (`useOptimistic`): seçim anında görünür; kapı reddederse eski hâle döner, kabul
 * ederse sayfanın yeni verisi action'ın cevabıyla gelir (`revalidatePath`).
 *
 * Tür ve cari yalnız sınıflandırılabilen satırda (gider · sermaye · sınıflandırılmamış): sipariş
 * parasını, stok alımını ve transferi bağları açıklar. Belge bağı elle yazılan satırda tek tek
 * kaldırılır; ekstre satırında bağlar "Eşleşmeyi geri al" ile birlikte çözülür ve satır kuyruğa döner.
 */
function RowTools({ row, editor }: RowToolsProps) {
  const [, startTransition] = useTransition();
  const [nature, showNature] = useOptimistic(row.nature);
  const [counterpartyId, showCounterparty] = useOptimistic(row.counterpartyId);
  const [tags, showTags] = useOptimistic(row.tags);
  const busy = editor.busyId === row.id;
  const queued = editor.queue.find((entry) => entry.movementId === row.id);

  const writeNature = (next: string | null) =>
    startTransition(async () => {
      showNature(next);
      await editor.onSetNature(row.id, next);
    });
  const writeCounterparty = (next: string | null) =>
    startTransition(async () => {
      showCounterparty(next);
      await editor.onSetCounterparty(row.id, next);
    });
  const writeTags = (next: string[]) =>
    startTransition(async () => {
      showTags(next);
      await editor.onTag(row.id, next);
    });
  const createTag = async (label: string) => {
    const slug = await editor.onCreateTag(label);
    if (slug && !tags.includes(slug)) writeTags([...tags, slug]);
  };

  // Pasif etiket de adıyla okunur: seçenekler aktifler + satırın taşıdığı pasifler.
  const activeTags = new Set(editor.tagOptions.map((option) => option.value));
  const tagOptions = [
    ...editor.tagOptions,
    ...tags.filter((tag) => !activeTags.has(tag)).map((tag) => ({ value: tag, label: editor.tagLabels.get(tag) ?? tag })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {row.canClassify ? (
        <>
          <Combobox
            variant="chip"
            tone="olive"
            value={nature ?? ''}
            // Pasif tür seçenekte yoktur; adı satırdan okunur — iyimser değer sunucununkiyle aynıyken.
            selectedLabel={nature === row.nature ? (row.natureLabel ?? undefined) : undefined}
            onChange={(next) => writeNature(next)}
            options={naturesForDirection(editor.natureOptions, row.direction).map(({ value, label }) => ({ value, label }))}
            placeholder="+ tür"
            searchPlaceholder="Tür ara…"
            emptyText="Bu yöne uyan tür yok — Sözlük penceresinden ekleyin"
            onClear={() => writeNature(null)}
            clearLabel="Türü kaldır"
          />
          <Combobox
            variant="chip"
            tone="olive"
            value={counterpartyId ?? ''}
            selectedLabel={counterpartyId === row.counterpartyId ? (row.counterpartyName ?? undefined) : undefined}
            onChange={(next) => writeCounterparty(next)}
            options={editor.counterpartyOptions.map(({ value, label }) => ({ value, label }))}
            placeholder="+ cari"
            searchPlaceholder="Cari ara…"
            emptyText="Cari yok — Sözlük penceresinden ekleyin"
            onClear={() => writeCounterparty(null)}
            clearLabel="Cariyi kaldır"
          />
        </>
      ) : null}
      <MultiSelect
        options={tagOptions}
        selected={tags}
        onChange={writeTags}
        addLabel="+ etiket"
        searchPlaceholder="Etiket ara ya da yaz…"
        emptyText="Etiket yok"
        onCreate={(label) => void createTag(label)}
      />
      {row.documents.map((document) => (
        <span
          key={document.id}
          className="inline-flex items-center gap-1 rounded-ops-chip border border-ops-olive-line px-2 py-0.5 font-ops-body text-ops-micro text-ops-olive-dark"
        >
          belge {document.label}
          {row.fromBank ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => editor.onRemoveAllocation(row.id, document.id)}
              title="Belge bağını kaldır — hareket ve belge kalır, belgenin açık kalanı geri gelir"
              aria-label={`${document.label} bağını kaldır`}
              className="cursor-pointer text-ops-faint transition-colors hover:text-ops-red disabled:cursor-wait"
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {/* Satır kuyruktaysa bağlama yolu satırın kendisinde de açık — kullanıcı "öneride nasıl
          bulunacağımı anlayamadım" demişti (13.09): pencere kuyruk kartınınkiyle aynı. */}
      {queued ? (
        <button
          type="button"
          onClick={() => editor.onPick(queued)}
          className="cursor-pointer font-ops-body text-ops-xs font-medium text-ops-amber-dark underline transition-colors hover:text-ops-ink"
        >
          Bağla…
        </button>
      ) : null}
      {row.canUnmatch ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => editor.onUnmatch(row.id)}
          title="Satır ekstreden geldiği hâle döner ve eşleştirme kuyruğuna geri gelir"
          className="cursor-pointer font-ops-body text-ops-xs text-ops-muted underline transition-colors hover:text-ops-ink disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? '…' : 'Eşleşmeyi geri al'}
        </button>
      ) : null}
    </div>
  );
}

/** Telefonun satırı — sütun yerine iki katlı kart; dar ekranda beş sütun okunmuyor. */
function MovementCard({ row }: { row: MovementRowView }) {
  return (
    <li className="flex flex-col gap-1 border-b border-ops-line-soft px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
        <span className={`shrink-0 font-ops-mono text-ops-sm ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
          {signedAmount(row.signedAmountCents)}
        </span>
      </div>
      <div className="flex items-center gap-2 font-ops-body text-ops-micro text-ops-faint">
        <span className="font-ops-mono">{dayMonth(row.valueDate)}</span>
        <span aria-hidden>·</span>
        <span>{row.accountName}</span>
        <span aria-hidden>·</span>
        <span className="min-w-0 truncate">{row.typeLabel}</span>
        <MatchDot explained={row.explained} className="ml-auto shrink-0" />
      </div>
      {row.ref ? <RefLine row={row} /> : null}
    </li>
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
  onApprove: (row: MatchRowView) => void;
  onPick: (row: MatchRowView) => void;
  onClassify: (row: MatchRowView, nature: string) => void;
  onDismiss: (row: MatchRowView) => void;
}

/**
 * "Sistem önerir, siz onaylarsınız" — üç hâl, üç ayrı eylem.
 *
 * Kuyruk HESABA bağlıdır (`matchQueue(accountId)`) ve bu doğal: banka dosyası bir hesaba yüklenir,
 * eşleştirme de o hesabın satırları içindir. "Tümü" seçiliyken kuyruk yerine sebebi yazılıyor —
 * boş bir panel, kuyruğun boş olduğu anlamına gelirdi.
 */
export function MatchQueue({ rows, accountSelected, busyId, natureOptions, onApprove, onPick, onClassify, onDismiss }: MatchQueueProps) {
  if (!accountSelected) {
    return (
      <EmptyState
        title="Eşleştirme için hesap seçin"
        description="Banka dosyası bir hesaba yüklenir; eşleştirme kuyruğu da o hesabın satırlarını gösterir. Yukarıdan bir hesap seçin."
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
          onApprove={onApprove}
          onPick={onPick}
          onClassify={onClassify}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}

interface MatchCardProps extends Pick<MatchQueueProps, 'natureOptions' | 'onApprove' | 'onPick' | 'onClassify' | 'onDismiss'> {
  row: MatchRowView;
  busy: boolean;
}

function MatchCard({ row, busy, natureOptions, onApprove, onPick, onClassify, onDismiss }: MatchCardProps) {
  const view = SUGGESTION_VIEW[row.strength];

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
        <button
          type="button"
          disabled={busy}
          onClick={() => (row.strength === 'strong' ? onApprove(row) : onPick(row))}
          className={`flex-1 cursor-pointer rounded-ops-btn px-3 py-2 font-ops-display text-ops-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
            row.strength === 'strong'
              ? 'bg-ops-olive text-ops-on-olive hover:bg-ops-olive-dark'
              : 'border border-ops-line-strong text-ops-ink hover:bg-ops-surface-sunken'
          }`}
        >
          {view.action}
        </button>
        {/* **"Düzelt"in asıl işi güçlü adayda:** öneri güçlü ama yanlışsa tek çare "Atla" olurdu —
            o da satırı kuyruktan düşürüp doğru eşleşmeyi de kaybettirirdi. Çoklu adayda ve
            önerisiz satırda birincil düğme zaten aynı pencereyi açıyor; düğme ikinci kez çizilmez. */}
        {row.strength === 'strong' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(row)}
            title="Hedefi kendin seç"
            className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
          >
            Düzelt
          </button>
        ) : null}
        {/* TÜRÜNÜ KOY (13.09 · ikinci karar) — bir kayda bağlanmayan satır tek dokunuşla TEK türle
            sınıflanır: çıkışta gider türü, girişte sermaye ya da gelir türü (satırın yönüne uyanlar).
            Kuyruk seri onaylanan bir yüzey; her satır için pencere açmak on satırlık bir ekstreyi
            yirmi tıklamaya çevirirdi. Belgeye, mal kabule, cariye bağlamak seçim penceresinin işi. */}
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
          className="cursor-pointer rounded-ops-btn border border-ops-line px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
        >
          Atla
        </button>
      </div>
    </li>
  );
}
