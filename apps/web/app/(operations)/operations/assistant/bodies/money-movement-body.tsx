'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fromCents, toCents } from '@lezzet/helper';
import type { MoneyMovementPayload } from '@lezzet/types';
import { MovementFormBody } from '@/components/operation/form/movement-form/body';
import {
  MANUAL_TYPES,
  ManualMovementSchema,
  movementToday,
  type ManualMovementForm,
} from '@/components/operation/form/movement-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money } from '@/components/operation/ui/format';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * PARA HAREKETİ ÖNERİSİ — kuyruğun içinde, GERÇEK formuyla (22.18).
 *
 * ── `handoff` → `inline`: ŞART KALKMADI, FORMUN YERİ DEĞİŞTİ ────────────────
 * Tip devirle çalışıyordu ve gerekçesi doğruydu: *"etki geri alınamaz (defter yazılır), yani karar
 * ÖNCESİ düzenleme şart"*. O şart aynen duruyor — düzenleme hâlâ karardan önce; değişen tek şey
 * formun nerede DURDUĞU. Kullanıcının 10.08 cümlesi burada da geçerli: *"asistan sayfasından
 * çıkınca konseptten kopuyorum"*. Kaydeden kapı yine finans ekranının kendi eylemi
 * (`recordManualMovementAction` + `withProposal`); kuyruk ikinci bir yazma yolu açmıyor.
 *
 * ── TRANSFER BU GÖVDEDE DEĞİL, KENDİ GÖVDESİNDE ─────────────────────────────
 * `type: 'transfer'` iki hesap ister ve yön sormaz — başka bir form (`TransferBody`, 22.22). Bir
 * tur bu gövde onu "geçmez" diye reddediyordu ama çerçeve yine de boş bir taban formla açıyordu:
 * tutar boş, tür yanlış, künye dilekçeyi silinmiş gibi gösteriyordu. Çatal artık çerçevede ve iki
 * hâlin ikisi de kendi formuyla açılıyor.
 */

/** Asistanın önerdiği hareket → formun açılış değerleri. Transfer ise `null` — o `TransferBody`nin. */
export function movementValuesFrom(payload: MoneyMovementPayload): ManualMovementForm | null {
  if (!(MANUAL_TYPES as readonly string[]).includes(payload.type)) return null;
  return {
    accountId: payload.accountId,
    type: payload.type as ManualMovementForm['type'],
    // Payload CENT taşıyor, form EURO — çevrim burada (`ManualMovementSchema` künyesi).
    amount: fromCents(payload.amountCents),
    direction: payload.direction,
    category: payload.category ?? '',
    campaign: '',
    // Değer tarihi yoksa BUGÜN: uydurma bir tarih defterde yanlış güne yazardı.
    valueDate: payload.valueDate || movementToday(),
    description: payload.description ?? '',
  };
}

interface MoneyMovementBodyProps {
  payload: MoneyMovementPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: ManualMovementForm;
  onChange: (next: ManualMovementForm) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function MoneyMovementBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: MoneyMovementBodyProps) {
  // RHF örneği GÖVDEDE, gerçeğin sahibi ÇERÇEVE — öteki gövdelerdeki aynı köprü.
  const form = useForm<ManualMovementForm>({
    resolver: zodResolver(ManualMovementSchema),
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
        <MovementFormBody control={form.control} setValue={form.setValue} values={live} accounts={options.accounts} disabled={disabled || readOnly} />
      </div>

      <ProposalAside
        subject={subject}
        fallbackTitle="Defter satırı"
        facts={factsOf(payload, live, options.accounts)}
        payload={payload}
        meta={meta}
      />
    </div>
  );
}

/**
 * Dilekçenin öne çıkan sayıları. Hesap ADI da burada: kararın yarısı "hangi hesaptan" sorusudur ve
 * form onu kimlikle değil adla gösteriyor — künye ikisinin aynı hesap olduğunu doğrulatıyor.
 */
function factsOf(payload: MoneyMovementPayload, values: ManualMovementForm, accounts: AssistantFormOptions['accounts']): ProposalFact[] {
  // Hesabın ADI dilekçede yazılı ama formda seçili olan KİMLİK — karşılaştırma için ad gerekiyor.
  // Liste zaten kuyruk sayfasında okunmuştu (`AssistantFormOptions`), ikinci sorgu açılmıyor.
  const nowAccount = accounts.find((a) => a.id === values.accountId)?.name ?? '—';
  const directionText = (d: 'in' | 'out') => (d === 'in' ? 'Hesaba girdi' : 'Hesaptan çıktı');
  return [
    // **`money()` CENT ister** — dilekçe zaten cent taşıyor, form ise EURO (`ManualMovementSchema`
    // künyesi). Burada iki yanlış birden vardı: dilekçenin centi 100'e bölünüp euro geçiliyordu ve
    // formun eurosu cent sanılıyordu; ekranda 150,00 € yerine "1,50 €" yazıyordu (ölçüldü 12.08,
    // paket künyesindeki tuzağın aynısı). Çevrim SINIRDA yapılır, para birimi geçtiği yerde değil.
    { label: 'Tutar', value: money(payload.amountCents), now: money(toCents(values.amount ?? 0)) },
    { label: 'Hesap', value: payload.accountName, now: nowAccount },
    { label: 'Yön', value: directionText(payload.direction), now: directionText(values.direction) },
  ];
}
