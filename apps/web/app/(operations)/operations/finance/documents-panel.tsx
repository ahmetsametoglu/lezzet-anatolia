'use client';

import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { dayMonth, money } from '@/components/operation/ui/format';
import { NOTES } from './finance-labels';
import type { OpenDocumentView } from './finance-types';

/*
  AÇIK BELGELER (12.12) — ödenmemiş faturalar, bordrolar; bize ödenecek dekontlar.

  Fatura girildiğinde borç doğdu; bu panel "kim kime ne kadar borçlu" sorusunun belge tarafıdır.
  "Ödemesini yaz" elle hareket formunu belgeyle DOLU açar (tutar = açık kalan, etiketler belgenin);
  kaydedilince ödeme belgeye bağlanır ve açık kalan düşer — sıfıra inen belge panelden çıkar.

  Dosya bağlantısı TIKLANINCA üretilir: okuma adresi kısa ömürlü, listeyle birlikte üretilse
  operatör açmaya kalktığında süresi dolmuş olurdu.
*/

interface DocumentsPanelProps {
  documents: OpenDocumentView[];
  busyId: string | null;
  onPay: (document: OpenDocumentView) => void;
  onOpenFile: (document: OpenDocumentView) => void;
}

export function DocumentsPanel({ documents, busyId, onPay, onOpenFile }: DocumentsPanelProps) {
  if (documents.length === 0) {
    return <EmptyState title="Açık belge yok" description={NOTES.noOpenDocuments} fill={false} />;
  }

  return (
    <ul className="flex flex-col gap-2.5 p-4">
      {documents.map((doc) => (
        <li key={doc.id} className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-surface p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={doc.direction === 'out' ? 'amber' : 'olive'} outline className="shrink-0">
                {doc.kindLabel}
              </Badge>
              <span className="min-w-0 truncate font-ops-body text-ops-sm text-ops-ink">
                {doc.number ? <span className="font-ops-mono">{doc.number} · </span> : null}
                {doc.partyName ?? '—'}
              </span>
            </div>
            {/* Açık kalan MONO ve vurgulu: kartın sorusu "ne kadar kaldı", "ne kadardı" değil. */}
            <span className="shrink-0 font-ops-mono text-ops-base text-ops-ink">{money(doc.openAmountCents)}</span>
          </div>
          <div className="flex items-center gap-2 font-ops-body text-ops-micro text-ops-faint">
            <span>{dayMonth(doc.issuedOn)}</span>
            <span aria-hidden>·</span>
            <span>{doc.direction === 'out' ? 'biz ödeyeceğiz' : 'bize ödenecek'}</span>
            {doc.openAmountCents !== doc.amountCents ? (
              <>
                <span aria-hidden>·</span>
                <span>toplam {money(doc.amountCents)}</span>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busyId === doc.id}
              onClick={() => onPay(doc)}
              className="flex-1 cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-ink transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
            >
              {doc.direction === 'out' ? 'Ödemesini yaz' : 'Tahsilatını yaz'}
            </button>
            {doc.hasFile ? (
              <button
                type="button"
                disabled={busyId === doc.id}
                onClick={() => onOpenFile(doc)}
                title="Belge dosyasını yeni sekmede aç"
                className="cursor-pointer rounded-ops-btn border border-ops-line px-3 py-2 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken disabled:cursor-wait disabled:opacity-60"
              >
                {busyId === doc.id ? '…' : 'Belgeyi aç'}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
