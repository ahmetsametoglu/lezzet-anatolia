'use client';

import { movementToday } from '@/components/operation/form/movement-form/schema';
import { PageHeader } from '@/components/operation/ui/page-header';
import { AccountSetup } from './account-setup';
import { BankImportDialog } from './bank-import-dialog';
import { DictionaryDialog } from './dictionary-dialog';
import { DocumentDialog } from './document-dialog';
import { DocumentList } from './documents-list';
import { AccountStrip, FinanceToolbar, MovementList } from './finance-sections';
import type { FinanceViewProps, RowEditor } from './finance-types';
import { ALL_ACCOUNTS } from './finance-url';
import { MovementDialog } from './movement-dialog';
import type { DocumentRowActions, RowMatcher } from './row-actions';

// Para masaüstü: başlık, hesap süzgeci olan bakiye satırı, "Hareketler | Belgeler" bandı ve satırın bütün işini kendinde taşıyan tam
// genişlik liste. Seyrek eylemler bandın sağındaki tek menüdedir; çizimde bu düzen yok, kitin gramerinde yazıldı.

export function FinanceDesktop({
  data,
  urlState,
  writableAccounts,
  dialog,
  busyId,
  onFilter,
  onOpenDialog,
  onCloseDialog,
  onSaved,
  onSetNature,
  onSetCounterparty,
  onTag,
  onCreateTag,
  onUnmatch,
  onRemoveAllocation,
  onApplyTarget,
  onLinkDocument,
  rowBusyId,
  rowError,
  movementRows,
  documentRows,
  hasMore,
  loadingMore,
  onLoadMore,
  payingDocument,
  onPayDocument,
  onClosePay,
  onOpenDocumentFile,
}: FinanceViewProps) {
  const hasAccounts = data.accounts.length > 0;
  // Pasif etiket de adıyla okunur — satır eski etiketi taşımaya devam eder, ad sözlüğün tamamından.
  const tagLabels = new Map(data.dictionary.tags.map((tag) => [tag.slug, tag.label] as const));
  const editor: RowEditor = {
    natureOptions: data.natureOptions,
    counterpartyOptions: data.counterpartyOptions,
    tagOptions: data.tagOptions,
    tagLabels,
    onSetNature,
    onSetCounterparty,
    onTag,
    onCreateTag,
  };
  const onDocuments = urlState.tab === 'documents';
  const matcher: RowMatcher = { busyId: rowBusyId, onApplyTarget, onLinkDocument, onRemoveAllocation, onUnmatch };
  const documentActions: DocumentRowActions = { busyId, onPay: onPayDocument, onOpenFile: onOpenDocumentFile, onLinkDocument, onRemoveAllocation };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Para" subtitle="İşletme para takibi · resmî muhasebe değil, ama her hareket izahlı" />

      {hasAccounts ? (
        <>
          <AccountStrip accounts={data.accounts} totalCents={data.totalCents} selected={urlState.acct} onSelect={(acct) => onFilter({ acct })} />
          <FinanceToolbar
            urlState={urlState}
            unexplainedCount={data.unexplainedCount}
            openDocumentCount={data.openDocumentCount}
            writableAccountCount={writableAccounts.length}
            onChange={onFilter}
            onOpenDialog={onOpenDialog}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rowError ? (
              <p className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5 font-ops-body text-ops-xs text-ops-red">{rowError}</p>
            ) : null}
            {onDocuments ? (
              <DocumentList
                rows={documentRows}
                note={data.documents?.note ?? null}
                tagLabels={tagLabels}
                actions={documentActions}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={onLoadMore}
              />
            ) : (
              <MovementList
                rows={movementRows}
                note={data.ledger?.note ?? null}
                editor={editor}
                matcher={matcher}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={onLoadMore}
              />
            )}
          </div>
        </>
      ) : (
        <AccountSetup onCreated={onSaved} />
      )}

      {/* Elle hareket ve transfer tek penceredir; "Eylemler → Transfer" onu transfer kipinde açar. */}
      {dialog === 'movement' || dialog === 'transfer' ? (
        <MovementDialog
          accounts={writableAccounts}
          natureOptions={data.natureOptions}
          counterpartyOptions={data.counterpartyOptions}
          tagOptions={data.tagOptions}
          onCreateTag={onCreateTag}
          onClose={onCloseDialog}
          onSaved={onSaved}
          initialMode={dialog === 'transfer' ? 'transfer' : undefined}
        />
      ) : null}
      {/* "Ödemesini yaz" — aynı elle hareket penceresi, belgeyle DOLU: tutar açık kalan; türü, carisi
          ve etiketleri belgenin; bağ hazır. Ayrı bir "ödeme" penceresi yazılmadı; ödeme bir harekettir. */}
      {payingDocument ? (
        <MovementDialog
          accounts={writableAccounts}
          natureOptions={data.natureOptions}
          counterpartyOptions={data.counterpartyOptions}
          tagOptions={data.tagOptions}
          onCreateTag={onCreateTag}
          onClose={onClosePay}
          onSaved={onSaved}
          documentLabel={payingDocument.label}
          initial={{
            accountId: writableAccounts[0]?.id ?? '',
            // Bize ödenecek belgenin karşılığı bir GİRİŞTİR; elle giriş türlerinden yönü serbest
            // olan tek tür `misc` — "sebebi bilinmeyen para" değil, sebebi belgenin kendisi.
            type: payingDocument.direction === 'out' ? 'expense' : 'misc',
            amount: payingDocument.openAmountCents / 100,
            direction: payingDocument.direction,
            nature: payingDocument.nature ?? '',
            counterpartyId: payingDocument.counterpartyId ?? '',
            tags: [...payingDocument.tags],
            campaign: '',
            valueDate: movementToday(),
            description: `${payingDocument.kindLabel}${payingDocument.number ? ` ${payingDocument.number}` : ''}${
              payingDocument.partyName ? ` — ${payingDocument.partyName}` : ''
            }`,
            documentId: payingDocument.id,
          }}
        />
      ) : null}
      {dialog === 'document' ? (
        <DocumentDialog
          supplierOptions={data.supplierOptions}
          counterpartyOptions={data.counterpartyOptions}
          natureOptions={data.natureOptions}
          tagOptions={data.tagOptions}
          onCreateTag={onCreateTag}
          onClose={onCloseDialog}
          onSaved={onSaved}
        />
      ) : null}
      {/* Sözlük penceresi yazımdan sonra KAPANMAZ: sözlük action'ları sayfayı aynı cevapta tazeliyor
          (`revalidatePath`), liste yeni veriyle kendiliğinden çizilir. */}
      {dialog === 'dictionary' ? <DictionaryDialog dictionary={data.dictionary} onClose={onCloseDialog} /> : null}
      {dialog === 'bankImport' ? (
        <BankImportDialog
          accounts={writableAccounts}
          defaultAccountId={urlState.acct === ALL_ACCOUNTS ? null : urlState.acct}
          onClose={onCloseDialog}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
