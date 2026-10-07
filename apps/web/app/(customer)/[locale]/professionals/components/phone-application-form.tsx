'use client';

import {
  formatSiret,
  normalizeSiret,
  normalizeVatNumber,
  splitVatNumber,
  vatNumberProblem,
  type B2bApplicationKind,
} from '@lezzet/domain-core';
import { AddressFields } from '@/components/customer/delivery/address-fields';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { HapticTarget } from '@/components/customer/phone-kit/haptic-target';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import type { Messages, ProfessionalsCopy } from '../professionals-types';
import type { useApplicationForm } from '../use-application-form.hook';

interface PhoneApplicationFormProps {
  copy: ProfessionalsCopy;
  /** Adres önerilerinin sözcükleri web sözlüğünde. */
  t: Messages;
  form: ReturnType<typeof useApplicationForm>;
  /** Sonucun gideceği adres: girişlide hesabınki, misafirde `null` (kimlik adımında girilir), adressiz hesapta `undefined` (satır çizilmez). */
  accountEmail: string | null | undefined;
  /** SIRET'le arandıktan sonra (bulunsun bulunmasın) şirket alanları açılır, ki kayıt yoksa elle doldurulabilsin. */
  companyOpen: boolean;
  notice: string | null;
  onKindChange: (kind: B2bApplicationKind) => void;
  onLookup: () => void;
  onSubmit: () => void;
  /** Müşteri yazmaya başladı: eski uyarı düşer. */
  onEdit: () => void;
}

/** Native'in başvuru formu. E-posta sorulmaz, gösterilir, çünkü sonuç hesabın adresine gider; eksik alanlar uyarı cümlesinde adıyla sayılır. */
export function PhoneApplicationForm({ copy, t, form, accountEmail, companyOpen, notice, onKindChange, onLookup, onSubmit, onEdit }: PhoneApplicationFormProps) {
  const { input } = form;
  const set = (patch: Parameters<typeof form.set>[0]) => {
    form.set(patch);
    onEdit();
  };
  const isSiret = input.kind === 'siret';
  const vatProblem = input.vatNumber.trim() ? vatNumberProblem(input.vatNumber) : null;
  const vatError =
    vatProblem === 'use_siret' ? copy.form.vatUseSiret : vatProblem === 'unsupported_country' ? copy.form.vatUnsupported : undefined;
  const vatMark = form.checkingVat
    ? copy.form.vatChecking
    : form.vatValid === true
      ? copy.form.vatValid
      : form.vatValid === false
        ? copy.form.vatInvalid
        : form.vatValid === null
          ? copy.form.vatUnknown
          : null;

  // Numara motorun kabul ettiği biçime ulaştığı anda bir kez sorulur: yazarken sormak yavaş üye ülke sunucularını boşuna yorardı.
  const changeVat = (value: string) => {
    const next = normalizeVatNumber(value).slice(0, 14);
    set({ vatNumber: next });
    const parsed = vatNumberProblem(next) === null ? splitVatNumber(next) : null;
    if (parsed) form.checkVat(`${parsed.country}${parsed.number}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="radiogroup" aria-label={copy.title}>
        <KindTab label={copy.form.tabSiret} active={isSiret} onSelect={() => onKindChange('siret')} />
        <KindTab label={copy.form.tabVat} active={!isSiret} onSelect={() => onKindChange('eu_vat')} />
      </div>

      {isSiret ? (
        <div className="flex flex-col gap-2.5">
          <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.form.siretNote}</p>
          {/* Düğme alanın yanında, etiketin içinde değil: `<label htmlFor>` içindeki düğme tıklamayı girdiye yönlendirirdi. */}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FormInputField
                label={copy.form.siret}
                placeholder={copy.form.siret}
                variant="pill"
                value={formatSiret(input.siret)}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => set({ siret: normalizeSiret(event.target.value).slice(0, 14) })}
              />
            </div>
            <button
              type="button"
              onClick={onLookup}
              disabled={form.lookingUp}
              className="relative flex h-12.5 flex-none cursor-pointer items-center rounded-pill bg-ink px-5 font-sans text-control text-sand-50 transition-[scale,opacity] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {form.lookingUp ? copy.form.fetching : copy.form.fetch}
              <HapticTarget />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FormInputField
                label={copy.form.vatNumber}
                placeholder={copy.form.vatNumber}
                variant="pill"
                value={input.vatNumber}
                autoComplete="off"
                error={vatError}
                onChange={(event) => changeVat(event.target.value)}
              />
            </div>
            {/* Geçersiz numara uyarı tonunda; "doğrulanamadı" nötr kalır, çünkü servisin susması müşterinin kusuru değil. */}
            {vatMark !== null && vatError === undefined && (
              <span
                role="status"
                className={[
                  'flex h-12.5 flex-none items-center font-sans text-helper font-semibold',
                  form.vatValid === false ? 'text-terracotta-bright' : 'text-olive-dark',
                ].join(' ')}
              >
                {vatMark}
              </span>
            )}
          </div>
          <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.form.vatNote}</p>
        </div>
      )}

      {(companyOpen || !isSiret) && (
        <div className="flex flex-col gap-2.5">
          <h2 className="font-serif text-card-title-sm text-ink">{copy.form.companyTitle}</h2>
          <FormInputField
            label={copy.form.legalName}
            placeholder={copy.form.legalName}
            variant="pill"
            value={input.legalName}
            onChange={(event) => set({ legalName: event.target.value })}
          />
          {/* Sokak önerisi yalnız SIRET yolunda: BAN yalnız Fransız adreslerini bilir. */}
          <AddressFields
            value={{ line1: input.line1, postalCode: input.postalCode, city: input.city }}
            onChange={(patch) => set(patch)}
            copy={{
              ...t.form,
              line1: copy.form.line1,
              postalCode: copy.form.postalCode,
              city: copy.form.city,
              line1Placeholder: copy.form.line1,
              postalCodePlaceholder: copy.form.postalCode,
              cityPlaceholder: copy.form.city,
            }}
            streetSuggest={isSiret}
            compact
            variant="pill"
          />
          {/* Gönderilen adres müşterinin adres defterine de yazılır; söylenmezse bir sonraki siparişte tanımadığı bir satır görürdü. */}
          <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.form.addressNote}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <h2 className="font-serif text-card-title-sm text-ink">{copy.form.contactTitle}</h2>
        <FormInputField
          label={copy.form.contactName}
          placeholder={copy.form.contactName}
          variant="pill"
          value={input.contactName}
          autoComplete="name"
          onChange={(event) => set({ contactName: event.target.value })}
        />
        {/* Sonucun gideceği adres söylenir: söylenmezse müşteri gelen kutusunu tahmin etmek zorunda kalırdı. */}
        {accountEmail !== undefined && (
          <div className="flex flex-col gap-1">
            <p className="font-sans text-body-sm leading-[1.6] text-body">{accountEmail === null ? copy.form.resultToGuest : copy.form.resultTo}</p>
            {accountEmail !== null && <p className="font-sans text-note font-semibold text-ink">{accountEmail}</p>}
          </div>
        )}
        <FormInputField
          label={copy.form.phone}
          placeholder={copy.form.phone}
          variant="pill"
          value={input.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          onChange={(event) => set({ phone: event.target.value })}
        />
      </div>

      {notice !== null && (
        <p role="alert" className="font-sans text-note leading-[1.6] font-semibold text-terracotta-bright">
          {notice}
        </p>
      )}

      <PrimaryButton label={form.pending ? copy.form.submitting : copy.form.submit} shape="block" onClick={onSubmit} disabled={form.pending} />
    </div>
  );
}

/** Seçim birbirini dışladığı için `radio`. */
function KindTab({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={[
        'relative flex-1 cursor-pointer rounded-control border-[1.5px] border-ink px-2.5 py-3 text-center font-sans text-control transition-[scale,background-color] active:scale-[0.97]',
        active ? 'bg-olive text-card' : 'bg-transparent text-ink hover:bg-sand-150',
      ].join(' ')}
    >
      {label}
      <HapticTarget />
    </button>
  );
}
