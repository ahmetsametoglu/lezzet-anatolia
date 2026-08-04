'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ADVERTISING_CATEGORY } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { DateField } from '@/components/operation/form/date-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { recordManualMovementAction } from './actions';
import { MANUAL_TYPE_VIEW, NOTES, QUICK_CATEGORIES } from './finance-labels';
import { ManualMovementSchema, MANUAL_TYPES, type AccountView, type ManualMovementForm } from './finance-types';

// **Elle hareket** (tasarım §3, "+ Hareket") — gider, sermaye ya da sınıflandırılmamış.
//
// Form standardı (`catalog-form-dialog` kanonik): RHF + `zodResolver` + `Form*` adaptörleri +
// `DialogFooter(formId)`. Tutar `FormMoney` ile ve CENT taşıyor (STACK §8).

const FORM_ID = 'manual-movement-form';

/** Bugünün günü — `valueDate` varsayılanı. Para çoğu zaman girildiği gün hareket etmiştir. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Kaydetmenin ENGELİ, tek cümlede (`DialogFooter.blockedReason`).
 *
 * Alan alan kırmızı yazı yerine bu: eksik alan zaten kutuya bakınca görülüyor, ama "neden düğme
 * kapalı" sorusunun cevabı hiçbir yerde yazmıyordu.
 */
function blockedReasonOf(values: ManualMovementForm): string | null {
  if (!values.accountId) return 'Önce hesabı seçin.';
  if (!values.amountCents || values.amountCents <= 0) return 'Tutar sıfırdan büyük olmalı.';
  if (values.type === 'expense' && !values.category.trim()) return 'Giderin kategorisi yazılmalı (kira, akaryakıt…).';
  return null;
}

interface MovementDialogProps {
  accounts: AccountView[];
  onClose: () => void;
  onSaved: () => void;
}

export function MovementDialog({ accounts, onClose, onSaved }: MovementDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ManualMovementForm>({
    resolver: zodResolver(ManualMovementSchema),
    defaultValues: {
      accountId: accounts[0]?.id ?? '',
      type: 'expense',
      amountCents: null,
      direction: 'out',
      category: '',
      campaign: '',
      valueDate: today(),
      description: '',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as ManualMovementForm;
  const isAdvertising = watched.type === 'expense' && watched.category === ADVERTISING_CATEGORY;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error: actionError } = await recordManualMovementAction({
      accountId: values.accountId,
      type: values.type,
      amountCents: values.amountCents ?? 0,
      direction: values.direction,
      category: values.category,
      campaign: values.campaign,
      valueDate: values.valueDate,
      description: values.description,
    });
    if (actionError) {
      setError(actionError);
      return;
    }
    onSaved();
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni hareket"
      subtitle="Gider, sermaye ya da henüz sınıflandırılmamış para"
      maxWidth={560}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel="Hareketi kaydet"
          blockedReason={blockedReasonOf(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Ekranın "burada olmayan"ı düğmeyi gizleyip susmak yerine cümleyle söyleniyor: sipariş
            tahsilatını neden giremediğini bilmeyen operatör onu `misc` olarak girer ve sipariş ile
            para kaydı sessizce ayrışır. */}
        <p className="rounded-ops-card bg-ops-surface-sunken px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-muted">
          {NOTES.manualEntryScope}
        </p>

        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
                Ne kaydediliyor
              </span>
              <MultiToggle
                value={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  // Yön tipin sonucudur, ayrı bir soru değil: gider çıkış, sermaye giriştir
                  // (motorun kuralı). Yalnız `misc` serbest kalır — banka "para girdi/çıktı" der,
                  // sebebini söylemez ve elle girilen karşılığı da öyledir.
                  if (next === 'expense') form.setValue('direction', 'out');
                  if (next === 'capital') form.setValue('direction', 'in');
                }}
                options={MANUAL_TYPES.map((type) => ({ key: type, label: MANUAL_TYPE_VIEW[type].label }))}
                label="Hareket türü"
              />
              <span className="font-ops-body text-ops-xs text-ops-faint">{MANUAL_TYPE_VIEW[field.value].hint}</span>
            </div>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormSelect
            control={form.control}
            name="accountId"
            label="Hangi hesap"
            required
            placeholder="Hesap seçin"
            options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          />
          <FormMoney control={form.control} name="amountCents" label="Tutar" required placeholder="0,00" />
        </div>

        {/* `misc` yönü SORAR, ötekiler sormaz — sorulmayan bir soruya kutu koymak, cevabı belli bir
            şeyi kullanıcıya tekrar ettirmektir. */}
        {watched.type === 'misc' ? (
          <Controller
            control={form.control}
            name="direction"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
                  Para ne yaptı
                </span>
                <MultiToggle
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { key: 'in', label: 'Hesaba girdi' },
                    { key: 'out', label: 'Hesaptan çıktı' },
                  ]}
                  label="Paranın yönü"
                />
              </div>
            )}
          />
        ) : null}

        {watched.type === 'expense' ? (
          <div className="flex flex-col gap-2">
            <FormInput
              control={form.control}
              name="category"
              label="Gider kategorisi"
              required
              labelAside="serbest metin"
              placeholder="kira, akaryakıt, maaş…"
            />
            {/* Hızlı seçim: kategori serbest metindir (şemanın kararı — kalemler işletmeyle büyür),
                ama en sık yazılan beşini elle yazdırmak hem yavaş hem de yazım farkı üretiyor
                ("Kira" ile "kira" iki ayrı kategori olurdu). Reklam çipi ayrıca ÖNEMLİ: raporun
                süzdüğü değer `advertising` sabitidir ve operatörün onu İngilizce yazması beklenemez. */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CATEGORIES.map((quick) => (
                <button
                  key={quick.value}
                  type="button"
                  onClick={() => form.setValue('category', quick.value, { shouldValidate: true })}
                  className={`cursor-pointer rounded-ops-chip border px-2.5 py-1 font-ops-body text-ops-xs transition-colors ${
                    watched.category === quick.value
                      ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark'
                      : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
                  }`}
                >
                  {quick.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Kampanya etiketi YALNIZ reklam giderinde — analitiğin ROAS köprüsü budur (12.5).
            Zorunlu DEĞİL ve bu kapının kendi kararı: kampanyası bilinmeyen bir ajans faturası da
            girilebilmeli, yoksa operatör onu `misc` yazar ve gider reklam toplamından tamamen düşer. */}
        {isAdvertising ? (
          <FormInput
            control={form.control}
            name="campaign"
            label="Kampanya etiketi"
            labelAside="boş bırakılabilir"
            placeholder="bayram-ig"
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
            name="valueDate"
            render={({ field }) => (
              <DateField
                label="Değer tarihi"
                labelAside="paranın hareket ettiği gün"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FormInput control={form.control} name="description" label="Açıklama" placeholder="Total Access — akaryakıt" />
        </div>
      </form>
    </Dialog>
  );
}
