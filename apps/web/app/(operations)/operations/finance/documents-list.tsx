'use client';

import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { amount, dayMonth, money, monthYear } from '@/components/operation/ui/format';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { DOCUMENT_DIRECTION_LABEL, VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';
import { DOCUMENT_STATE_LABEL, NOTES } from './finance-labels';
import { groupConsecutive } from './finance-read';
import type { DocumentRowView } from './finance-types';
import { GroupHeading, ROW_EDGE } from './list-parts';
import { DocumentActionsCell, type DocumentRowActions } from './row-actions';

/*
  BELGELER SEKMESİ (12.17 · kullanıcı sorusu 13.09: "belgeleri nerede görüyorum, nerede listeliyorum?")
  — fatura, fiş, bordro, sözleşme, dekont; açık ve kapanmış hepsi, belge gününe göre en yeni önce.

  Bir tur yalnız AÇIK belgeler sağ sütunda kart olarak duruyordu: ödenen belge ekrandan kayboluyor ve
  "şu faturayı hangi havale kapattı" sorusunun cevabı hiçbir yerde okunmuyordu.

  12.21 (sağ panel kalktı): belgenin işi SATIRINDA — ödeme hapı (bağlı ödemeler, kaldırma, adaylar) ve
  ⋯ menüsü ("Ödemesini yaz", "Belgeyi aç"); panelin KDV'si satırın ikinci satırında.

  12.23 (kullanıcı isteği: "aynı çalışmayı belgeler tablosu için de yap" · seçimler: "aylara göre",
  "belge tutarı, altında açık kalan"): liste aylara göre gruplu — fatura, kira, telefon aylık gelir,
  günlere bölünse neredeyse her belge kendi başlığını alırdı; belgenin günü alt satırın başında. Tutar ile
  açık kalan tek sütunda: üstte belge tutarı (satırın en büyük yazısı, sağ kenarda), altında renkli hâl.
  Açık belgenin solunda amber, fazla ödenmişin solunda kırmızı çizgi; sağ uçtaki nokta kalktı.
*/

const DOC_GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,240px)_140px] items-center gap-x-3';

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

/** İş bekleyen belgenin sol kenarı — açık amber, fazla ödenmiş kırmızı; kapanmış belge sessiz. */
const STATE_EDGE: Record<DocumentState, string> = {
  open: ROW_EDGE.amber,
  settled: '',
  overpaid: ROW_EDGE.red,
};

/** Tutarın altındaki hâl: "açık 360,00" · "kapandı" · "fazla ödendi 12,00" — kalan varsa rakamıyla. */
function stateLine(document: DocumentRowView, state: DocumentState): string {
  return state === 'settled' ? DOCUMENT_STATE_LABEL.settled : `${DOCUMENT_STATE_LABEL[state]} ${amount(Math.abs(document.openAmountCents))}`;
}

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
        <span>Belge</span>
        <span>Tür · etiket</span>
        <span className="text-right">Ödeme</span>
        <span className="text-right">Tutar</span>
      </div>
      <ul aria-label="Belgeler" className="min-h-0 flex-1 overflow-y-auto">
        {groupConsecutive(rows, (document) => document.issuedOn.slice(0, 7)).map((group) => {
          const month = monthYear(`${group.key}-01`);
          return (
            // AY (12.23): başlık yapışkan ve toplamsız — bkz. `GroupHeading`.
            <li key={group.key}>
              <GroupHeading title={month} />
              <ul aria-label={month}>
                {group.rows.map((document) => {
                  const state = stateOf(document);
                  const classes = [document.natureLabel, ...document.tags.map((tag) => tagLabels.get(tag) ?? tag)].filter(Boolean).join(' · ');
                  const heading = `${document.number ? `${document.number} · ` : ''}${document.partyName ?? '—'}`;
                  return (
                    <li key={document.id} className={`${DOC_GRID} border-b border-ops-line-soft px-6 py-2 transition-colors hover:bg-ops-subtle ${STATE_EDGE[state]}`}>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Badge tone={document.direction === 'out' ? 'amber' : 'olive'} outline className="shrink-0">
                            {document.kindLabel}
                          </Badge>
                          <span title={heading} className="min-w-0 truncate font-ops-body text-ops-base text-ops-ink">
                            {document.number ? <span className="font-ops-mono">{document.number} · </span> : null}
                            {document.partyName ?? '—'}
                          </span>
                        </span>
                        {/* Günü alt satırın başında — ay başlıkta. KDV belgede yoksa yazılmaz: sıfır "KDV yok" demek
                            olurdu, "bilinmiyor" değil (CLAUDE §1). */}
                        {/* Vade ve rejim (12.26): vade belgede yazıyorsa, rejim yalnız standart DEĞİLSE — ters yüklemeli
                            faturada "KDV 0" ile beyan edilecek KDV'yi ayırt eden tek işaret bu. */}
                        <span className="truncate font-ops-body text-ops-micro text-ops-faint">
                          {dayMonth(document.issuedOn)} · {DOCUMENT_DIRECTION_LABEL[document.direction]}
                          {document.dueOn ? ` · vade ${dayMonth(document.dueOn)}` : ''}
                          {document.vatAmountCents === null ? '' : ` · KDV ${money(document.vatAmountCents)}`}
                          {document.vatRegime === 'standard' ? '' : ` · ${VAT_REGIME_LABEL[document.vatRegime]}`}
                          {document.note ? ` · ${document.note}` : ''}
                        </span>
                      </div>
                      <span className="truncate font-ops-body text-ops-xs text-ops-muted">{classes || '—'}</span>
                      <DocumentActionsCell document={document} actions={actions} />
                      {/* TUTAR (12.23): belge tutarı satırın en büyük yazısı, sağ kenarda; altında renkli hâl. */}
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="whitespace-nowrap font-ops-mono text-ops-lead font-semibold text-ops-ink">{amount(document.amountCents)}</span>
                        <span className={`whitespace-nowrap font-ops-mono text-ops-xs ${STATE_TEXT[state]}`}>{stateLine(document, state)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
