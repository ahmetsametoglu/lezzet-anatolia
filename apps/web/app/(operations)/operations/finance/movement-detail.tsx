'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { dayMonth, money } from '@/components/operation/ui/format';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { naturesForDirection } from '@/components/operation/form/movement-form/schema';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { matchOptionsAction } from '@/lib/finance/actions';
import { CloseButton, PanelSection } from './detail-parts';
import { EXPLAINED_LABEL, MOVEMENT_SOURCE_LABEL, SUGGESTION_VIEW } from './finance-labels';
import { amountTone, signedAmount } from './finance-sections';
import type { MatchOptionsView, MovementRowView, RowEditor } from './finance-types';
import { MovementMatchSelector } from './match-selector';
import { MovementTypeIcon } from './movement-type-icon';
import { useRowWrites } from './use-row-writes.hook';

/*
  HAREKETİN AYRINTISI (12.17 · kullanıcı bulgusu 13.09: "kayıtların üzerine tıklayınca sağ tarafta bir
  şey olmuyor; eşleştirmeyle ilgili düzenleme yapamıyorum") — satıra dokununca sağ sütunda açılır.
  muhasebeci'nin ayrıntı penceresinin karşılığı, ama pencere değil PANEL: liste yanında kalır, bir
  sonraki satıra geçmek tek dokunuştur.

  Üç blok: KARŞILIĞI (eşleştirme önerisi, bağ seçicisi, bağlı belgeler, geri alma) · SINIFLANDIRMA
  (tür, cari) · ETİKETLER. Seçicinin adayları panel açılınca sunucudan istenir (`matchOptionsAction`)
  — kuyruğun hesabı seçili olmasa da ("Tümü"); bir yazımdan sonra (`version`) yeniden.
*/

interface MovementDetailProps {
  row: MovementRowView;
  editor: RowEditor;
  /** Panel okumasının sürümü — bir yazımdan sonra artar, öneriler yeniden istenir. */
  version: number;
  busy: boolean;
  onClose: () => void;
  onApplyTarget: (movementId: string, target: MatchTarget) => Promise<boolean>;
  onLinkDocument: (movementId: string, documentId: string) => Promise<boolean>;
  onRemoveAllocation: (movementId: string, documentId: string) => void;
  onUnmatch: (movementId: string) => void;
  /** Sıradaki izah bekleyen satır (12.19) — "Atla"; verilmezse sırada satır yok. */
  onNext?: () => void;
}

export function MovementDetail({ row, editor, version, busy, onClose, onApplyTarget, onLinkDocument, onRemoveAllocation, onUnmatch, onNext }: MovementDetailProps) {
  const writes = useRowWrites(row, editor);
  // Bağlanabilir mi: eşleşme bekleyen ekstre satırı her hedefe; tür alan elle satır ve stok alımı belgeye.
  const linkable = row.fromBank ? !row.reconciled : row.canClassify || row.type === 'purchase';
  const [options, setOptions] = useState<MatchOptionsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!linkable) {
      setOptions(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void matchOptionsAction(row.id)
      .then(({ data, error: actionError }) => {
        if (cancelled) return;
        setOptions(data);
        setError(actionError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Panel başka satıra geçer ya da kapanırsa geç gelen cevap yazılmaz.
    return () => {
      cancelled = true;
    };
  }, [row.id, version, linkable]);

  const suggestion = options?.bankRow ? options.row : null;
  const view = suggestion ? SUGGESTION_VIEW[suggestion.strength] : null;
  const best = suggestion?.strength === 'strong' ? suggestion.candidates[0] : undefined;

  return (
    <aside className="flex min-h-0 flex-1 flex-col" aria-label="Hareketin ayrıntısı">
      <header className="flex items-start gap-3 border-b border-ops-line bg-ops-card px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Hareket</span>
          <span className="font-ops-body text-ops-base text-ops-ink [overflow-wrap:anywhere]">{row.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-faint">
            {dayMonth(row.valueDate)} · {row.accountName} ·{' '}
            <span className="inline-flex items-center gap-1 align-middle">
              <MovementTypeIcon type={row.type} size={12} />
              {row.typeLabel}
            </span>{' '}
            · {MOVEMENT_SOURCE_LABEL[row.source]}
          </span>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className={`font-ops-mono text-ops-title ${amountTone(row.signedAmountCents, row.type === 'order_refund')}`}>
            {signedAmount(row.signedAmountCents)}
          </span>
          <span className={`font-ops-body text-ops-micro ${row.explained ? 'text-ops-olive-dark' : 'text-ops-amber-dark'}`}>
            {row.explained ? EXPLAINED_LABEL.explained : EXPLAINED_LABEL.unexplained}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <PanelSection
          title="Karşılığı"
          hint={row.fromBank ? 'ekstre satırının cevabı — sipariş, belge, transfer, cari ya da tür' : 'belge bağı — fatura, fiş, bordro'}
        >
          {/* Öneri kutusu varken satırın "öneri: …" cümlesi yeniden yazılmaz — aynı bilgi iki kez (12.19). */}
          {row.ref && !(suggestion && view) ? <p className="font-ops-body text-ops-xs text-ops-muted">{row.ref}</p> : null}
          {suggestion && view ? (
            <div className="flex items-start gap-2 rounded-sm bg-ops-card px-2.5 py-2">
              <Badge tone={view.tone} outline className="shrink-0">
                {view.label}
              </Badge>
              <span className="font-ops-body text-ops-xs text-ops-muted">{suggestion.sentence}</span>
            </div>
          ) : null}
          {/* Bağlı belgeler SATIRDA okunur (muhasebeci'nin kart kipi): menüyü açmadan hangi faturanın
              ne kadarının kapandığı görünür. Elle yazılan satırın bağı buradan tek tek kaldırılır. */}
          {row.documents.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {row.documents.map((document) => (
                <li key={document.id} className="flex items-center gap-2 rounded-sm border-l-2 border-ops-olive bg-ops-card px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-ink">belge {document.label}</span>
                  <span className="flex-none font-ops-mono text-ops-xs text-ops-ink">{money(document.amountCents)}</span>
                  {row.fromBank ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemoveAllocation(row.id, document.id)}
                      title="Belge bağını kaldır — hareket ve belge kalır, belgenin açık kalanı geri gelir"
                      aria-label={`${document.label} bağını kaldır`}
                      className="flex-none cursor-pointer rounded-sm px-1 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red disabled:cursor-wait"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {linkable ? (
              <MovementMatchSelector
                amountCents={row.amountCents}
                remainingCents={row.remainingCents}
                linkedDocuments={row.documents}
                removable={!row.fromBank}
                options={options}
                loading={loading}
                error={error}
                onApplyTarget={(target) => void onApplyTarget(row.id, target)}
                onLinkDocument={(documentId) => void onLinkDocument(row.id, documentId)}
                onRemoveAllocation={(documentId) => onRemoveAllocation(row.id, documentId)}
                disabled={busy}
              />
            ) : null}
            {best ? (
              <Button size="sm" disabled={busy} onClick={() => void onApplyTarget(row.id, best.target)}>
                ✓ Öneriyi onayla
              </Button>
            ) : null}
            {/* ATLA (12.19): satıra bir şey YAZMAZ, sıradaki izah bekleyene geçer. Kuyruğun eski "Atla"sı
                satırı izahsız "mutabık" işaretliyordu — her hareket izahlı olmalı, o kapı kalktı. */}
            {!row.explained && onNext ? (
              <Button variant="secondary" size="sm" onClick={onNext} title="Sıradaki izah bekleyen harekete geç — bu satıra bir şey yazılmaz">
                Atla →
              </Button>
            ) : null}
            {row.canUnmatch ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onUnmatch(row.id)}
                title="Satır ekstreden geldiği hâle döner ve yeniden izah bekler"
                className="cursor-pointer font-ops-body text-ops-xs text-ops-muted underline transition-colors hover:text-ops-ink disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? '…' : 'Eşleşmeyi geri al'}
              </button>
            ) : null}
          </div>
        </PanelSection>

        {row.canClassify ? (
          <PanelSection title="Sınıflandırma" hint="tür: bu para neyin parası · cari: kime ödendi, kimden geldi">
            <FieldShell label="Türü">
              <Combobox
                value={writes.nature ?? ''}
                selectedLabel={writes.natureLabel}
                onChange={(next) => writes.writeNature(next)}
                options={naturesForDirection(editor.natureOptions, row.direction).map(({ value, label }) => ({ value, label }))}
                placeholder="Tür seçin"
                searchPlaceholder="Tür ara…"
                emptyText="Bu yöne uyan tür yok — Sözlük penceresinden ekleyin"
                onClear={() => writes.writeNature(null)}
                clearLabel="Türü kaldır"
              />
            </FieldShell>
            <FieldShell label="Karşı taraf">
              <Combobox
                value={writes.counterpartyId ?? ''}
                selectedLabel={writes.counterpartyName}
                onChange={(next) => writes.writeCounterparty(next)}
                options={editor.counterpartyOptions.map(({ value, label }) => ({ value, label }))}
                placeholder="Cari seçin"
                searchPlaceholder="Cari ara…"
                emptyText="Cari yok — Sözlük penceresinden ekleyin"
                onClear={() => writes.writeCounterparty(null)}
                clearLabel="Cariyi kaldır"
              />
            </FieldShell>
          </PanelSection>
        ) : null}

        <PanelSection title="Etiketler" hint="serbest işaret — izah değil">
          <MultiSelect
            checkable
            options={writes.tagOptions}
            selected={writes.tags}
            onChange={writes.writeTags}
            addLabel="+ etiket"
            searchPlaceholder="Etiket ara ya da yaz…"
            emptyText="Etiket yok"
            onCreate={(label) => void writes.createTag(label)}
          />
        </PanelSection>
      </div>
    </aside>
  );
}
