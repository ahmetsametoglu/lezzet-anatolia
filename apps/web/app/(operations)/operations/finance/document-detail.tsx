'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { dayMonth, money } from '@/components/operation/ui/format';
import { documentPaymentsAction } from '@/lib/finance/actions';
import { CloseButton, PanelSection } from './detail-parts';
import { DOCUMENT_DIRECTION_LABEL } from './finance-labels';
import type { DocumentPaymentsView, DocumentRowView } from './finance-types';
import { DocumentPaymentSelector } from './match-selector';

/*
  BELGENİN AYRINTISI (12.17) — Belgeler sekmesinde satıra dokununca sağ sütunda açılır. "Bu fatura ne
  kadar, ne kadarı ödendi, hangi hareketlerle" sorusu tek yerde: ödemeler bağ tutarıyla listelenir,
  bağlanabilecek hareketler motorun puanıyla önerilir (muhasebeci'nin fatura yanındaki seçicisi).
  "Ödemesini yaz" belgeden yeni bir ödeme hareketi yazar ve bağlar — ödeme henüz deftere girmemişse.
*/

interface DocumentDetailProps {
  document: DocumentRowView;
  tagLabels: ReadonlyMap<string, string>;
  /** Panel okumasının sürümü — bir yazımdan sonra artar, ödemeler yeniden istenir. */
  version: number;
  busy: boolean;
  onClose: () => void;
  onPay: (document: DocumentRowView) => void;
  onOpenFile: (document: DocumentRowView) => void;
  onLinkDocument: (movementId: string, documentId: string) => Promise<boolean>;
  onRemoveAllocation: (movementId: string, documentId: string) => void;
}

export function DocumentDetail({ document, tagLabels, version, busy, onClose, onPay, onOpenFile, onLinkDocument, onRemoveAllocation }: DocumentDetailProps) {
  const [view, setView] = useState<DocumentPaymentsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void documentPaymentsAction(document.id)
      .then(({ data, error: actionError }) => {
        if (cancelled) return;
        setView(data);
        setError(actionError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Panel başka belgeye geçer ya da kapanırsa geç gelen cevap yazılmaz.
    return () => {
      cancelled = true;
    };
  }, [document.id, version]);

  const payments = view?.payments ?? [];
  const tags = document.tags.map((tag) => tagLabels.get(tag) ?? tag);

  return (
    <aside className="flex min-h-0 flex-1 flex-col" aria-label="Belgenin ayrıntısı">
      <header className="flex items-start gap-3 border-b border-ops-line bg-ops-card px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5">
            <Badge tone={document.direction === 'out' ? 'amber' : 'olive'} outline>
              {document.kindLabel}
            </Badge>
            <span className="font-ops-body text-ops-xs text-ops-faint">{DOCUMENT_DIRECTION_LABEL[document.direction]}</span>
          </span>
          <span className="font-ops-body text-ops-base text-ops-ink [overflow-wrap:anywhere]">
            {document.number ? <span className="font-ops-mono">{document.number} · </span> : null}
            {document.partyName ?? '—'}
          </span>
          <span className="font-ops-body text-ops-xs text-ops-faint">
            {dayMonth(document.issuedOn)}
            {document.natureLabel ? ` · ${document.natureLabel}` : ''}
            {tags.length > 0 ? ` · ${tags.join(', ')}` : ''}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-3 gap-3">
          <Figure label="Belge toplamı" value={money(document.amountCents)} />
          {/* KDV belgede yoksa "—": sıfır "KDV yok" demek olurdu, "bilinmiyor" değil (CLAUDE §1). */}
          <Figure label="KDV" value={document.vatAmountCents === null ? '—' : money(document.vatAmountCents)} />
          <Figure label="Açık kalan" value={money(document.openAmountCents)} tone={document.openAmountCents > 0 ? 'amber' : document.openAmountCents < 0 ? 'red' : 'olive'} />
        </dl>
        {document.note ? <p className="font-ops-body text-ops-xs text-ops-muted">{document.note}</p> : null}
        <div className="flex flex-wrap gap-2">
          {document.openAmountCents > 0 ? (
            <Button size="sm" onClick={() => onPay(document)}>
              {document.direction === 'out' ? 'Ödemesini yaz' : 'Tahsilatını yaz'}
            </Button>
          ) : null}
          {document.hasFile ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onOpenFile(document)}>
              {busy ? '…' : 'Belgeyi aç'}
            </Button>
          ) : null}
        </div>

        <PanelSection title="Ödemeler" hint="belgeyi kapatan hareketler — bağ tutarıyla">
          {loading && !view ? <p className="font-ops-body text-ops-xs text-ops-faint">Ödemeler okunuyor…</p> : null}
          {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}
          {payments.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {payments.map((payment) => (
                <li key={payment.movementId} className="flex items-center gap-2 rounded-sm border-l-2 border-ops-olive bg-ops-card px-2.5 py-1.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-ops-body text-ops-xs text-ops-ink">{payment.title}</span>
                    <span className="truncate font-ops-body text-ops-micro text-ops-faint">
                      {payment.accountName} · {dayMonth(payment.valueDate)}
                      {payment.amountCents !== payment.movementAmountCents ? ` · hareket ${money(payment.movementAmountCents)}` : ''}
                    </span>
                  </span>
                  <span className="flex-none font-ops-mono text-ops-xs text-ops-ink">{money(payment.amountCents)}</span>
                  {payment.removable ? (
                    <button
                      type="button"
                      onClick={() => onRemoveAllocation(payment.movementId, document.id)}
                      title="Ödeme bağını kaldır — hareket ve belge kalır, açık kalan geri gelir"
                      aria-label={`${payment.title} bağını kaldır`}
                      className="flex-none cursor-pointer rounded-sm px-1 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : view ? (
            <p className="font-ops-body text-ops-xs text-ops-faint">Henüz ödeme bağlanmadı.</p>
          ) : null}
          <div>
            <DocumentPaymentSelector
              amountCents={document.amountCents}
              view={view}
              loading={loading}
              error={error}
              onLink={(movementId) => void onLinkDocument(movementId, document.id)}
              onRemove={(movementId) => onRemoveAllocation(movementId, document.id)}
              disabled={busy}
            />
          </div>
        </PanelSection>
      </div>
    </aside>
  );
}

interface FigureProps {
  label: string;
  value: string;
  tone?: 'amber' | 'olive' | 'red';
}

function Figure({ label, value, tone }: FigureProps) {
  const color = tone === 'amber' ? 'text-ops-amber-dark' : tone === 'olive' ? 'text-ops-olive-dark' : tone === 'red' ? 'text-ops-red' : 'text-ops-ink';
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-ops-card px-3 py-2">
      <dt className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-faint">{label}</dt>
      <dd className={`whitespace-nowrap font-ops-mono text-ops-base ${color}`}>{value}</dd>
    </div>
  );
}
