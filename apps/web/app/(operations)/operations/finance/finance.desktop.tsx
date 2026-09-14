'use client';

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
import { TransferDialog } from './transfer-dialog';

// Para — MASAÜSTÜ (12.17 düzeni, kullanıcı istekleri 13.09 · 12.21):
//   başlık · bakiye şeridi (= hesap süzgeci; Toplam en solda, gruplu, kapananlar sonda, yatay kayar)
//   · tek bant: "Hareketler | Belgeler" + süzgeçler + izah sayacı + Eylemler menüsü
//   · gövde: tam genişlik liste — satırın bütün işi satırın kendisinde (12.21: sağ panel kalktı; tür ·
//     cari · etiket orta hücrede, bağ ve öneri "Karşılığı" hapında, belgenin ödemesi kendi hapında).
//
// Başlıktaki beş düğme kalktı: seyrek eylemler (hareket, transfer, belge, banka dosyası, sözlük)
// bandın sağındaki tek menüde. Açık belgeler sağ sütundan Belgeler sekmesine taşındı — ödenen belge
// artık ekrandan kaybolmuyor. Çizimde bu düzen yok; kitin gramerinde yazıldı (`design/BACKLOG.md §4`).

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

      {dialog === 'movement' ? (
        <MovementDialog
          accounts={writableAccounts}
          natureOptions={data.natureOptions}
          counterpartyOptions={data.counterpartyOptions}
          tagOptions={data.tagOptions}
          onCreateTag={onCreateTag}
          onClose={onCloseDialog}
          onSaved={onSaved}
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
            valueDate: new Date().toISOString().slice(0, 10),
            description: `${payingDocument.kindLabel}${payingDocument.number ? ` ${payingDocument.number}` : ''}${
              payingDocument.partyName ? ` — ${payingDocument.partyName}` : ''
            }`,
            documentId: payingDocument.id,
          }}
        />
      ) : null}
      {dialog === 'transfer' ? <TransferDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} /> : null}
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
