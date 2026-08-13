'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fromCents, toCents } from '@lezzet/helper';
import type { MoneyMovementPayload } from '@lezzet/types';
import { TransferFormBody } from '@/components/operation/form/transfer-form/body';
import { TransferFormSchema, transferToday, type TransferForm } from '@/components/operation/form/transfer-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money } from '@/components/operation/ui/format';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * TRANSFER ÖNERİSİ — kuyruğun içinde, GERÇEK formuyla (22.22).
 *
 * ── NEDEN AYRI BİR GÖVDE ────────────────────────────────────────────────────
 * `money_movement` tipinin iki hâli var ve ikisi farklı SORU soruyor: elle girişte tek hesap + bir
 * yön, transferde iki hesap ve yön yok. Tek forma sıkıştırmak "para ne yaptı" sorusunu transferde
 * anlamsız bırakırdı (`transfer-dialog` künyesinin kararı, korunuyor).
 *
 * ── NEDEN ARTIK KUYRUKTA ────────────────────────────────────────────────────
 * Transfer bir tur DIŞARIDA bırakılmıştı: gövde formu açmıyor, karar devre çıkıyordu. Ama ekranda
 * olan bu değildi — kuyruk boş bir taban formla açılıyordu: tutar boş, tür "Sınıflandırılmadı", ve
 * künye 500,00 € → 0,00 € diye **operatör silmiş gibi** gösteriyordu (kullanıcı tespiti 12.08).
 * Yarım bir devir, devir değildir: form açılıyorsa dilekçeyi taşımalı.
 *
 * Kaydeden kapı yine finans ekranının kendi eylemi (`recordTransferAction` + `withProposal`).
 */

/** Asistanın önerdiği transfer → formun açılış değerleri. */
export function transferValuesFrom(payload: MoneyMovementPayload): TransferForm {
  return {
    // **YÖN DİLEKÇEDEN OKUNUR, VARSAYILMAZ.** Dilekçe `accountId` + `direction` taşıyor: `out` ise
    // para bu hesaptan çıkıyor (kaynak odur), `in` ise buraya giriyor (hedef odur). Karşı hesap
    // ötekidir. Sabit bir sıra yazsaydık asistanın "kasaya nakit çek" önerisi ekranda "kasadan
    // bankaya" diye açılırdı — ve o hata bakiyeleri İKİ KAT kaydırır.
    fromAccountId: payload.direction === 'out' ? payload.accountId : (payload.counterAccountId ?? ''),
    toAccountId: payload.direction === 'out' ? (payload.counterAccountId ?? '') : payload.accountId,
    // Payload CENT taşıyor, form EURO (`ManualMovementSchema` künyesi).
    amount: fromCents(payload.amountCents),
    // Değer tarihi yoksa BUGÜN: uydurma bir tarih defterde yanlış güne yazardı.
    valueDate: payload.valueDate || transferToday(),
    description: payload.description ?? '',
  };
}

interface TransferBodyProps {
  payload: MoneyMovementPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: TransferForm;
  onChange: (next: TransferForm) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function TransferBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: TransferBodyProps) {
  // RHF örneği GÖVDEDE, gerçeğin sahibi ÇERÇEVE — öteki gövdelerdeki aynı köprü.
  const form = useForm<TransferForm>({
    resolver: zodResolver(TransferFormSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });
  const live = form.watch();
  useEffect(() => {
    onChange(live);
  }, [JSON.stringify(live)]);

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[24rem] flex-[2] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <TransferFormBody control={form.control} values={live} accounts={options.accounts} disabled={disabled || readOnly} />
      </div>

      <ProposalAside subject={subject} fallbackTitle="Hesaplar arası transfer" facts={factsOf(payload, live, options.accounts)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: MoneyMovementPayload, values: TransferForm, accounts: AssistantFormOptions['accounts']): ProposalFact[] {
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';
  const proposed = transferValuesFrom(payload);
  return [
    // `money()` CENT ister; dilekçe zaten cent taşıyor, form euro (aynı tuzak 12.08'de ölçüldü).
    { label: 'Tutar', value: money(payload.amountCents), now: money(toCents(values.amount ?? 0)) },
    { label: 'Nereden', value: nameOf(proposed.fromAccountId), now: nameOf(values.fromAccountId) },
    { label: 'Nereye', value: nameOf(proposed.toAccountId), now: nameOf(values.toAccountId) },
  ];
}
