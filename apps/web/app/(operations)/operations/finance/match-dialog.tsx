'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Dialog } from '@/components/operation/ui/dialog';
import { amount, dayMonth, percent } from '@/components/operation/ui/format';
import { SearchInput } from '@/components/operation/ui/search-input';
import type { ClassifyType, MatchTarget } from '@/lib/bank/reconcile';
import { MATCH_EFFECT, MATCH_KIND_LABEL, type MatchKindView } from './finance-labels';
import type { MatchCandidateView, MatchRowView, MatchTargetView } from './finance-types';

// **Hedef seçimi** — kuyruğun "Seç" (çoklu aday), "Düzelt" (öneri yanlış) ve "Elle bağla"
// (öneri yok) yolları. Üçü TEK pencere ve bu bilinçli: sordukları soru aynı — *"bu banka satırı
// neyin parası"*. Ayrı pencereler yazsaydık hedef listesi, puan gösterimi ve onay çağrısı üç kez
// yazılırdı ve bir gün ayrışırlardı.
//
// ── HEDEF KÜMESİ (12.13 · kullanıcı kararı 13.09) ─────────────────────────────
// Üstte motorun ÖNERİLERİ (puanlı, sebepli), altında satırın yönüne uyan BÜTÜN hedefler bölüm
// bölüm: siparişler, açık belgeler, mal kabuller, transfer uçları, zaten yazılmış hareketler,
// başka hesaplar. En altta satırın ADINI koyma: gider (etiketle) ya da sermaye. Hiçbir satır
// "Atla"ya mecbur kalmıyor — "Bitti" ölçütü tam olarak buydu.
//
// Arama kutusu istemcide süzer: listeler doğal tavanlı (açık belge, bekleyen uç) ya da pencereyle
// sınırlı (satış), yeniden okuma gerektirmez.

interface MatchDialogProps {
  row: MatchRowView;
  targets: MatchTargetView[];
  tagOptions: Array<{ value: string; label: string }>;
  busy: boolean;
  onApply: (target: MatchTarget) => void;
  onClassify: (type: ClassifyType, tags: string[]) => void;
  onClose: () => void;
}

/** Pencerenin bölüm sırası: en olası hedef önce, "başka hesaba transfer" en sonda (ucu olmayan yol). */
const KIND_ORDER: readonly MatchKindView[] = ['provisional', 'document', 'intake', 'transfer', 'order', 'refund', 'transfer_to'];

/** Seçim ya bir hedeftir ya bir ad — ikisi aynı anda olmaz. */
type Choice = { mode: 'target'; target: MatchTargetView } | { mode: 'classify'; type: ClassifyType; tags: string[] };

export function MatchDialog({ row, targets, tagOptions, busy, onApply, onClassify, onClose }: MatchDialogProps) {
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<Choice | null>(row.candidates[0] ? { mode: 'target', target: row.candidates[0] } : null);

  const needle = query.trim().toLocaleLowerCase('tr');
  const matches = (target: MatchTargetView) =>
    needle === '' || `${target.title} ${target.detail}`.toLocaleLowerCase('tr').includes(needle);

  // Öneriler ayrı gösterilir; bölüm listelerinde tekrar etmezler (aynı hedef iki yerde iki kez
  // seçilebilir görünmesin). Süzgeç girdisi `needle`: memo onun üstünden yeniden kurulur.
  const groups = useMemo(() => {
    const suggestedKeys = new Set(row.candidates.map((candidate) => candidate.key));
    const fits = (target: MatchTargetView) => needle === '' || `${target.title} ${target.detail}`.toLocaleLowerCase('tr').includes(needle);
    return KIND_ORDER.map((kind) => ({
      kind,
      items: targets.filter(
        (target) => target.kind === kind && (target.direction === null || target.direction === row.direction) && !suggestedKeys.has(target.key) && fits(target),
      ),
    })).filter((group) => group.items.length > 0);
  }, [targets, row.candidates, row.direction, needle]);
  const suggested = row.candidates.filter(matches);

  const isSelected = (target: MatchTargetView) => choice?.mode === 'target' && choice.target.key === target.key;
  const classifyType: ClassifyType = row.direction === 'out' ? 'expense' : 'capital';
  const classifyTags = choice?.mode === 'classify' ? choice.tags : [];
  const toggleClassifyTag = (slug: string) => {
    const next = classifyTags.includes(slug) ? classifyTags.filter((tag) => tag !== slug) : [...classifyTags, slug];
    setChoice(next.length > 0 ? { mode: 'classify', type: classifyType, tags: next } : null);
  };

  const submit = () => {
    if (!choice) return;
    if (choice.mode === 'target') onApply(choice.target.target);
    else onClassify(choice.type, choice.tags);
  };
  const submitLabel = !choice
    ? 'Seçileni bağla'
    : choice.mode === 'classify'
      ? classifyType === 'expense'
        ? 'Gider olarak yaz'
        : 'Sermaye olarak yaz'
      : 'Seçileni bağla';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Bu satır neyin parası?"
      subtitle={`${row.bankLine} · ${amount(row.signedAmountCents)} · ${dayMonth(row.valueDate)}`}
      maxWidth={640}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-faint">
            {choice?.mode === 'target' ? `${MATCH_KIND_LABEL[choice.target.kind]} · ${MATCH_EFFECT[choice.target.kind]}` : null}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-ops-btn border border-ops-line px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={busy || !choice}
              onClick={submit}
              className="cursor-pointer rounded-ops-btn bg-ops-olive px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-on-olive transition-colors hover:bg-ops-olive-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Bağlanıyor…' : submitLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Sipariş no, belge no, karşı taraf, açıklama…" />

        {suggested.length > 0 ? (
          <Section title="Öneriler" hint="motorun puanladığı hedefler">
            {suggested.map((candidate) => (
              <TargetRow key={candidate.key} target={candidate} selected={isSelected(candidate)} onSelect={() => setChoice({ mode: 'target', target: candidate })} />
            ))}
          </Section>
        ) : null}

        {groups.map((group) => (
          <Section key={group.kind} title={MATCH_KIND_LABEL[group.kind]} hint={MATCH_EFFECT[group.kind]}>
            {group.items.map((target) => (
              <TargetRow key={target.key} target={target} selected={isSelected(target)} onSelect={() => setChoice({ mode: 'target', target })} />
            ))}
          </Section>
        ))}

        {suggested.length === 0 && groups.length === 0 ? (
          <p className="font-ops-body text-ops-sm text-ops-muted">
            {needle ? 'Aramaya uyan hedef yok.' : 'Bu satırın yönüne uyan açık hedef yok — aşağıdan adını koyun ya da kuyruktan düşürün.'}
          </p>
        ) : null}

        {/* ADINI KOY — bir kayda bağlanmayan satır: çıkışta gider (etiketle), girişte sermaye.
            Etiket sözlükten ve birden çok olabilir (`maas` + `ortak:ahmet`). */}
        <Section
          title={classifyType === 'expense' ? 'Gider olarak yaz' : 'Sermaye girişi olarak yaz'}
          hint={classifyType === 'expense' ? 'bir kayda bağlanmayan çıkış — etiketiyle' : 'ortağın koyduğu para — etiketiyle'}
        >
          {tagOptions.length === 0 ? (
            <span className="font-ops-body text-ops-xs text-ops-faint">Sözlükte aktif etiket yok — önce Etiketler penceresinden ekleyin.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((option) => {
                const active = classifyTags.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => toggleClassifyTag(option.value)}
                    className={`cursor-pointer rounded-ops-chip border px-2.5 py-1 font-ops-body text-ops-xs transition-colors disabled:cursor-wait disabled:opacity-60 ${
                      active ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark' : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </Dialog>
  );
}

interface SectionProps {
  title: string;
  hint: string;
  children: React.ReactNode;
}

function Section({ title, hint, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">{title}</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">{hint}</span>
      </div>
      {children}
    </section>
  );
}

interface TargetRowProps {
  target: MatchTargetView | MatchCandidateView;
  selected: boolean;
  onSelect: () => void;
}

function TargetRow({ target, selected, onSelect }: TargetRowProps) {
  const scored = 'score' in target ? target : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full cursor-pointer flex-col gap-1 rounded-ops-card border p-3 text-left transition-colors ${
        selected ? 'border-ops-olive bg-ops-olive-bg' : 'border-ops-line hover:border-ops-line-strong'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-ops-body text-ops-sm text-ops-ink">{target.title}</span>
        {/* Puan bir KARAR değil, sıralama: motorun künyesi bunu yazıyor ("yüksek olması onayı
            kaldırmaz, yalnız sıraya koyar"). Ekran da öyle sunuyor. */}
        {scored ? <span className="shrink-0 font-ops-mono text-ops-micro text-ops-faint">uyum {percent(scored.score * 100)}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-ops-body text-ops-xs text-ops-muted">{target.detail}</span>
        {scored ? (
          <Badge tone="neutral" outline>
            {MATCH_KIND_LABEL[scored.kind]}
          </Badge>
        ) : null}
        {scored?.reasons.map((reason) => (
          <Badge key={reason} tone="neutral" outline>
            {reason}
          </Badge>
        ))}
      </div>
    </button>
  );
}
