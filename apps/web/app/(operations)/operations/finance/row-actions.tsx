'use client';

import { ActionMenu } from '@/components/operation/ui/action-menu';
import { Chip } from '@/components/operation/ui/chip';
import { CheckIcon, DocumentIcon, NavIcon } from '@/components/operation/ui/icons';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { documentPaymentsAction, matchOptionsAction } from '@/lib/finance/actions';
import { SUGGESTION_VIEW } from './finance-labels';
import type { DocumentPaymentsView, DocumentRowView, MatchOptionsView, MovementRowView } from './finance-types';
import { DocumentPaymentSelector, MovementMatchSelector } from './match-selector';
import { useLazyRead } from './use-lazy-read.hook';

/*
  SATIRIN EYLEMLERİ (12.21 · kullanıcı kararı: "sağ taraftaki panel anlamını büyük yitirdi, kaldıralım;
  o panelden yapılıp tabloda olmayan işi tablodan yapılabilir kılalım") — panelin her işi satırın kendi
  kontrolüne geldi:
   · hareket → "Karşılığı" hapı: eşleştirme menüsü (her hedef, belge bağı ve kaldırması, eşleşmiş
     satırda "Eşleşmeyi geri al"); güçlü öneride yanında ✓ — tek dokunuşla onay
   · belge → ödeme hapı (bağlı ödemeler ve kaldırma menüde) · ⋯ menüsünde "Ödemesini yaz" ve "Belgeyi aç"
  Menülerin verisi AÇILINCA okunur (`useLazyRead`).
*/

/** Satırın bağ kararları — defter listesi hepsini aynı kapıya iletir; `busyId` o satırı kilitler. */
export interface RowMatcher {
  busyId: string | null;
  onApplyTarget: (movementId: string, target: MatchTarget) => Promise<boolean>;
  onLinkDocument: (movementId: string, documentId: string) => Promise<boolean>;
  onRemoveAllocation: (movementId: string, documentId: string) => void;
  onUnmatch: (movementId: string) => void;
}

interface MovementMatchCellProps {
  row: MovementRowView;
  matcher: RowMatcher;
}

export function MovementMatchCell({ row, matcher }: MovementMatchCellProps) {
  const options = useLazyRead<MatchOptionsView>(() => matchOptionsAction(row.id));
  const busy = matcher.busyId === row.id;
  // Bağlanabilir mi (panelin kuralı, 12.17): eşleşme bekleyen ekstre satırı her hedefe; tür alan elle
  // satır ve stok alımı belgeye.
  const linkable = row.fromBank ? !row.reconciled : row.canClassify || row.type === 'purchase';
  const common = {
    amountCents: row.amountCents,
    remainingCents: row.remainingCents,
    linkedDocuments: row.documents,
    removable: !row.fromBank,
    options: options.data,
    loading: options.loading,
    error: options.error,
    onOpen: options.load,
    onApplyTarget: (target: MatchTarget) => void matcher.onApplyTarget(row.id, target),
    onLinkDocument: (documentId: string) => void matcher.onLinkDocument(row.id, documentId),
    onRemoveAllocation: (documentId: string) => matcher.onRemoveAllocation(row.id, documentId),
    size: 'cell' as const,
    className: 'min-w-0',
    disabled: busy,
  };

  if (row.fromBank && !row.reconciled) {
    // Eşleşme bekleyen ekstre satırı: hap önerinin kendisi ("öneri: …"), kısmen bağlıysa bağın hâli.
    const partial = row.documents.length > 0;
    const target = row.suggestionTarget;
    return (
      <div className="flex min-w-0 items-center gap-1">
        <MovementMatchSelector
          {...common}
          triggerLabel={partial ? undefined : row.suggestionTitle ? `öneri: ${row.suggestionTitle}` : 'Eşleştir'}
          tone={partial ? undefined : SUGGESTION_VIEW[row.suggestion ?? 'none'].tone}
          // Kısmen bağlı ya da carisi konmuş satırın cevabı da geri alınır (panelin kuralı: `canUnmatch`).
          onUnmatch={row.canUnmatch ? () => matcher.onUnmatch(row.id) : undefined}
        />
        {target ? (
          <Chip
            size="cell"
            active
            className="flex-none hover:bg-ops-olive-dark"
            ariaLabel={`Öneriyi onayla — ${row.suggestionTitle ?? 'güçlü aday'}`}
            onClick={busy ? undefined : () => void matcher.onApplyTarget(row.id, target)}
          >
            <CheckIcon size={12} />
          </Chip>
        ) : null}
      </div>
    );
  }
  if (row.canUnmatch) {
    // Eşleşmiş ekstre satırı: hap bağı söyler; menü bağlı belgeleri ve "Eşleşmeyi geri al"ı gösterir.
    const withDocuments = row.documents.length > 0;
    return (
      <MovementMatchSelector
        {...common}
        onOpen={undefined}
        matched
        triggerLabel={withDocuments ? undefined : (row.link?.text ?? 'eşleşti')}
        tone={withDocuments ? undefined : 'olive'}
        onUnmatch={() => matcher.onUnmatch(row.id)}
      />
    );
  }
  if (linkable) return <MovementMatchSelector {...common} triggerLabel={row.documents.length > 0 ? undefined : 'Belgeye bağla'} />;
  return row.link ? (
    <span title={row.link.text} className={`min-w-0 truncate font-ops-body text-ops-xs ${row.link.tone === 'olive' ? 'text-ops-olive-dark' : 'text-ops-muted'}`}>
      {row.link.text}
    </span>
  ) : null;
}

/** Belge satırının eylemleri — belge listesi hepsini aynı kapılara iletir; `busyId` o satırı kilitler. */
export interface DocumentRowActions {
  busyId: string | null;
  onPay: (document: DocumentRowView) => void;
  onOpenFile: (document: DocumentRowView) => void;
  onLinkDocument: (movementId: string, documentId: string) => Promise<boolean>;
  onRemoveAllocation: (movementId: string, documentId: string) => void;
}

interface DocumentActionsCellProps {
  document: DocumentRowView;
  actions: DocumentRowActions;
}

export function DocumentActionsCell({ document, actions }: DocumentActionsCellProps) {
  const payments = useLazyRead<DocumentPaymentsView>(() => documentPaymentsAction(document.id));
  const busy = actions.busyId === document.id;
  // Seyrek eylemler ⋯ menüsünde: ödeme yalnız açık kalan varken, dosya yalnız yüklüyse (panelin kuralı).
  const items = [
    ...(document.openAmountCents > 0
      ? [{ key: 'pay', icon: <NavIcon name="para" />, label: document.direction === 'out' ? 'Ödemesini yaz' : 'Tahsilatını yaz', hint: 'elle hareket penceresi belgeyle dolu açılır', onSelect: () => actions.onPay(document) }]
      : []),
    ...(document.hasFile ? [{ key: 'file', icon: <DocumentIcon />, label: 'Belgeyi aç', hint: 'dosya yeni sekmede açılır', onSelect: () => actions.onOpenFile(document) }] : []),
  ];

  return (
    <div className="flex min-w-0 items-center justify-end gap-1">
      <DocumentPaymentSelector
        amountCents={document.amountCents}
        openAmountCents={document.openAmountCents}
        view={payments.data}
        loading={payments.loading}
        error={payments.error}
        onOpen={payments.load}
        onLink={(movementId) => void actions.onLinkDocument(movementId, document.id)}
        onRemove={(movementId) => actions.onRemoveAllocation(movementId, document.id)}
        size="cell"
        className="min-w-0"
        disabled={busy}
      />
      {items.length > 0 ? <ActionMenu compact label="Belgenin eylemleri" items={items} /> : null}
    </div>
  );
}
