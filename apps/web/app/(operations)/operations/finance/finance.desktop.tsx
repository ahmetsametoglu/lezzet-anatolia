'use client';

import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { AccountSetup } from './account-setup';
import { BankImportDialog } from './bank-import-dialog';
import { DictionaryDialog } from './dictionary-dialog';
import { DocumentDialog } from './document-dialog';
import { DocumentsPanel } from './documents-panel';
import { AccountStrip, FilterBar, MatchQueue, MovementList } from './finance-sections';
import { MovementDialog } from './movement-dialog';
import { TransferDialog } from './transfer-dialog';
import { ALL_ACCOUNTS } from './finance-url';
import type { FinanceViewProps } from './finance-types';

// Para — MASAÜSTÜ. Tasarımın tezgâhı: başlık + eylemler · bakiye şeridi · süzgeç barı · ikiye
// bölünmüş gövde (hareketler | belgeler + eşleştirme kuyruğu).
//
// Bölünme oranı tasarımın kendi ölçüsü (1.65fr / 1fr): hareket listesi asıl yüzey, sağ sütun onun
// yanında duran bir iş masası — ikisi eşit bölünseydi liste tarama gücünü kaybederdi.
//
// ── SAĞ SÜTUNDA İKİ İŞ KUYRUĞU (12.12) ───────────────────────────────────────
// Açık belgeler üstte, banka eşleştirmesi altta. İkisi de "kapatılacak iş"tir: biri ödenmemiş
// fatura, öteki sebebi konmamış ekstre satırı. Çizimde belge paneli YOK (kavram 13.09'da doğdu);
// kitin kart gramerinde yazıldı — açık: `design/BACKLOG.md §4`.
//
// ── SÖZLÜK VE SATIRIN ARAÇLARI (13.09 · ikinci karar) ─────────────────────────
// "Etiketler" penceresi "Sözlük" oldu: tür, cari ve etiket üç sekmede. Satırın araçları (tür · cari ·
// etiket menüleri, belge bağı, eşleşmeyi geri al) hareket listesinin içinde, dokunuşta yazılır.

export function FinanceDesktop({
  data,
  urlState,
  writableAccounts,
  dialog,
  busyId,
  queueError,
  onFilter,
  onOpenDialog,
  onCloseDialog,
  onSaved,
  onApprove,
  onPick,
  onClassify,
  onDismiss,
  onSetNature,
  onSetCounterparty,
  onTag,
  onCreateTag,
  onUnmatch,
  onRemoveAllocation,
  rowBusyId,
  rowError,
  payingDocument,
  onPayDocument,
  onClosePay,
  onOpenDocumentFile,
}: FinanceViewProps) {
  const hasAccounts = data.accounts.length > 0;
  // Pasif etiket de adıyla okunur — satır eski etiketi taşımaya devam eder, ad sözlüğün tamamından.
  const tagLabels = new Map(data.dictionary.tags.map((tag) => [tag.slug, tag.label] as const));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Para" subtitle="İşletme para takibi · resmî muhasebe değil, ama her hareket izahlı">
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('movement')} disabled={!hasAccounts}>
          + Hareket
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('transfer')} disabled={writableAccounts.length < 2}>
          ⇄ Transfer
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('document')}>
          + Belge
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('dictionary')}>
          Sözlük
        </Button>
        {/* Çizimin son düğmesi (12.10): dosya tarayıcıda okunur, satırlar hesabın hareketi olur, kuyruğa düşer. */}
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('bankImport')} disabled={writableAccounts.length === 0}>
          ↑ Banka dosyası
        </Button>
      </PageHeader>

      {hasAccounts ? (
        <>
          <AccountStrip accounts={data.accounts} totalCents={data.totalCents} />
          <FilterBar
            accounts={data.accounts}
            urlState={urlState}
            unexplainedCount={data.unexplainedCount}
            onChange={onFilter}
          />

          <div className="grid min-h-0 flex-1 grid-cols-[1.65fr_1fr] overflow-hidden">
            <div className="flex min-h-0 flex-col border-r border-ops-line">
              {rowError ? (
                <p className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5 font-ops-body text-ops-xs text-ops-red">{rowError}</p>
              ) : null}
              <MovementList
                ledger={data.ledger}
                editor={{
                  natureOptions: data.natureOptions,
                  counterpartyOptions: data.counterpartyOptions,
                  tagOptions: data.tagOptions,
                  tagLabels,
                  queue: data.queue,
                  busyId: rowBusyId,
                  onSetNature,
                  onSetCounterparty,
                  onTag,
                  onCreateTag,
                  onPick,
                  onUnmatch,
                  onRemoveAllocation,
                }}
              />
            </div>

            <div className="flex min-h-0 flex-col overflow-y-auto bg-ops-surface-sunken">
              <div className="flex flex-col gap-0.5 border-b border-ops-line px-5 py-3">
                <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Açık belgeler</span>
                <span className="font-ops-body text-ops-xs text-ops-faint">ödenmemiş fatura ve bordro · bize ödenecek dekont</span>
              </div>
              <DocumentsPanel documents={data.openDocuments} busyId={busyId} onPay={onPayDocument} onOpenFile={onOpenDocumentFile} />

              <div className="flex flex-col gap-0.5 border-y border-ops-line px-5 py-3">
                <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Banka satırı eşleştirme</span>
                <span className="font-ops-body text-ops-xs text-ops-faint">sistem önerir, siz onaylarsınız</span>
              </div>
              {queueError ? (
                <p className="border-b border-ops-red-line bg-ops-red-bg px-5 py-2.5 font-ops-body text-ops-xs text-ops-red">
                  {queueError}
                </p>
              ) : null}
              <MatchQueue
                rows={data.queue}
                accountSelected={urlState.acct !== ALL_ACCOUNTS}
                busyId={busyId}
                natureOptions={data.natureOptions}
                onApprove={onApprove}
                onPick={onPick}
                onClassify={onClassify}
                onDismiss={onDismiss}
              />
            </div>
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
      {dialog === 'transfer' ? (
        <TransferDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} />
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
