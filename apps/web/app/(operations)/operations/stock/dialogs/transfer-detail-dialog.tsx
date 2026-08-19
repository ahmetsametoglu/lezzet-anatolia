'use client';

import { useEffect, useState, useTransition } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { num } from '@/components/operation/ui/format';
import { Input } from '@/components/operation/form/input';
import { receiveTransferAction } from '../transfer-actions';
import { historyOutcome, RECEIVE_NOTES } from '../transfer-labels';
import type { TransferDetailView } from '../transfer-types';

/**
 * İÇERİK PENCERESİ (19.6; iki yüz 19.08 kabul eleştirisinden) — "bu sevkiyatta ne var".
 *
 * `canReceive` ise KABUL FORMU: rampada sayım. Her satıra bir sayı girilmeden kabul TAMAMLANMAZ:
 * boş satır "sayılmadı"dır, "0" ise bir beyandır (kutu geldi ama boş / kayboldu) — ikisini ayıran
 * veri (0042), ekran da ayırır. Fark kalıcı kayıtta durur, sessizce eşitlenmez.
 *
 * Değilse SALT-OKUNUR: kapsam dışındaki personel yoldakinin içeriğini, herkes kapanmış kaydın
 * "sevk edilen → gelen" farkını satır satır buradan okur — eskiden bu bilginin TEK kapısı kabul
 * düğmesiydi ve geçmişe hiç kapı yoktu.
 */

const FORM_ID = 'receive-transfer-form';

interface TransferDetailDialogProps {
  detail: TransferDetailView | null;
  onClose: () => void;
  onDone: () => void;
}

export function TransferDetailDialog({ detail, onClose, onDone }: TransferDetailDialogProps) {
  const [gotOf, setGotOf] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Yeni kayıt = temiz sayım: önceki pencerenin yarım girişleri yeni sevkiyata taşınmaz.
  useEffect(() => {
    setGotOf({});
    setError(null);
  }, [detail?.transferId]);

  if (!detail) return null;

  const editable = detail.canReceive;
  const pending = editable ? detail.lines.filter((line) => (gotOf[line.lineId] ?? '') === '').length : 0;

  const submit = () => {
    if (pending > 0) return; // Düğme zaten kilitli; Enter'la gelen submit de aynı kurala tabi.
    startTransition(async () => {
      const { data, error: msg } = await receiveTransferAction({
        transferId: detail.transferId,
        lines: detail.lines.map((line) => ({ lineId: line.lineId, receivedQty: Number(gotOf[line.lineId]) || 0 })),
      });
      if (!data) {
        setError(msg ?? 'Kabul yazılamadı.');
        return;
      }
      onDone();
    });
  };

  const totals = {
    sentQty: detail.lines.reduce((sum, l) => sum + l.sentQty, 0),
    receivedQty: detail.outcome === 'cancelled' ? null : detail.lines.reduce((sum, l) => sum + (l.receivedQty ?? 0), 0),
  };
  const outcomeBadge = detail.outcome ? historyOutcome({ outcome: detail.outcome, ...totals }) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${editable ? 'Kabul' : 'İçerik'} · ${detail.referenceNo}`}
      subtitle={`${detail.fromCode} → ${detail.toCode} · sevk ${new Date(detail.dispatchedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}${detail.status === 'in_transit' ? ` · ${detail.ageDays === 0 ? 'bugün sevk edildi' : `${num(detail.ageDays)} gündür yolda`}` : ''}`}
      headerAside={outcomeBadge ? <Badge tone={outcomeBadge.tone}>{outcomeBadge.label}</Badge> : null}
      maxWidth={620}
      footer={
        editable ? (
          <DialogFooter
            formId={FORM_ID}
            onCancel={onClose}
            submitLabel="Kabul et"
            cancelLabel="Sonra"
            submitting={busy}
            blockedReason={pending > 0 ? RECEIVE_NOTES.pendingRows(pending) : null}
          />
        ) : (
          <div className="flex w-full justify-end">
            <Button variant="secondary" onClick={onClose}>
              Kapat
            </Button>
          </div>
        )
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(150px,1fr)_84px_80px_72px] gap-x-2.5 px-1">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-wide text-ops-muted">Kalem</span>
          <span className="text-center font-ops-display text-ops-micro font-semibold uppercase tracking-wide text-ops-muted">
            Sevk edilen
          </span>
          <span className="text-center font-ops-display text-ops-micro font-semibold uppercase tracking-wide text-ops-muted">Gelen</span>
          <span className="text-center font-ops-display text-ops-micro font-semibold uppercase tracking-wide text-ops-muted">Fark</span>
        </div>

        {detail.lines.map((line) => {
          const raw = gotOf[line.lineId] ?? '';
          // Formda "gelen" operatörün taslağı; salt-okunurda kayıttaki gerçek (geri alınmışta yok).
          const got = editable ? (raw === '' ? null : Number(raw)) : line.receivedQty;
          const diff = got === null ? null : got - line.sentQty;
          return (
            <div key={line.lineId} className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-bg px-3 py-2.5">
              <div className="grid grid-cols-[minmax(150px,1fr)_84px_80px_72px] items-center gap-x-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{line.name}</span>
                  <span className="font-ops-mono text-ops-micro text-ops-muted">
                    {line.lotNumber ?? 'lotsuz'}
                    {line.expiryDate
                      ? ` · ${new Date(`${line.expiryDate}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </span>
                </div>
                <span className="text-center font-ops-mono text-ops-sm text-ops-body">{num(line.sentQty)}</span>
                {editable ? (
                  <Input
                    inputSize="sm"
                    mono
                    fullWidth={false}
                    className="w-16 justify-self-center text-center"
                    inputMode="numeric"
                    placeholder="say"
                    value={raw}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '');
                      setGotOf((map) => ({ ...map, [line.lineId]: next }));
                    }}
                  />
                ) : (
                  <span className="text-center font-ops-mono text-ops-sm text-ops-body">
                    {got === null ? '—' : num(got)}
                  </span>
                )}
                <span
                  className={`text-center font-ops-mono text-ops-sm ${
                    diff === null ? 'text-ops-faint' : diff === 0 ? 'text-ops-muted' : 'text-ops-amber-dark'
                  }`}
                >
                  {diff === null ? '—' : diff === 0 ? '0' : diff > 0 ? `+${num(diff)}` : `−${num(Math.abs(diff))}`}
                </span>
              </div>
              {editable ? (
                <span className="font-ops-body text-ops-micro text-ops-muted">
                  {got === null ? RECEIVE_NOTES.waiting : got === line.sentQty ? RECEIVE_NOTES.full : RECEIVE_NOTES.partial(line.sentQty - got)}
                </span>
              ) : null}
            </div>
          );
        })}

        {editable ? (
          <div className="flex flex-col gap-1.5 rounded-ops-btn border border-ops-line bg-ops-bg px-3 py-2 font-ops-body text-ops-micro text-ops-muted">
            <p>
              {RECEIVE_NOTES.bornAsNewBatch} {RECEIVE_NOTES.zeroIsAStatement}
            </p>
            <p>{RECEIVE_NOTES.extraGoods}</p>
          </div>
        ) : (
          <p className="rounded-ops-btn border border-ops-line bg-ops-bg px-3 py-2 font-ops-body text-ops-micro text-ops-muted">
            {detail.status === 'in_transit'
              ? RECEIVE_NOTES.viewInTransit
              : detail.status === 'received'
                ? RECEIVE_NOTES.viewReceived
                : RECEIVE_NOTES.viewCancelled}
          </p>
        )}
      </form>
    </Dialog>
  );
}
