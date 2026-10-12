'use client';

import { useState, type ReactNode } from 'react';
import { normalizeSiret } from '@lezzet/domain-core';
import type { CustomerType, StaffAddressOption, StaffCustomerOption } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { createAddressAction, createCustomerAction } from './actions';
import { useCompanyPreview, type CompanyPreviewState } from './use-company-preview.hook';

/**
 * Elle sipariş girişinin iki kayıt penceresi: müşteri bul-veya-oluştur'un "oluştur" tarafı ve adresi. İkisi de kabuktur; doğrulama
 * ve yazım action'dadır, `blockedReason` yalnız düğmeyi erken kapatır ve güvence sayılmaz.
 */

const CUSTOMER_TYPES = [
  { value: 'individual', label: 'Bireysel (B2C)' },
  { value: 'company', label: 'Şirket (B2B)' },
];

/** Etiketli tek satırlık metin alanı — iki pencerede de aynı iskelet. */
function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <FieldShell label={label} required={required} labelAside={hint}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </FieldShell>
  );
}

const CUSTOMER_FORM_ID = 'new-order-customer-form';
const ADDRESS_FORM_ID = 'new-order-address-form';

/** Düğmeyi SIRET yüzünden kapatan sebep; boş SIRET serbesttir, kayıt künyesiz açılır. */
function siretBlockedReason(raw: string, company: CompanyPreviewState): string | null {
  const digits = normalizeSiret(raw);
  if (digits.length === 0) return null;
  if (digits.length !== 14) return 'SIRET 14 hane olmalı';
  if (company.kind === 'loading') return 'Resmî kayıt okunuyor';
  if (company.kind !== 'ready') return null;
  if (company.preview.existing.length > 0) return "Bu SIRET'le kayıt var";
  return company.preview.registry === 'not_found' ? 'SIRET resmî kayıtta yok' : null;
}

interface CustomerDialogProps {
  onClose: () => void;
  /** Yeni açılan ya da aynı SIRET'le bulunan kayıt; ikisinde de sipariş o müşteriyle sürer. */
  onPicked: (customer: StaffCustomerOption) => void;
}

export function CustomerDialog({ onClose, onPicked }: CustomerDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<CustomerType>('individual');
  const [siret, setSiret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isCompany = type === 'company';
  const company = useCompanyPreview(isCompany ? siret : '');

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { data, error: actionError } = await createCustomerAction({
      name,
      phone,
      email: email.trim() || null,
      type,
      siret: isCompany ? siret.trim() || null : null,
    });
    setSubmitting(false);
    if (actionError || !data) {
      setError(actionError ?? 'Müşteri açılamadı.');
      return;
    }
    onPicked(data);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni müşteri"
      subtitle="Telefonla gelen müşterinin hesabı olmak zorunda değil"
      maxWidth={480}
      footer={
        <DialogFooter
          formId={CUSTOMER_FORM_ID}
          onCancel={onClose}
          submitting={submitting}
          error={error}
          submitLabel="Müşteriyi aç"
          blockedReason={
            !name.trim() ? 'Ad girilmeli' : !phone.trim() ? 'Telefon girilmeli' : isCompany ? siretBlockedReason(siret, company) : null
          }
        />
      }
    >
      <form
        id={CUSTOMER_FORM_ID}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="Ad" value={name} onChange={setName} required />
        {/* Telefon zorunlu: kurye kapıda arayacak. Benzersizlik ARANMAZ — aile numarası meşrudur
            (`user_profiles.phone` künyesi); operatör zaten önce arayıp bulamadığı için buradadır. */}
        <TextField label="Telefon" value={phone} onChange={setPhone} placeholder="+33 6 12 34 56 78" required />
        <TextField label="E-posta" value={email} onChange={setEmail} />
        {/* Tip kanalı belirler ve fiyat ondan çözülür. Şirket seçmek B2B fiyat AÇMAZ: toptan liste
            onay ister (DOMAIN §10) ve onaysız şirket B2C fiyat görür — kural sunucuda. */}
        <FieldShell label="Tip">
          <Select value={type} onChange={(v) => setType(v as CustomerType)} options={CUSTOMER_TYPES} />
        </FieldShell>
        {isCompany ? (
          <div className="flex flex-col gap-1.5">
            <TextField label="SIRET" value={siret} onChange={setSiret} placeholder="907 496 640 00026" />
            <CompanyPreviewLine state={company} onPick={onPicked} />
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

/** SIRET'in altındaki tek satır; her hâlde bir cümle durur ki sonuç gelince alan yerinden oynamasın. */
function CompanyPreviewLine({ state, onPick }: { state: CompanyPreviewState; onPick: (customer: StaffCustomerOption) => void }) {
  const muted = 'font-ops-body text-ops-xs leading-[1.5] text-ops-muted';
  const alert = 'font-ops-body text-ops-xs leading-[1.5] text-ops-red';

  if (state.kind === 'idle') return <p className={muted}>Resmî kayıttan unvan ve fatura adresi gelir; kayıt B2B onayını bekler.</p>;
  if (state.kind === 'loading') return <p className={muted}>Resmî kayıt okunuyor…</p>;
  if (state.kind === 'failed') return <p className={muted}>Önizleme okunamadı; kayıt açılırken resmî kayıt yeniden sorulur.</p>;

  const { registry, existing } = state.preview;
  if (existing.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className={alert}>Bu SIRET&apos;le kayıt var; yenisini açmak yerine onu seçin.</p>
        {existing.map((customer) => (
          <div
            key={customer.id}
            className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2"
          >
            <span className="flex min-w-0 flex-col gap-px">
              <span className="truncate font-ops-body text-ops-sm text-ops-ink">{customer.name}</span>
              <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{customer.phone ?? 'telefon yok'}</span>
            </span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onPick(customer)}>
              Bu kaydı seç
            </Button>
          </div>
        ))}
      </div>
    );
  }
  if (registry === 'not_found') return <p className={alert}>Bu SIRET resmî kayıtta yok; numarayı kontrol edin.</p>;
  if (registry === 'unavailable') {
    return <p className={muted}>Resmî kayıt şu an okunamadı; kayıt SIRET&apos;le açılır, künye onay kartında okunur.</p>;
  }
  return (
    <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
      <span className="font-semibold text-ops-ink">{registry.legalName}</span>
      {` · ${registry.line1}, ${registry.postalCode} ${registry.city}`}
      {registry.isActive === false ? <span className="text-ops-red"> · kapalı</span> : null}
    </p>
  );
}

interface AddressDialogProps {
  customerId: string;
  onClose: () => void;
  onCreated: (address: StaffAddressOption) => void;
}

export function AddressDialog({ customerId, onClose, onCreated }: AddressDialogProps) {
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { data, error: actionError } = await createAddressAction(customerId, {
      recipient,
      phone,
      line1,
      line2: line2.trim() || null,
      postalCode,
      city,
    });
    setSubmitting(false);
    if (actionError || !data) {
      setError(actionError ?? 'Adres eklenemedi.');
      return;
    }
    onCreated(data);
  };

  const eksik = !recipient.trim()
    ? 'Alıcı girilmeli'
    : !phone.trim()
      ? 'Telefon girilmeli'
      : !line1.trim()
        ? 'Sokak girilmeli'
        : !postalCode.trim()
          ? 'Posta kodu girilmeli'
          : !city.trim()
            ? 'Şehir girilmeli'
            : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni adres"
      subtitle="Siparişin deposu ve teslimat günü bu adresten çözülür"
      maxWidth={480}
      footer={
        <DialogFooter
          formId={ADDRESS_FORM_ID}
          onCancel={onClose}
          submitting={submitting}
          error={error}
          submitLabel="Adresi ekle"
          blockedReason={eksik}
        />
      }
    >
      <form
        id={ADDRESS_FORM_ID}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* Alıcı hesap sahibiyle aynı olmak zorunda değil (hediye, iş adresi, aile büyüğü) — kapıda
            kimlik BU adla karşılaştırılır ve yanlış ad paketi iade ettirir (`address.recipient`). */}
        <TextField label="Alıcı" value={recipient} onChange={setRecipient} required />
        <TextField label="Kapıda aranacak telefon" value={phone} onChange={setPhone} required />
        <TextField label="Sokak" value={line1} onChange={setLine1} required />
        <TextField label="Bina / daire" value={line2} onChange={setLine2} />
        <div className="grid grid-cols-[1fr_1.6fr] gap-3">
          {/* Posta kodu rotayı belirler; şehirle tutarlılığı sunucu denetler, çünkü hangisinin yanlış olduğunu ekran bilemez. */}
          <TextField label="Posta kodu" value={postalCode} onChange={setPostalCode} required />
          <TextField label="Şehir" value={city} onChange={setCity} required />
        </div>
      </form>
    </Dialog>
  );
}
