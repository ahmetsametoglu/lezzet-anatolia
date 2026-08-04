'use client';

import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { AccountSetup } from './account-setup';
import { AccountStrip, FilterBar, MatchQueue, MovementList } from './finance-sections';
import { MovementDialog } from './movement-dialog';
import { TransferDialog } from './transfer-dialog';
import { ALL_ACCOUNTS } from './finance-url';
import type { FinanceViewProps } from './finance-types';

// Para — MASAÜSTÜ. Tasarımın tezgâhı: başlık + eylemler · bakiye şeridi · süzgeç barı · ikiye
// bölünmüş gövde (hareketler | eşleştirme kuyruğu).
//
// Bölünme oranı tasarımın kendi ölçüsü (1.65fr / 1fr): hareket listesi asıl yüzey, kuyruk onun
// yanında duran bir iş masası — ikisi eşit bölünseydi liste tarama gücünü kaybederdi.

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
}: FinanceViewProps) {
  const hasAccounts = data.accounts.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Para" subtitle="İşletme para takibi · resmî muhasebe değil">
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('movement')} disabled={!hasAccounts}>
          + Hareket
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('transfer')} disabled={writableAccounts.length < 2}>
          ⇄ Transfer
        </Button>
      </PageHeader>

      {hasAccounts ? (
        <>
          <AccountStrip accounts={data.accounts} totalCents={data.totalCents} />
          <FilterBar
            accounts={data.accounts}
            urlState={urlState}
            unmatchedCount={data.unmatchedCount}
            onChange={onFilter}
          />

          <div className="grid min-h-0 flex-1 grid-cols-[1.65fr_1fr] overflow-hidden">
            <div className="flex min-h-0 flex-col border-r border-ops-line">
              <MovementList ledger={data.ledger} />
            </div>

            <div className="flex min-h-0 flex-col bg-ops-surface-sunken">
              <div className="flex flex-col gap-0.5 border-b border-ops-line px-5 py-3">
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
        <MovementDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} />
      ) : null}
      {dialog === 'transfer' ? (
        <TransferDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} />
      ) : null}
    </div>
  );
}
