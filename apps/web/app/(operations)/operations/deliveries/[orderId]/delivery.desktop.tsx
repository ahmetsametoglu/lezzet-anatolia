'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { num } from '@/components/operation/ui/format';
import { StopContactActions } from '../deliveries-sections';
import { NOTES, OUTCOME_VIEW } from '../deliveries-labels';
import { CollectionPanel, LineAdjuster, OutcomeDialog, ProofNotice } from './delivery-sections';
import type { DeliveryViewProps } from './delivery-types';

// Kapıdaki durak — MASAÜSTÜ. Gün listesiyle aynı dar sütunda (560 px) ve aynı gerekçeyle: bu ekranın
// bilgisi telefonda, tek elle, ayaküstü dizilmek üzere kuruldu; masaüstü hâli sevkiyatçının omuz
// üstünden bakması ve geliştirme içindir (`docs/uygulama` yüzey formülü).

export function DeliveryStopDesktop(props: DeliveryViewProps) {
  const { view, busy, error, onTheWay, onStart, onConfirm, onUndelivered } = props;
  const [asking, setAsking] = useState<'unreachable' | 'refused' | null>(null);

  const settled = view.stop.outcome !== 'pending' && view.stop.outcome !== 'unreachable';
  const outcome = OUTCOME_VIEW[view.stop.outcome];
  // Kanıt zorunluysa teslim KAPANMAZ (bkz. `ProofNotice`). Kapalı ama sebebi yazılı bir düğme,
  // basılınca sessizce başarısız olan bir düğmeden iyidir.
  const canConfirm = onTheWay && !view.proofRequired && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title={`${num(view.index + 1)}. durak · ${view.stop.customerName}`}
        subtitle={`${view.stop.address ?? 'Adres yok'}${view.referenceNo ? ` · ${view.referenceNo}` : ''}`}
        status={<Badge tone={outcome.tone}>{outcome.label}</Badge>}
      >
        <Link
          href="/operations/deliveries"
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-sm font-semibold text-ops-strong transition-colors hover:border-ops-olive"
        >
          ← Güne dön
        </Link>
      </PageHeader>

      <div className="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col overflow-y-auto">
        <div className="border-b border-ops-line-soft px-4 py-3">
          <StopContactActions stop={view.stop} />
        </div>

        {/* Yola çıkış: kapıdaki her sonucun ön koşulu. Sebebi düğmenin altında yazıyor — kapalı bir
            "Teslim ettim"in neden kapalı olduğunu kurye tahmin etmek zorunda kalmasın. */}
        {!onTheWay && !settled ? (
          <div className="flex flex-col gap-2 border-b border-ops-line-soft bg-ops-surface-sunken px-4 py-3">
            <Button variant="dark" fullWidth onClick={onStart} disabled={busy}>
              Yola çıktım
            </Button>
            <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{NOTES.notOnTheWay}</p>
          </div>
        ) : null}

        <LineAdjuster lines={view.lines} given={props.given} onGiven={props.onGiven} disabled={busy || settled} />

        <CollectionPanel
          view={view}
          dueCents={props.dueCents}
          method={props.method}
          onMethod={props.onMethod}
          amountEuros={props.amountEuros}
          onAmount={props.onAmount}
          disabled={busy || settled}
        />

        {view.proofRequired ? <ProofNotice /> : null}

        {error ? (
          <p className="mx-4 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        {/* Sonuçlanmış durak salt-okunur: aynı kapıyı ikinci kez açmak, aynı malı iki kez oynatmaya
            çalışmaktır. Ulaşılamayan durak İSTİSNA — gün içinde geri dönülür. */}
        {settled ? (
          <p className="px-4 py-4 font-ops-body text-ops-sm text-ops-faint">
            Bu durak sonuçlandı ({outcome.label.toLocaleLowerCase('tr-TR')}). Değişiklik operasyonun sipariş
            ekranından yapılır.
          </p>
        ) : (
          <div className="mt-auto flex flex-col gap-2 border-t border-ops-line px-4 py-3">
            <Button variant="primary" fullWidth onClick={onConfirm} disabled={!canConfirm}>
              Teslim ettim
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setAsking('unreachable')}
                disabled={!onTheWay || busy}
              >
                Ulaşılamadı
              </Button>
              <Button variant="danger" fullWidth onClick={() => setAsking('refused')} disabled={!onTheWay || busy}>
                Reddedildi
              </Button>
            </div>
          </div>
        )}
      </div>

      {asking ? (
        <OutcomeDialog
          outcome={asking}
          busy={busy}
          onClose={() => setAsking(null)}
          onConfirm={(note) => {
            setAsking(null);
            onUndelivered(asking, note);
          }}
        />
      ) : null}
    </div>
  );
}
