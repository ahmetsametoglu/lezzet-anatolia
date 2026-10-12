import { useState } from 'react';
import { POSTAL_CODE_PATTERN, type StaffAddressField, type StaffAddressOption, type StaffCustomerOption } from '@lezzet/types';

import { createStaffAddress } from '@/lib/api/staff-order';
import { toastError } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { staffOrderCopy as t } from './copy';

/*
  Yeni adreste alıcı ve telefon müşterinin kendisiyle dolu gelir; kurye kapıda başkasını soracaksa personel değiştirir. Posta kodu
  ve şehrin uyumu sunucuda denetlenir, ret alanın adıyla döner.
*/

export function useNewAddress(customer: StaffCustomerOption | null) {
  const [recipient, setRecipient] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [sending, setSending] = useState(false);

  const block: StaffAddressField | null =
    recipient.trim() === ''
      ? 'recipient'
      : phone.trim() === ''
        ? 'phone'
        : line1.trim() === ''
          ? 'line1'
          : !POSTAL_CODE_PATTERN.test(postalCode.trim())
            ? 'postalCode'
            : city.trim() === ''
              ? 'city'
              : null;

  const submit = async (): Promise<StaffAddressOption | null> => {
    if (customer === null || block !== null || sending) return null;
    setSending(true);
    const outcome = await createStaffAddress(customer.id, {
      recipient: recipient.trim(),
      phone: phone.trim(),
      line1: line1.trim(),
      line2: line2.trim() === '' ? null : line2.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
    });
    setSending(false);
    if (outcome.error !== null) {
      toastError(t.newAddress.failed);
      return null;
    }
    if (outcome.data.status === 'invalid') {
      toastError(t.newAddress.why[outcome.data.field]);
      return null;
    }
    return outcome.data.address;
  };

  return {
    recipient,
    setRecipient,
    phone,
    setPhone,
    line1,
    setLine1,
    line2,
    setLine2,
    postalCode,
    setPostalCode,
    city,
    setCity,
    block,
    sending,
    submit,
  };
}
