'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { StepButton } from '@/components/operation/ui/step-button';
import { money, num } from '@/components/operation/ui/format';
import { toCents } from '@lezzet/helper';
import { DOOR_METHODS, NOTES } from '../deliveries-labels';
import type { DeliveryLineView, DeliveryStopView, DoorMethod } from './delivery-types';

// Kapıdaki durağın blokları. Sıra tasarımın kendi önceliği (§2): önce MAL (ne veriyorum), sonra
// PARA (ne alıyorum), sonra KANIT. Para yukarıda olsaydı eksik kalem işaretlenmeden tutar okunurdu.

/**
 * **Kalem listesi + eksik/reddedilen işaretleme.**
 *
 * Sayaç YALNIZ DÜŞER: karşılananı artırmak "mal nereden çıktı" sorusunu cevapsız bırakır ve
 * `adjust_fulfillment` zaten reddeder. Tavan bugünkü karşılanan adettir, sipariş edilen değil.
 *
 * Satırda tutar YOK ve bu bilinçli: kurye hesap yapmaz (tasarım §6). Toplam tek yerde, para
 * bloğunda, motorun türetimiyle yazar — satır başına bir rakam koymak, kuryeyi kafadan toplama
 * yapmaya davet ederdi.
 */
export function LineAdjuster({
  lines,
  given,
  onGiven,
  disabled,
}: {
  lines: DeliveryLineView[];
  given: Record<string, number>;
  onGiven: (lineId: string, qty: number) => void;
  disabled: boolean;
}) {
  return (
    <section className="border-b border-ops-line-soft px-4 py-3">
      <h2 className="mb-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        Kalemler
      </h2>
      <ul className="flex flex-col gap-1.5">
        {lines.map((line) => {
          const qty = given[line.id] ?? line.fulfilledQty;
          const missing = line.fulfilledQty - qty;
          return (
            <li key={line.id} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-ops-body text-ops-base text-ops-ink">{line.title}</span>
                {missing > 0 ? (
                  <span className="font-ops-body text-ops-xs text-ops-amber-dark">
                    {num(missing)} adet eksik/reddedildi
                  </span>
                ) : null}
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <StepButton
                  label="−"
                  ariaLabel={`${line.title} adet azalt`}
                  onClick={() => onGiven(line.id, Math.max(0, qty - 1))}
                  disabled={disabled || qty <= 0}
                />
                <span className="w-8 text-center font-ops-mono text-ops-base text-ops-ink">{num(qty)}</span>
                <StepButton
                  label="+"
                  ariaLabel={`${line.title} adet artır`}
                  onClick={() => onGiven(line.id, Math.min(line.fulfilledQty, qty + 1))}
                  disabled={disabled || qty >= line.fulfilledQty}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * **Tahsilat** (11.3).
 *
 * Tutar burada HESAPLANMAZ, motordan gelir (`derivePaymentStatusForOrder`) — kutu yalnız o tutarla
 * açılır. Kurye değiştirebilir çünkü kapıda müşteri elindekini verir; yazılan tutar da o olmalıdır,
 * sistemin beklediği değil.
 *
 * Nakit uyarısı ENGEL DEĞİL (DOMAIN §7): eşiği aşan tahsilat tamamlanır, karar sahadadır.
 */
export function CollectionPanel({
  view,
  dueCents,
  method,
  onMethod,
  amountEuros,
  onAmount,
  disabled,
}: {
  view: DeliveryStopView;
  dueCents: number;
  method: DoorMethod;
  onMethod: (method: DoorMethod) => void;
  amountEuros: number;
  onAmount: (euros: number | null) => void;
  disabled: boolean;
}) {
  // Borcu olmayan kapıda para HİÇ konuşulmaz — rakam basmak kuryeyi olmayan bir tahsilata hazırlar.
  if (dueCents <= 0) {
    return (
      <section className="border-b border-ops-line-soft px-4 py-3">
        <p className="font-ops-body text-ops-sm text-ops-faint">{NOTES.prepaid}</p>
      </section>
    );
  }

  const amountCents = toCents(amountEuros);
  const overLimit = method === 'cash' && amountCents > view.cashLimitCents;

  return (
    <section className="flex flex-col gap-2.5 border-b border-ops-line-soft px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Tahsilat
        </h2>
        <span className="font-ops-mono text-ops-title tracking-tight text-ops-ink">{money(dueCents)}</span>
      </div>

      {view.doorAccountId === null ? (
        // Hesapsız tahsilat YAZILAMAZ. Kutuyu açık bırakıp sessizce yutmak en kötüsü olurdu: kurye
        // parayı alır, kayıt hiç doğmaz, gün kapanışında fark olarak patlar.
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-xs text-ops-amber-dark">
          {NOTES.noDoorAccount}
        </p>
      ) : (
        <>
          <MultiToggle
            label="Ödeme yöntemi"
            value={method}
            options={DOOR_METHODS}
            onChange={onMethod}
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <span className="font-ops-body text-ops-sm text-ops-muted">Alınan</span>
            <MoneyInput
              inputSize="md"
              ariaLabel="Tahsil edilen tutar"
              value={amountEuros}
              onChange={(value) => onAmount(value)}
              disabled={disabled}
              className="w-[120px]"
              fullWidth={false}
            />
            {amountCents !== dueCents ? (
              <button
                type="button"
                onClick={() => onAmount(null)}
                className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive underline-offset-2 hover:underline"
              >
                tutara dön
              </button>
            ) : null}
          </div>

          {overLimit ? (
            <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-xs text-ops-amber-dark">
              {NOTES.cashLimit(view.cashLimitCents)}
            </p>
          ) : null}
          {amountCents < dueCents ? (
            <p className="font-ops-body text-ops-xs text-ops-faint">{NOTES.partialCollection(dueCents - amountCents)}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * **Ulaşılamadı / reddedildi penceresi** (11.4). Tek pencere, iki sonuç — soru aynı ("ne oldu?"),
 * akıbet farklı; ayrımı başlık ve onay düğmesinin tonu taşır.
 */
export function OutcomeDialog({
  outcome,
  onClose,
  onConfirm,
  busy,
}: {
  outcome: 'unreachable' | 'refused';
  onClose: () => void;
  onConfirm: (note: string | null) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  const refused = outcome === 'refused';

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={440}
      title={refused ? 'Müşteri kabul etmedi' : 'Kapıda ulaşılamadı'}
      subtitle={refused ? NOTES.refusedEffect : NOTES.unreachableEffect}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant={refused ? 'destructive' : 'warning'}
            onClick={() => onConfirm(note.trim() || null)}
            disabled={busy}
          >
            {refused ? 'Reddedildi olarak işaretle' : 'Ulaşılamadı olarak işaretle'}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 px-5 py-4">
        <span className="font-ops-body text-ops-sm text-ops-muted">Kısa not (isteğe bağlı)</span>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={refused ? 'ör. paket hasarlı geldi' : 'ör. zil bozuk'}
          maxLength={200}
        />
      </label>
    </Dialog>
  );
}
