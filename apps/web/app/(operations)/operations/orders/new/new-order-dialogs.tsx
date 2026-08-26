'use client';

import { useState, type ReactNode } from 'react';
import type { CustomerType } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { createAddressAction, createCustomerAction } from './actions';
import type { AddressPickOption, CustomerPickOption } from './new-order-types';

/**
 * Elle sipariş girişinin iki kayıt penceresi (09.8) — **müşteri bul-veya-oluştur**'un "oluştur"
 * tarafı ve onun adresi.
 *
 * İkisi de KABUK: doğrulama ve yazım action'da (`createCustomerAction` · `createAddressAction`).
 * Buradaki `blockedReason` yalnız düğmeyi erken kapatır ve sebebini yazar — bir KAPI DEĞİLDİR;
 * istemcide durdurulan hiçbir şey güvence sayılmaz.
 *
 * Ham `<input>` yerine ortak kit (`FieldShell` + `Input`): CLAUDE §2. RHF kullanılmıyor çünkü
 * form altı alanlı ve tek adımlı — `useForm` burada yalnız aynı iki değeri ileri geri kopyalardı
 * (`manual-order-dialog`ın 22.33'te verdiği kararla aynı gerekçe).
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

interface CustomerDialogProps {
  onClose: () => void;
  onCreated: (customer: CustomerPickOption) => void;
}

export function CustomerDialog({ onClose, onCreated }: CustomerDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<CustomerType>('individual');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { data, error: actionError } = await createCustomerAction({
      name,
      phone,
      email: email.trim() || null,
      type,
    });
    setSubmitting(false);
    if (actionError || !data) {
      setError(actionError ?? 'Müşteri açılamadı.');
      return;
    }
    onCreated(data);
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
          blockedReason={!name.trim() ? 'Ad girilmeli' : !phone.trim() ? 'Telefon girilmeli' : null}
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
      </form>
    </Dialog>
  );
}

interface AddressDialogProps {
  customerId: string;
  onClose: () => void;
  onCreated: (address: AddressPickOption) => void;
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
          {/* Posta kodu ROTAYI belirler: bölgeye düşmezse sipariş kargo olur ya da hiç açılamaz.
              Şehirle tutarlılığı SUNUCU denetler (19.17) — burada serbest bırakılıyor, çünkü
              hangisinin yanlış olduğunu ekran bilemez ve düzeltmek yerine sormak gerekir. */}
          <TextField label="Posta kodu" value={postalCode} onChange={setPostalCode} required />
          <TextField label="Şehir" value={city} onChange={setCity} required />
        </div>
      </form>
    </Dialog>
  );
}
