'use client';

import { toCents } from '@lezzet/helper';
import { Controller, type Control } from 'react-hook-form';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MONEY_FORM_GRID } from '@/components/operation/form/money-form-grid';
import { CONTROL_H } from '@/components/operation/ui/control';
import { money } from '@/components/operation/ui/format';
import type { TransferForm } from './schema';

/**
 * **TRANSFER FORMUNUN GÖVDESİ** — iki yüzeyin paylaştığı tek uygulama (22.22).
 *
 * Transfer penceresinin içindeydi; asistan kuyruğu aynı formu kendi içinde açacağı için ayrıldı.
 * Kopyalansaydı bir gün biri "aynı hesaba transfer olmaz" emniyetini ya da bakiye önizlemesini
 * yalnız bir yüzeyde düzeltirdi.
 *
 * ── GÖVDE AYRI, PENCERE ORTAK (12.24) ───────────────────────────────────────
 * Transfer başka SORU sorar: elle girişte tek hesap ve bir yön vardır, burada iki hesap ve yön yoktur;
 * şeması ve kaydeden kapısı da ayrıdır — gövde bu yüzden ayrı kalır. Ama Para'da artık ayrı bir pencere
 * YOK: "Yeni hareket" penceresinin dört kipinden biri. Bir tur ayrı pencerenin gerekçesi "tek pencerede
 * 'para ne yaptı' sorusu anlamsız kalır, hesap kutusu kip değişince ikiye bölünür"dü; sabit yuvalar
 * (`MONEY_FORM_GRID`) ikisini de karşılıyor — bu kipte yön hiç sorulmaz, o yuvada "Nereye" durur;
 * "Nereden" hesabın yuvasındadır.
 */
interface TransferFormBodyProps {
  control: Control<TransferForm>;
  /** Canlı değerler — bakiye önizlemesi ve seçili hesap adları için (çağıran `watch` ile verir). */
  values: TransferForm;
  /**
   * Hesap listesi. `balanceCents` İSTEĞE BAĞLI: finans ekranı bakiyeyi zaten okumuş durumda,
   * asistan kuyruğu ise hesapları yalnız ad/kimlik olarak taşıyor. Bakiye yoksa önizleme çizilmez —
   * uydurma bir bakiye göstermek, yanlış yönü doğrulatmaktan kötüdür.
   */
  accounts: Array<{ id: string; name: string; balanceCents?: number }>;
  disabled?: boolean;
}

export function TransferFormBody({ control, values, accounts, disabled = false }: TransferFormBodyProps) {
  const options = accounts.map((account) => ({ value: account.id, label: account.name }));
  const from = accounts.find((account) => account.id === values.fromAccountId);
  const to = accounts.find((account) => account.id === values.toAccountId);
  const cents = toCents(values.amount ?? 0);
  const showBalances = from?.balanceCents !== undefined && to?.balanceCents !== undefined;

  return (
    <div className={MONEY_FORM_GRID}>
      {/* Satır 1 — nereden · tutar: elle hareketin hesap · tutar yuvaları. */}
      <FormSelect control={control} name="fromAccountId" label="Nereden" required placeholder="Hesap seçin" options={options} disabled={disabled} />
      <FormMoney control={control} name="amount" label="Tutar" required placeholder="0,00" disabled={disabled} />

      {/* Satır 2 — nereye · bakiyeler. Transferin en sık hatası yanlış yönü seçmek ve o hata bakiyeleri İKİ
          KAT kaydırır (biri fazla, öteki eksik); sonuç bu yüzden kaydetmeden ÖNCE yazılıyor: tutar yazılınca
          "şimdi → sonra", yazılmadan önce iki hesabın şimdiki bakiyesi (yuva boş durmasın — 12.24 turu).
          Bakiyeler gerçek, şeritteki sayının aynısı; bilinmiyorsa (asistan kuyruğu) yuva boş kalır, yerleşim kaymaz. */}
      <FormSelect control={control} name="toAccountId" label="Nereye" required placeholder="Hesap seçin" options={options} disabled={disabled} />
      {showBalances && from && to ? (
        <FieldShell label="Bakiyeler">
          {/* Kutu form alanıyla AYNI boyda (`CONTROL_H.md`): yuva satırını uzatırsa alttaki satırlar öteki kiplere
              göre kayar (12.24 turu ölçtü: iki satırlık 13px yazı satırı 9px uzatıyordu). */}
          <div
            className={`flex ${CONTROL_H.md} flex-col justify-center overflow-hidden rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3 font-ops-body text-ops-micro leading-tight text-ops-muted`}
          >
            <BalanceLine name={from.name} nowCents={from.balanceCents ?? 0} deltaCents={-cents} />
            <BalanceLine name={to.name} nowCents={to.balanceCents ?? 0} deltaCents={cents} />
          </div>
        </FieldShell>
      ) : (
        <span aria-hidden />
      )}

      {/* Satır 3 — gün · açıklama. */}
      <Controller
        control={control}
        name="valueDate"
        render={({ field }) => (
          <DateField label="Değer tarihi" labelAside="paranın hareket ettiği gün" value={field.value} onChange={field.onChange} disabled={disabled} />
        )}
      />
      <FormInput control={control} name="description" label="Açıklama" placeholder="Kasa teslimi — banka yatırma" disabled={disabled} />
    </div>
  );
}

interface BalanceLineProps {
  name: string;
  nowCents: number;
  /** Transferin bu hesaba etkisi — sıfırsa (tutar yazılmadı) yalnız şimdiki bakiye yazılır. */
  deltaCents: number;
}

/** "Kasa 113,26 € → 236,71 €" — tutar yazılmadıysa "Kasa 113,26 €". */
function BalanceLine({ name, nowCents, deltaCents }: BalanceLineProps) {
  return (
    <span className="truncate">
      <span className="text-ops-ink">{name}</span> {money(nowCents)}
      {deltaCents === 0 ? null : (
        <>
          {' → '}
          <span className="text-ops-ink">{money(nowCents + deltaCents)}</span>
        </>
      )}
    </span>
  );
}
