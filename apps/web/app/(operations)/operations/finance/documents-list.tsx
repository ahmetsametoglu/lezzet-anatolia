'use client';

import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { dayMonth, money } from '@/components/operation/ui/format';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { DOCUMENT_DIRECTION_LABEL, DOCUMENT_STATE_LABEL, NOTES } from './finance-labels';
import type { DocumentRowView } from './finance-types';
import { DocumentActionsCell, type DocumentRowActions } from './row-actions';

/*
  BELGELER SEKMESİ (12.17 · kullanıcı sorusu 13.09: "belgeleri nerede görüyorum, nerede listeliyorum?")
  — fatura, fiş, bordro, sözleşme, dekont; açık ve kapanmış hepsi, belge gününe göre en yeni önce.

  Bir tur yalnız AÇIK belgeler sağ sütunda kart olarak duruyordu: ödenen belge ekrandan kayboluyor ve
  "şu faturayı hangi havale kapattı" sorusunun cevabı hiçbir yerde okunmuyordu.

  12.21 (sağ panel kalktı): belgenin işi SATIRINDA — ödeme hapı (bağlı ödemeler, kaldırma, adaylar) ve
  ⋯ menüsü ("Ödemesini yaz", "Belgeyi aç"); panelin KDV'si satırın ikinci satırında.
*/

const DOC_GRID = 'grid grid-cols-[56px_minmax(0,1.5fr)_minmax(0,1fr)_100px_112px_minmax(0,220px)_10px] items-center gap-x-3';

type DocumentState = keyof typeof DOCUMENT_STATE_LABEL;

/** Belgenin hâli açık kalanından türer: borç sürüyor, kapandı ya da fazla ödendi (gizlenmez). */
function stateOf(document: DocumentRowView): DocumentState {
  if (document.openAmountCents > 0) return 'open';
  return document.openAmountCents === 0 ? 'settled' : 'overpaid';
}

const STATE_TEXT: Record<DocumentState, string> = {
  open: 'text-ops-amber-dark',
  settled: 'text-ops-olive-dark',
  overpaid: 'text-ops-red',
};

const STATE_DOT: Record<DocumentState, string> = {
  open: 'bg-ops-amber',
  settled: 'bg-ops-olive',
  overpaid: 'bg-ops-red',
};

interface DocumentListProps {
  rows: DocumentRowView[];
  note: string | null;
  /** Etiketin okunur adı — satır slug taşır. */
  tagLabels: ReadonlyMap<string, string>;
  /** Satırın eylemleri — ödeme hapı ve ⋯ menüsü (12.21). */
  actions: DocumentRowActions;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function DocumentList({ rows, note, tagLabels, actions, hasMore, loadingMore, onLoadMore }: DocumentListProps) {
  if (rows.length === 0) return <EmptyState title="Belge yok" description={note ?? NOTES.noDocuments} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`${DOC_GRID} border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint`}
      >
        <span>Tarih</span>
        <span>Belge</span>
        <span>Tür · etiket</span>
        <span className="text-right">Tutar</span>
        <span className="text-right">Açık kalan</span>
        <span className="text-right">Ödeme</span>
        <span />
      </div>
      <ul aria-label="Belgeler" className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((document) => {
          const state = stateOf(document);
          const classes = [document.natureLabel, ...document.tags.map((tag) => tagLabels.get(tag) ?? tag)].filter(Boolean).join(' · ');
          const heading = `${document.number ? `${document.number} · ` : ''}${document.partyName ?? '—'}`;
          return (
            <li key={document.id} className={`${DOC_GRID} border-b border-ops-line-soft px-6 py-2 transition-colors hover:bg-ops-subtle`}>
              <span className="font-ops-mono text-ops-xs text-ops-faint">{dayMonth(document.issuedOn)}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Badge tone={document.direction === 'out' ? 'amber' : 'olive'} outline className="shrink-0">
                    {document.kindLabel}
                  </Badge>
                  <span title={heading} className="min-w-0 truncate font-ops-body text-ops-sm text-ops-ink">
                    {document.number ? <span className="font-ops-mono">{document.number} · </span> : null}
                    {document.partyName ?? '—'}
                  </span>
                </span>
                {/* KDV belgede yoksa yazılmaz: sıfır "KDV yok" demek olurdu, "bilinmiyor" değil (CLAUDE §1). */}
                <span className="truncate font-ops-body text-ops-micro text-ops-faint">
                  {DOCUMENT_DIRECTION_LABEL[document.direction]}
                  {document.vatAmountCents === null ? '' : ` · KDV ${money(document.vatAmountCents)}`}
                  {document.note ? ` · ${document.note}` : ''}
                </span>
              </div>
              <span className="truncate font-ops-body text-ops-xs text-ops-muted">{classes || '—'}</span>
              <span className="text-right font-ops-mono text-ops-sm text-ops-ink">{money(document.amountCents)}</span>
              <span className={`text-right font-ops-mono text-ops-sm ${STATE_TEXT[state]}`}>
                {state === 'settled' ? DOCUMENT_STATE_LABEL.settled : money(document.openAmountCents)}
              </span>
              <DocumentActionsCell document={document} actions={actions} />
              <span title={DOCUMENT_STATE_LABEL[state]} aria-label={DOCUMENT_STATE_LABEL[state]} role="img" className={`size-2 rounded-full ${STATE_DOT[state]}`} />
            </li>
          );
        })}
        <li className="list-none">
          <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
        </li>
      </ul>
    </div>
  );
}
