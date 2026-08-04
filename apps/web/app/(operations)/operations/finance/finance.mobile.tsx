'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { AccountSetup } from './account-setup';
import { AccountStrip, FilterBar, MatchQueue, MovementList } from './finance-sections';
import { MovementDialog } from './movement-dialog';
import { TransferDialog } from './transfer-dialog';
import { ALL_ACCOUNTS } from './finance-url';
import type { FinanceViewProps } from './finance-types';

// Para — TELEFON.
//
// ── ÇİZİM YOK, KARAR VAR ────────────────────────────────────────────────────
// `Operasyon - Para.dc.html` yalnız masaüstünü çiziyor; mobil bölümü hiç açılmamış. Yüzey sayfa
// dokümanının §7 işlevsel notlarından kuruldu (improvise değil, çizilmemişin kaydı —
// `design/BACKLOG`): *"gider girişi çoğu zaman anlık yapılır (akaryakıt alındı, nakit çıktı) —
// hızlı elle giriş telefonda tek dakikalık iş olmalı"* ve *"banka import + satır eşleştirme daha
// oturarak yapılan bir iştir"*.
//
// İki sonucu var: **"+ Hareket" telefonda birincil düğme** (masaüstünde ikincil), ve **ikili
// gövde tek eksene iniyor** — sütun yan yana değil, sekmeyle. Kuyruk gizlenmiyor: masa işi olması
// onu telefonda yapılamaz kılmıyor, yalnız ikinci sıraya koyuyor.

type MobileTab = 'ledger' | 'queue';

export function FinanceMobile({
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
  const [tab, setTab] = useState<MobileTab>('ledger');
  const hasAccounts = data.accounts.length > 0;

  if (!hasAccounts) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
        <PageHeader title="Para" compact />
        <AccountSetup onCreated={onSaved} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Para" compact>
        {/* Telefonda BİRİNCİL düğme elle giriş: sahada yapılan iş bu. Transfer masa işidir ve
            ikincil kalıyor — ikisi de birincil olsaydı ikisi de vurgusuz kalırdı. */}
        <Button size="sm" onClick={() => onOpenDialog('movement')}>
          + Hareket
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOpenDialog('transfer')} disabled={writableAccounts.length < 2}>
          ⇄
        </Button>
      </PageHeader>

      <AccountStrip accounts={data.accounts} totalCents={data.totalCents} stacked />
      <FilterBar accounts={data.accounts} urlState={urlState} unmatchedCount={data.unmatchedCount} onChange={onFilter} stacked />

      <div className="border-b border-ops-line-soft px-4 py-2">
        <MultiToggle
          value={tab}
          onChange={setTab}
          size="sm"
          label="Görünüm"
          options={[
            { key: 'ledger', label: 'Hareketler' },
            { key: 'queue', label: 'Eşleştirme' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'ledger' ? (
          <MovementList ledger={data.ledger} stacked />
        ) : (
          <>
            {queueError ? (
              <p className="border-b border-ops-red-line bg-ops-red-bg px-4 py-2.5 font-ops-body text-ops-xs text-ops-red">
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
          </>
        )}
      </div>

      {dialog === 'movement' ? (
        <MovementDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} />
      ) : null}
      {dialog === 'transfer' ? (
        <TransferDialog accounts={writableAccounts} onClose={onCloseDialog} onSaved={onSaved} />
      ) : null}
    </div>
  );
}
