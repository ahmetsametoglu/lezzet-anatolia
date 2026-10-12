import { useEffect, useState } from 'react';
import { formatSiret, isValidSiret, normalizeSiret } from '@lezzet/domain-core';
import { isValidEmail } from '@lezzet/helper';
import type { StaffCompanyLookup, StaffCustomerOption } from '@lezzet/types';

import { createStaffCustomer, lookupStaffCompany } from '@/lib/api/staff-order';
import { fillCopy } from '@/screens/operations/copy';
import { toastError } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { staffOrderCopy as t } from './copy';

/*
  Sahada açılan profesyonel kayıt: SIRET 14 hane ve kontrol hanesiyle tamamlanınca resmî kayıt ve aynı SIRET'li kayıtlar okunur. Aynı
  SIRET'le kayıt varsa yenisi açılmaz, o seçilir; resmî kayıt okunamazsa kayıt yine açılır ve künyeyi onay kartı okur.
*/

export type RegistryState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; lookup: StaffCompanyLookup };

/** Kaydı açmayı engelleyen ilk sebep; `null` = açılabilir. Alan vurgusu da buradan okunur. */
export type NewCustomerBlock = 'siret' | 'siretInvalid' | 'loading' | 'dup' | 'notFound' | 'name' | 'email' | null;

export function useNewCustomer() {
  const [siret, setSiretState] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  /** Gönderimde e-posta ya da SIRET başka kayıtta çıktıysa o kayıt; kutu onu seçtirir. */
  const [taken, setTaken] = useState<{ key: 'email' | 'siret'; existing: StaffCustomerOption } | null>(null);
  const [result, setResult] = useState<{ siret: string; state: RegistryState } | null>(null);

  const digits = normalizeSiret(siret);
  const checkable = digits.length === 14 && isValidSiret(digits);

  useEffect(() => {
    if (!checkable) return;
    let current = true;
    void lookupStaffCompany(digits).then((lookup) => {
      if (!current) return;
      setResult({ siret: digits, state: lookup.error === null ? { kind: 'ready', lookup: lookup.data } : { kind: 'failed' } });
    });
    return () => {
      current = false;
    };
  }, [checkable, digits]);

  const registry: RegistryState = !checkable ? { kind: 'idle' } : result?.siret === digits ? result.state : { kind: 'loading' };
  const duplicate =
    taken !== null
      ? taken
      : registry.kind === 'ready' && registry.lookup.existing[0] !== undefined
        ? { key: 'siret' as const, existing: registry.lookup.existing[0] }
        : null;

  const block: NewCustomerBlock =
    digits.length !== 14
      ? 'siret'
      : !checkable
        ? 'siretInvalid'
        : registry.kind === 'loading'
          ? 'loading'
          : duplicate !== null
            ? 'dup'
            : registry.kind === 'ready' && registry.lookup.registry.status === 'not_found'
              ? 'notFound'
              : name.trim() === '' || phone.trim() === ''
                ? 'name'
                : email.trim() !== '' && !isValidEmail(email)
                  ? 'email'
                  : null;

  const setSiret = (value: string) => {
    setSiretState(formatSiret(normalizeSiret(value).slice(0, 14)));
    setTaken(null);
  };

  /** Kayıt açılırsa ya da aynı kayıt çıkarsa seçilecek müşteri döner; ret ve bağlantı hatası bildirimle söylenir. */
  const submit = async (): Promise<StaffCustomerOption | null> => {
    if (block !== null || sending) return null;
    setSending(true);
    const outcome = await createStaffCustomer({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() === '' ? null : email.trim(),
      type: 'company',
      siret: digits,
    });
    setSending(false);
    if (outcome.error !== null) {
      toastError(t.newCustomer.failed);
      return null;
    }
    const data = outcome.data;
    if (data.status === 'ok') return data.customer;
    if (data.status === 'taken') {
      setTaken({ key: data.key, existing: data.existing });
      toastError(
        fillCopy(t.newCustomer.taken, {
          key: data.key === 'email' ? t.newCustomer.takenEmail : t.newCustomer.takenSiret,
          name: data.existing.name,
        }),
      );
      return null;
    }
    if (data.status === 'siret_not_found') {
      toastError(t.newCustomer.why.notFound);
      return null;
    }
    toastError(
      data.field === 'email' ? t.newCustomer.why.email : data.field === 'siret' ? t.newCustomer.why.siretInvalid : t.newCustomer.why.name,
    );
    return null;
  };

  return { siret, setSiret, name, setName, phone, setPhone, email, setEmail, registry, duplicate, block, sending, submit };
}
