'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { Select } from '@/components/operation/form/select';
import { amount, dayMonth, money, num } from '@/components/operation/ui/format';
import {
  MOVEMENT_TYPE_CHIP,
  MOVEMENT_TYPE_ORDER,
  NOTES,
  QUICK_CATEGORIES,
  RECONCILE_LABEL,
  SUGGESTION_VIEW,
} from './finance-labels';
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
  unmatchedCount: number | null;
  onChange: (next: Partial<FinanceUrlState>) => void;
  stacked?: boolean;
}

/**
 * Hesap · tip · dönem çipleri + eşleşmemiş sayacı.
 *
 * **Hesap bir daraltmadır, bir eksen değil** — tasarımın tezgâh sözleşmesi bunu yazıyor ve bütün
 * ekranın kurgusu buna dayanıyor: "Tümü" varsayılan, kasa ile bankanın ayrı ekranı yok.
 *
 * Sayaç bir ROZET değil, kuyruğun KAPISI: tıklanınca aynı ölçütle süzülmüş listeye iner. Süs olarak
 * bırakılsaydı operatör gördüğü sayının kümesini açmak için ayrıca aramak zorunda kalırdı.
 */
export function FilterBar({ accounts, urlState, unmatchedCount, onChange, stacked = false }: FilterBarProps) {
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
      <Select
        variant="chip"
        value={urlState.type}
        onChange={(value) => onChange({ type: value as FinanceUrlState['type'] })}
        placeholder="+ tür"
        options={[
          { value: 'all', label: '+ tür' },
          ...MOVEMENT_TYPE_ORDER.map((type) => ({ value: type, label: MOVEMENT_TYPE_CHIP[type] })),
        ]}
      />

      <Select
        variant="chip"
        value={urlState.period}
        onChange={(value) => onChange({ period: value as FinanceUrlState['period'] })}
        placeholder="+ tarih"
        options={FINANCE_PERIODS.map((period) => ({
          value: period,
          label: period === 'all' ? '+ tarih' : PERIOD_LABEL[period],
        }))}
      />

      {/* Sayaç `null` ise HİÇ BASILMAZ — "0 eşleşmemiş" yazmak, sayacı olmayan bir ekranda dolu bir
          iş kuyruğunu "her şey mutabık" diye okuturdu (CLAUDE.md §1: ölçülemeyen değer sıfır değil). */}
      {unmatchedCount === null ? null : (
        <Chip
          className="ml-auto"
          active={unmatchedActive}
          tone={unmatchedCount > 0 ? 'amber' : 'olive'}
          onClick={() => onChange({ scope: unmatchedActive ? ALL_ACCOUNTS : 'unmatched' })}
        >
          {unmatchedCount > 0 ? `${num(unmatchedCount)} eşleşmemiş satır` : 'Her şey mutabık'}
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
}

export function MovementList({ ledger, stacked = false }: MovementListProps) {
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
          <MovementCard key={row.id} row={row} />
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
          <li key={row.id} className={`${ROW_GRID} border-b border-ops-line-soft px-6 py-2.5`}>
            <span className="font-ops-mono text-ops-xs text-ops-faint">{dayMonth(row.valueDate)}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
              {row.ref ? <RefLine row={row} /> : null}
            </div>
            <span className={`text-right font-ops-mono text-ops-sm ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
              {signedAmount(row.signedAmountCents)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-ops-body text-ops-xs text-ops-ink">{row.accountName}</span>
              <span className="font-ops-body text-ops-micro text-ops-faint">{row.typeLabel}</span>
            </div>
            <MatchDot reconciled={row.reconciled} />
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
        <MatchDot reconciled={row.reconciled} className="ml-auto shrink-0" />
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
 * Eşleşme noktası — `title` ile okunur hâli de var.
 *
 * Tek başına bir renk noktası ekran okuyucuya hiçbir şey söylemez ve renk körü kullanıcıda iki hâl
 * ayrışmaz; `title` + `aria-label` ikisini de kapatıyor.
 */
function MatchDot({ reconciled, className = '' }: { reconciled: boolean; className?: string }) {
  const label = reconciled ? RECONCILE_LABEL.matched : RECONCILE_LABEL.unmatched;
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`size-2 rounded-full ${reconciled ? 'bg-ops-olive' : 'bg-ops-amber'} ${className}`}
    />
  );
}

// ── Banka eşleştirme kuyruğu ──────────────────────────────────────────────────────────────────

interface MatchQueueProps {
  rows: MatchRowView[];
  accountSelected: boolean;
  busyId: string | null;
  onApprove: (row: MatchRowView) => void;
  onPick: (row: MatchRowView) => void;
  onClassify: (row: MatchRowView, category: string) => void;
  onDismiss: (row: MatchRowView) => void;
}

/**
 * "Sistem önerir, siz onaylarsınız" — üç hâl, üç ayrı eylem.
 *
 * Kuyruk HESABA bağlıdır (`matchQueue(accountId)`) ve bu doğal: banka dosyası bir hesaba yüklenir,
 * eşleştirme de o hesabın satırları içindir. "Tümü" seçiliyken kuyruk yerine sebebi yazılıyor —
 * boş bir panel, kuyruğun boş olduğu anlamına gelirdi.
 */
export function MatchQueue({ rows, accountSelected, busyId, onApprove, onPick, onClassify, onDismiss }: MatchQueueProps) {
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
  onApprove,
  onPick,
  onClassify,
  onDismiss,
}: {
  row: MatchRowView;
  busy: boolean;
} & Pick<MatchQueueProps, 'onApprove' | 'onPick' | 'onClassify' | 'onDismiss'>) {
  const view = SUGGESTION_VIEW[row.strength];
  const [classifying, setClassifying] = useState(false);
  // Gider sınıflandırması yalnız para ÇIKIŞINDA anlamlı ve kapı da öyle diyor (`classifyAsExpense`
  // `in` satırı reddediyor). Giren parada önerisi olmayan satırın cevabı gider değil — sermaye,
  // banka iadesi ya da bilinmeyen olabilir; orada tek dürüst eylem "Atla".
  const canClassify = row.strength === 'none' && row.signedAmountCents < 0;

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
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {row.strength === 'none' && !canClassify
            ? 'Eşleşen sipariş bulunamadı. Giren paranın sebebi gider olamaz — sermaye ya da banka iadesi olabilir; şimdilik kuyruktan düşürün.'
            : row.sentence}
        </span>
      </div>

      {/* "Elle bağla" bir DİYALOG açmıyor, kartın içinde açılıyor: kuyruk seri onaylanan bir yüzey
          ve her satır için pencere açıp kapatmak, on satırlık bir ekstreyi yirmi tıklamaya çevirirdi. */}
      {classifying ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-micro text-ops-faint">Bu çıkış hangi gider?</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CATEGORIES.map((quick) => (
              <button
                key={quick.value}
                type="button"
                disabled={busy}
                onClick={() => onClassify(row, quick.value)}
                className="cursor-pointer rounded-ops-chip border border-ops-line px-2.5 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive-dark disabled:cursor-wait disabled:opacity-60"
              >
                {quick.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        {row.strength === 'none' && !canClassify ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (row.strength === 'strong') return onApprove(row);
              if (canClassify) return setClassifying((open) => !open);
              return onPick(row);
            }}
            className={`flex-1 cursor-pointer rounded-ops-btn px-3 py-2 font-ops-display text-ops-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
              row.strength === 'strong'
                ? 'bg-ops-olive text-ops-on-olive hover:bg-ops-olive-dark'
                : 'border border-ops-line-strong text-ops-ink hover:bg-ops-surface-sunken'
            }`}
          >
            {view.action}
          </button>
        )}
        {/* **"Düzelt" ÜÇ HÂLDE DE var** (çizimin kendi kararı) ve asıl işi güçlü adayda: öneri
            güçlü ama yanlışsa tek çare "Atla" olurdu — o da satırı kuyruktan düşürüp doğru
            eşleşmeyi de kaybettirirdi. Çoklu adayda birincil düğmeyle aynı pencereyi açar; ikisi
            aynı soruyu soruyor. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick(row)}
          title="Adaylar arasından kendin seç"
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
        >
          Düzelt
        </button>
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
