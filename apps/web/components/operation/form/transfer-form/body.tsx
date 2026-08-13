'use client';

import { toCents } from '@lezzet/helper';
import { Controller, type Control } from 'react-hook-form';
import { DateField } from '@/components/operation/form/date-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { money } from '@/components/operation/ui/format';
import type { TransferForm } from './schema';

/**
 * **TRANSFER FORMUNUN GÖVDESİ** — iki yüzeyin paylaştığı tek uygulama (22.22).
 *
 * `transfer-dialog`ın içindeydi; asistan kuyruğu aynı formu kendi içinde açacağı için ayrıldı.
 * Kopyalansaydı bir gün biri "aynı hesaba transfer olmaz" emniyetini ya da bakiye önizlemesini
 * yalnız bir yüzeyde düzeltirdi.
 *
 * ── NEDEN ELLE HAREKETTEN AYRI BİR FORM ─────────────────────────────────────
 * Transfer başka SORU sorar: elle girişte tek hesap ve bir yön vardır, burada iki hesap ve yön
 * yoktur. Tek forma sıkıştırılsaydı "para ne yaptı" sorusu transferde anlamsız kalır, hesap kutusu
 * da kip değişince ikiye bölünürdü (`transfer-dialog` künyesi, korunuyor).
 */
interface TransferFormBodyProps {
  control: Control<TransferForm>;
  /** Canlı değerler — bakiye önizlemesi ve seçili hesap adları için (çağıran `watch` ile verir). */
  values: TransferForm;
  /**
   * Hesap listesi. `balanceCents` İSTEĞE BAĞLI: finans ekranı bakiyeyi zaten okumuş durumda,
   * asistan kuyruğu ise hesapları yalnız ad/kimlik olarak taşıyor. Bakiye yoksa önizleme cümlesi
   * çizilmez — uydurma bir bakiye göstermek, yanlış yönü doğrulatmaktan kötüdür.
   */
  accounts: Array<{ id: string; name: string; balanceCents?: number }>;
  disabled?: boolean;
}

export function TransferFormBody({ control, values, accounts, disabled = false }: TransferFormBodyProps) {
  const options = accounts.map((account) => ({ value: account.id, label: account.name }));
  const from = accounts.find((account) => account.id === values.fromAccountId);
  const to = accounts.find((account) => account.id === values.toAccountId);
  const showBalances = from?.balanceCents !== undefined && to?.balanceCents !== undefined && Boolean(values.amount);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <FormSelect control={control} name="fromAccountId" label="Nereden" required placeholder="Hesap" options={options} disabled={disabled} />
        <span aria-hidden className="pb-2.5 font-ops-mono text-ops-base text-ops-faint">
          →
        </span>
        <FormSelect control={control} name="toAccountId" label="Nereye" required placeholder="Hesap" options={options} disabled={disabled} />
      </div>

      {/* Transferin en sık hatası yanlış yönü seçmek ve o hata bakiyeleri İKİ KAT kaydırır (biri
          fazla, öteki eksik). Sonuç bu yüzden kaydetmeden ÖNCE yazılıyor: operatör okuduğu cümlenin
          niyetiyle aynı olup olmadığını görüyor. Bakiyeler gerçek — şeritteki sayının aynısı. */}
      {showBalances && from && to ? (
        <p className="rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3.5 py-2.5 font-ops-body text-ops-sm text-ops-muted">
          <span className="text-ops-ink">{from.name}</span> {money(from.balanceCents ?? 0)} →{' '}
          <span className="text-ops-ink">{money((from.balanceCents ?? 0) - toCents(values.amount ?? 0))}</span> ·{' '}
          <span className="text-ops-ink">{to.name}</span> {money(to.balanceCents ?? 0)} →{' '}
          <span className="text-ops-ink">{money((to.balanceCents ?? 0) + toCents(values.amount ?? 0))}</span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <FormMoney control={control} name="amount" label="Tutar" required placeholder="0,00" disabled={disabled} />
        <Controller
          control={control}
          name="valueDate"
          render={({ field }) => <DateField label="Değer tarihi" value={field.value} onChange={field.onChange} disabled={disabled} />}
        />
      </div>

      <FormInput control={control} name="description" label="Açıklama" placeholder="Kasa teslimi — banka yatırma" disabled={disabled} />
    </div>
  );
}
