'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { amount, dayMonth, money, num } from '@/components/operation/ui/format';
import {
  EXPLAINED_LABEL,
  MOVEMENT_TYPE_CHIP,
  MOVEMENT_TYPE_ORDER,
  NOTES,
  SUGGESTION_VIEW,
} from './finance-labels';
import type { ClassifyType } from '@/lib/bank/reconcile';
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

      {/* Tür ve tarih ÇİP DEĞİL seçici: yedi tür ve dört aralık çip olarak basılsaydı bar iki satıra
          taşar ve asıl daraltma olan hesap çipleri arasında kaybolurdu. Tasarımın "+ tür"/"+ tarih"
          kesikli hapları da zaten "buradan bir şey seçilecek" diyor, hepsini birden göstermiyor. */}
      {/* **Ham `<select>` DEĞİL, kitin `Select`i — `variant="chip"`** (CLAUDE.md §2: form kitini
          kullan, ham eleman son çare). İlk yazımda ham `<select>` konmuştu ve iki şeyi birden
          kaybediyordu: tasarımın kesikli "+ …" çip biçimini (kutu, çiplerin yanında yabancı
          duruyordu) ve tarayıcının yerleştirdiği okun hizasını — ok çipin sağ kenarına yapışıyordu.
          Kitin çip kipi tam bu şerit için yazılmış; ikinci bir biçim icat etmeye gerek yoktu.

          Tür süzgeci bir tur ekranda YOKTU (kapısı gelmemişti) — arka uç `LedgerFilter.type`'ı
          açınca bağlandı; süzme sunucuda, yani liste kuyruğuyla birlikte daralıyor. */}
      <FilterChip
        value={urlState.type}
        emptyValue="all"
        placeholder="+ tür"
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
const ROW_GRID = 'grid grid-cols-[62px_minmax(0,1fr)_100px_120px_14px] items-center gap-x-3';

interface MovementListProps {
  ledger: LedgerView;
  stacked?: boolean;
  /** Etiket sözlüğü — izah bekleyen satırın "Etiketle" çipleri (12.12). */
  tagOptions?: Array<{ value: string; label: string }>;
  /** Satırı etiketler; verilmezse satır salt okunur (telefon görünümü). */
  onTag?: (movementId: string, tags: string[]) => void;
  tagBusyId?: string | null;
}

export function MovementList({ ledger, stacked = false, tagOptions = [], onTag, tagBusyId = null }: MovementListProps) {
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
        <span>Hesap · tür</span>
        <span />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {ledger.rows.map((row) => (
          <li key={ledgerRowKey(row)} className={`${ROW_GRID} border-b border-ops-line-soft px-6 py-2.5`}>
            <span className="font-ops-mono text-ops-xs text-ops-faint">{dayMonth(row.valueDate)}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
              {row.ref ? <RefLine row={row} /> : null}
              {/* İZAH BEKLEYEN SATIR SATIRDA KAPANIR (12.12): kuyruk için ayrı bir pencere yok —
                  operatör satırı görür, etiketi seçer, satır izahlı olur. Yalnız etiketsiz ve
                  bağsız satırda görünür; izahlı satırın etiketi tip hücresinde zaten okunuyor. */}
              {!row.explained && onTag ? (
                <TagInline tagOptions={tagOptions} busy={tagBusyId === row.id} onSave={(tags) => onTag(row.id, tags)} />
              ) : null}
            </div>
            <span className={`text-right font-ops-mono text-ops-sm ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
              {signedAmount(row.signedAmountCents)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-ops-body text-ops-xs text-ops-ink">{row.accountName}</span>
              <span className="font-ops-body text-ops-micro text-ops-faint">{row.typeLabel}</span>
            </div>
            <MatchDot explained={row.explained} />
          </li>
        ))}
      </ul>
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
 * Satır içi etiketleme (12.12): "Etiketle" → çoklu çip → "Kaydet". Kuyruk kartındaki tek dokunuşlu
 * sınıflandırmadan farkı çoklu seçim: izah bekleyen satır çoğu zaman iki şey söyler ("maaş" ve
 * "ortak:ahmet"), tek çiple kapatılsa ikincisi hiç yazılmazdı.
 */
function TagInline({
  tagOptions,
  busy,
  onSave,
}: {
  tagOptions: Array<{ value: string; label: string }>;
  busy: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (slug: string) => setSelected((prev) => (prev.includes(slug) ? prev.filter((tag) => tag !== slug) : [...prev, slug]));

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="w-fit cursor-pointer font-ops-body text-ops-micro text-ops-amber-dark underline hover:text-ops-ink disabled:cursor-wait"
      >
        Etiketle
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {tagOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={busy}
          aria-pressed={selected.includes(option.value)}
          onClick={() => toggle(option.value)}
          className={`cursor-pointer rounded-ops-chip border px-2 py-0.5 font-ops-body text-ops-micro transition-colors disabled:cursor-wait ${
            selected.includes(option.value)
              ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark'
              : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
      <button
        type="button"
        disabled={busy || selected.length === 0}
        onClick={() => onSave(selected)}
        className="cursor-pointer rounded-ops-btn bg-ops-olive px-2.5 py-0.5 font-ops-display text-ops-micro font-semibold text-ops-on-olive transition-colors hover:bg-ops-olive-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '…' : 'Kaydet'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="cursor-pointer font-ops-body text-ops-micro text-ops-faint hover:text-ops-ink">
        Vazgeç
      </button>
    </div>
  );
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
  /** Etiket sözlüğü (13.09) — "bu çıkış hangi gider" çipleri buradan, sabit listeden değil. */
  tagOptions: Array<{ value: string; label: string }>;
  onApprove: (row: MatchRowView) => void;
  onPick: (row: MatchRowView) => void;
  onClassify: (row: MatchRowView, type: ClassifyType, tags: string[]) => void;
  onDismiss: (row: MatchRowView) => void;
}

/**
 * "Sistem önerir, siz onaylarsınız" — üç hâl, üç ayrı eylem.
 *
 * Kuyruk HESABA bağlıdır (`matchQueue(accountId)`) ve bu doğal: banka dosyası bir hesaba yüklenir,
 * eşleştirme de o hesabın satırları içindir. "Tümü" seçiliyken kuyruk yerine sebebi yazılıyor —
 * boş bir panel, kuyruğun boş olduğu anlamına gelirdi.
 */
export function MatchQueue({ rows, accountSelected, busyId, tagOptions, onApprove, onPick, onClassify, onDismiss }: MatchQueueProps) {
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
          tagOptions={tagOptions}
          onApprove={onApprove}
          onPick={onPick}
          onClassify={onClassify}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}

function MatchCard({
  row,
  busy,
  tagOptions,
  onApprove,
  onPick,
  onClassify,
  onDismiss,
}: {
  row: MatchRowView;
  busy: boolean;
} & Pick<MatchQueueProps, 'tagOptions' | 'onApprove' | 'onPick' | 'onClassify' | 'onDismiss'>) {
  const view = SUGGESTION_VIEW[row.strength];
  const [classifying, setClassifying] = useState(false);
  // Hızlı gider çipleri yalnız para ÇIKIŞINDA (kapı da öyle diyor: gider çıkıştır). Giren paranın
  // adı sermaye ya da bir hedef — o yol seçim penceresinden ("Elle bağla") geçer; artık hiçbir satır
  // "Atla"ya mecbur değil (12.13).
  const quickExpense = row.signedAmountCents < 0;

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

      {/* Gider çipleri kartın İÇİNDE açılıyor: kuyruk seri onaylanan bir yüzey ve her satır için
          pencere açıp kapatmak, on satırlık bir ekstreyi yirmi tıklamaya çevirirdi. Belgeye, mal
          kabule, transfere ya da zaten yazılmış harekete bağlamak ise seçim penceresinin işi. */}
      {/* Çipler SÖZLÜKTEN (13.09): tek dokunuş tek etiketle sınıflar — ikinci etiket
          (ör. `ortak:ahmet`) hareket listesinden sonradan eklenir. */}
      {classifying ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-micro text-ops-faint">Bu çıkış hangi gider?</span>
          {tagOptions.length === 0 ? (
            <span className="font-ops-body text-ops-xs text-ops-faint">Sözlükte aktif etiket yok — önce etiket ekleyin.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => onClassify(row, 'expense', [option.value])}
                  className="cursor-pointer rounded-ops-chip border border-ops-line px-2.5 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
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
        {quickExpense ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setClassifying((open) => !open)}
            aria-expanded={classifying}
            title="Bir kayda bağlanmayan çıkış: etiketiyle gider yaz"
            className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
          >
            Gider
          </button>
        ) : null}
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
