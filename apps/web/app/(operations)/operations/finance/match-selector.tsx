'use client';

import { useRef, useState, type ReactNode } from 'react';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { Badge } from '@/components/operation/ui/badge';
import { SearchIcon } from '@/components/operation/ui/icons';
import { amount, dayMonth, money, percent } from '@/components/operation/ui/format';
import { Input } from '@/components/operation/form/input';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { MATCH_EFFECT, MATCH_KIND_LABEL, type MatchKindView } from './finance-labels';
import type { DocumentPaymentsView, MatchOptionsView, MatchTargetView, MovementRowView } from './finance-types';

/*
  BAĞ SEÇİCİ (12.17 · kullanıcı isteği: "eşleştirmede diğer tarafta kullanılan komponenti incele, bizim
  desenimizle benzerini yap" — `~/dev/muhasebeci` `TransactionMatchSelector`).

  Desen: bir HAP bağın durumunu söyler ("bağlı 120,00 / 360,00 €" — tamamı bağlıysa olive, kısmen
  amber, hiç yoksa nötr). Dokununca açılan menüde üstte BAĞLI olanlar (tutarıyla, ✕ ile kaldırılır),
  altında arama ve ADAYLAR: önce motorun puanladıkları (uyum yüzdesi + sebep), sonra yöne uyan bütün
  hedefler bölüm bölüm. Adaya dokunmak bağlar — Kaydet ya da ikinci onay yok (muhasebeci'de de yok).

  Kabuk (`LinkSelector`) veriyi BİLMEZ: iki yan kendi bölümlerini kurar — hareket → hedef
  (`MovementMatchSelector`), belge → ödeme (`DocumentPaymentSelector`). Kuyruk kartı da aynı seçiciyi
  kendi düğmesiyle açar; bir tur ayrı bir büyük pencere (`MatchDialog`) vardı ve iki yüzey iki ayrı
  hedef dili konuşuyordu.
*/

type SelectorTone = 'olive' | 'amber' | 'neutral';

const PILL_TONE: Record<SelectorTone, string> = {
  olive: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark hover:border-ops-olive',
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark hover:border-ops-amber',
  neutral: 'border-ops-line-strong bg-ops-card text-ops-body hover:border-ops-olive',
};

interface SelectorItem {
  key: string;
  title: string;
  detail: string;
  /** Sağa hizalı tutar (mono). */
  amount?: string;
  /** Puan rozeti ("uyum %82") — yalnız motorun puanladığı adayda. */
  score?: string;
  reasons?: string[];
  onSelect: () => void;
}

interface SelectorSection {
  key: string;
  title: string;
  hint?: string;
  items: SelectorItem[];
}

interface LinkedItem {
  key: string;
  title: string;
  detail: string;
  amount: string;
  /** Verilmezse bağ burada kaldırılmaz (ekstre satırının bağı geri almayla çözülür). */
  onRemove?: () => void;
}

interface LinkSelectorProps {
  label: string;
  tone: SelectorTone;
  /** Kuyruk kartında kartın kendi düğmesi tetikler — hap yerine onun sınıfı. */
  triggerClassName?: string;
  className?: string;
  linked: LinkedItem[];
  sections: SelectorSection[];
  loading?: boolean;
  error?: string | null;
  emptyText: string;
  searchPlaceholder: string;
  disabled?: boolean;
}

function LinkSelector({
  label,
  tone,
  triggerClassName,
  className,
  linked,
  sections,
  loading = false,
  error = null,
  emptyText,
  searchPlaceholder,
  disabled = false,
}: LinkSelectorProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('tr');
  const fits = (item: { title: string; detail: string }) => needle === '' || `${item.title} ${item.detail}`.toLocaleLowerCase('tr').includes(needle);
  const visible = sections.map((section) => ({ ...section, items: section.items.filter(fits) })).filter((section) => section.items.length > 0);

  return (
    <div ref={anchorRef} className={['inline-flex max-w-full', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setQuery('');
          setOpen((current) => !current);
        }}
        className={
          triggerClassName ??
          `inline-flex h-8 max-w-full cursor-pointer items-center rounded-ops-chip border px-3 font-ops-body text-ops-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${PILL_TONE[tone]}`
        }
      >
        <span className="truncate">{label}</span>
      </button>
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={420} className="flex flex-col">
        {linked.length > 0 ? (
          <div className="border-b border-ops-line-soft pb-1.5">
            <SectionTitle title={`Bağlı · ${linked.length}`} />
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto px-1.5">
              {linked.map((item) => (
                <li key={item.key} className="flex items-center gap-2 rounded-sm border-l-2 border-ops-olive px-2 py-1.5">
                  <ItemText title={item.title} detail={item.detail} />
                  <span className="flex-none font-ops-mono text-ops-xs text-ops-ink">{item.amount}</span>
                  {item.onRemove ? (
                    <button
                      type="button"
                      onClick={item.onRemove}
                      title="Bağı kaldır"
                      aria-label={`${item.title} bağını kaldır`}
                      className="flex-none cursor-pointer rounded-sm px-1 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-b border-ops-line-soft px-2.5 py-2 text-ops-faint">
          <SearchIcon size={14} />
          <Input
            inputSize="sm"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="border-0 !px-0 !py-0 focus:border-0"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {loading ? (
            <Note>Adaylar okunuyor…</Note>
          ) : error ? (
            <Note tone="red">{error}</Note>
          ) : visible.length === 0 ? (
            <Note>{needle ? 'Aramaya uyan aday yok.' : emptyText}</Note>
          ) : (
            visible.map((section) => (
              <section key={section.key} className="flex flex-col gap-0.5 pb-1.5">
                <SectionTitle title={section.title} hint={section.hint} />
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-sm border-l-2 border-transparent px-2 py-1.5 text-left transition-colors hover:border-ops-olive hover:bg-ops-subtle"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <ItemText title={item.title} detail={item.detail} />
                      {item.reasons && item.reasons.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {item.reasons.map((reason) => (
                            <Badge key={reason} tone="neutral" outline>
                              {reason}
                            </Badge>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-none flex-col items-end gap-0.5">
                      {item.amount ? <span className="font-ops-mono text-ops-xs text-ops-ink">{item.amount}</span> : null}
                      {item.score ? (
                        <Badge tone="amber" outline>
                          {item.score}
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </AnchoredMenu>
    </div>
  );
}

interface ItemTextProps {
  title: string;
  detail: string;
}

function ItemText({ title, detail }: ItemTextProps) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-ops-body text-ops-xs font-medium text-ops-ink">{title}</span>
      <span className="truncate font-ops-body text-ops-micro text-ops-faint">{detail}</span>
    </span>
  );
}

interface SectionTitleProps {
  title: string;
  hint?: string;
}

function SectionTitle({ title, hint }: SectionTitleProps) {
  return (
    <div className="flex items-baseline gap-2 px-2 pb-0.5 pt-1.5">
      <span className="flex-none font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">{title}</span>
      {hint ? <span className="min-w-0 truncate font-ops-body text-ops-micro text-ops-faint">{hint}</span> : null}
    </div>
  );
}

interface NoteProps {
  tone?: 'red';
  children: ReactNode;
}

function Note({ tone, children }: NoteProps) {
  return <p className={`px-2 py-3 font-ops-body text-ops-xs ${tone === 'red' ? 'text-ops-red' : 'text-ops-faint'}`}>{children}</p>;
}

// ── Hareket → hedef ───────────────────────────────────────────────────────────

/** Hedef bölümlerinin sırası: en olası önce, "başka hesaba transfer" en sonda (ucu olmayan yol). */
const KIND_ORDER: readonly MatchKindView[] = ['provisional', 'document', 'intake', 'transfer', 'order', 'refund', 'counterparty', 'transfer_to'];

interface MovementMatchSelectorProps {
  /** Hareketin tutarı ve belgelere bağlanmamış kalanı — hapın "bağlı X / Y"si. */
  amountCents: number;
  remainingCents: number;
  /** Bağlı belgeler — menünün üstünde, tutarıyla. */
  linkedDocuments: MovementRowView['documents'];
  /** Elle yazılan satırın belge bağı tek tek kaldırılır; ekstre satırınınki geri almayla çözülür. */
  removable: boolean;
  /** Seçicinin verisi; `null` = henüz okunmadı. */
  options: MatchOptionsView | null;
  loading?: boolean;
  error?: string | null;
  /** Eşleşme bekleyen ekstre satırının seçimi — kuyruğun kapısı (`applyMatch`). */
  onApplyTarget: (target: MatchTarget) => void;
  /** Elle yazılan satırın seçimi — yalnız belge bağı. */
  onLinkDocument?: (documentId: string) => void;
  onRemoveAllocation?: (documentId: string) => void;
  /** Kuyruk kartı kendi düğmesiyle açar ("Seç", "Düzelt", "Elle bağla"). */
  triggerLabel?: string;
  triggerClassName?: string;
  className?: string;
  disabled?: boolean;
}

export function MovementMatchSelector({
  amountCents,
  remainingCents,
  linkedDocuments,
  removable,
  options,
  loading,
  error,
  onApplyTarget,
  onLinkDocument,
  onRemoveAllocation,
  triggerLabel,
  triggerClassName,
  className,
  disabled,
}: MovementMatchSelectorProps) {
  const candidates = options?.row.candidates ?? [];
  const suggested = new Set(candidates.map((candidate) => candidate.key));
  const direction = options?.row.direction;
  const choose = (target: MatchTargetView) => {
    if (options?.bankRow) onApplyTarget(target.target);
    else if (target.target.kind === 'document') onLinkDocument?.(target.target.documentId);
  };
  const itemOf = (target: MatchTargetView, score?: number, reasons?: string[]): SelectorItem => ({
    key: target.key,
    title: target.title,
    detail: target.detail,
    score: score === undefined ? undefined : `uyum ${percent(score * 100)}`,
    reasons,
    onSelect: () => choose(target),
  });
  const sections: SelectorSection[] = options
    ? [
        { key: 'suggested', title: 'Öneriler', hint: 'motorun puanladıkları', items: candidates.map((candidate) => itemOf(candidate, candidate.score, candidate.reasons)) },
        ...KIND_ORDER.map((kind) => ({
          key: kind,
          title: MATCH_KIND_LABEL[kind],
          hint: MATCH_EFFECT[kind],
          items: options.targets
            .filter((target) => target.kind === kind && (target.direction === null || target.direction === direction) && !suggested.has(target.key))
            .map((target) => itemOf(target)),
        })),
      ]
    : [];
  const linkedCents = amountCents - remainingCents;
  const linked: LinkedItem[] = linkedDocuments.map((document) => ({
    key: document.id,
    title: document.label,
    detail: 'belge bağı',
    amount: money(document.amountCents),
    onRemove: removable && onRemoveAllocation ? () => onRemoveAllocation(document.id) : undefined,
  }));
  const label = triggerLabel ?? (linkedCents > 0 ? `bağlı ${amount(linkedCents)} / ${money(amountCents)}` : options && !options.bankRow ? 'Belgeye bağla' : 'Eşleştir');
  const tone: SelectorTone = linkedCents > 0 ? (remainingCents <= 0 ? 'olive' : 'amber') : 'neutral';

  return (
    <LinkSelector
      label={label}
      tone={tone}
      triggerClassName={triggerClassName}
      className={className}
      linked={linked}
      sections={sections}
      loading={loading}
      error={error}
      disabled={disabled}
      emptyText={
        options && !options.bankRow ? 'Bu yöne uyan açık belge yok.' : 'Bu satırın yönüne uyan açık hedef yok — türünü koyun ya da kuyruktan düşürün.'
      }
      searchPlaceholder="Sipariş no, belge no, cari, açıklama…"
    />
  );
}

// ── Belge → ödeme ─────────────────────────────────────────────────────────────

interface DocumentPaymentSelectorProps {
  amountCents: number;
  /** Ödemeler ve adaylar; `null` = henüz okunmadı. */
  view: DocumentPaymentsView | null;
  loading?: boolean;
  error?: string | null;
  onLink: (movementId: string) => void;
  onRemove: (movementId: string) => void;
  disabled?: boolean;
}

export function DocumentPaymentSelector({ amountCents, view, loading, error, onLink, onRemove, disabled }: DocumentPaymentSelectorProps) {
  const openCents = view?.openAmountCents ?? amountCents;
  const paidCents = amountCents - openCents;
  const linked: LinkedItem[] = (view?.payments ?? []).map((payment) => ({
    key: payment.movementId,
    title: payment.title,
    detail: `${payment.accountName} · ${dayMonth(payment.valueDate)}${
      payment.amountCents !== payment.movementAmountCents ? ` · hareket ${money(payment.movementAmountCents)}` : ''
    }`,
    amount: money(payment.amountCents),
    onRemove: payment.removable ? () => onRemove(payment.movementId) : undefined,
  }));
  const sections: SelectorSection[] = view
    ? [
        {
          key: 'candidates',
          title: 'Ödeme adayları',
          hint: 'belgenin yönündeki, kalanı olan hareketler',
          items: view.candidates.map((candidate) => ({
            key: candidate.movementId,
            title: candidate.title,
            detail: `${candidate.accountName} · ${dayMonth(candidate.valueDate)}`,
            amount: `kalan ${money(candidate.remainingCents)}`,
            score: candidate.score > 0 ? `uyum ${percent(candidate.score * 100)}` : undefined,
            reasons: candidate.reasons,
            onSelect: () => onLink(candidate.movementId),
          })),
        },
      ]
    : [];
  const label = paidCents > 0 ? `ödenen ${amount(paidCents)} / ${money(amountCents)}` : 'Ödeme bağla';
  const tone: SelectorTone = paidCents > 0 ? (openCents <= 0 ? 'olive' : 'amber') : 'neutral';

  return (
    <LinkSelector
      label={label}
      tone={tone}
      linked={linked}
      sections={sections}
      loading={loading}
      error={error}
      disabled={disabled}
      emptyText="Bu belgenin yönünde, kalanı olan hareket yok — önce ödemeyi yazın ya da banka dosyasını yükleyin."
      searchPlaceholder="Açıklama, hesap…"
    />
  );
}
