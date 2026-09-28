'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import placeMessages from '@lezzet/i18n/customer/place';
import { useAccount } from '@/components/customer/account/account-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { useZoneNoticeNoted } from '@/components/customer/delivery/zone-notice-button';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { useToast } from '@/components/customer/ui/toast';
import { recordZoneNoticeAction } from '@/lib/delivery/notice-actions';
import type { AccountCopy } from '../account-types';

interface PhoneZoneInterestProps {
  copy: AccountCopy['marketing']['zone'];
  locale: Locale;
  /** Hesaba yazılı bölge haberi kodları; kayıt varsa düğme yerine "alındı" cümlesi çizilir. */
  recorded: readonly string[];
}

/**
 * Teslimat adresi rota dışındaki müşteriye talep sorusu, native hesabın bölge kutusunun ikizi. Kayıt `zone_notice`a gider ve
 * kampanya iznini açmaz; hafıza katalogdaki bandla ortak, orada talep bırakan müşteri düğmeyi burada yeniden görmez.
 */
export function PhoneZoneInterest({ copy, locale, recorded }: PhoneZoneInterestProps) {
  const { place, address } = useDeliveryPlace();
  const account = useAccount();
  const toast = useToast();
  const postalCode = place?.postalCode ?? '';
  const [noted, remember] = useZoneNoticeNoted(postalCode);
  const [sending, setSending] = useState(false);

  // Soru yalnız adres yerken ve yer rota dışındayken sorulur; yer çözülemediyse "bölge dışı" denmez.
  if (address === null || place === null || place.inRoute) return null;
  const done = noted || recorded.includes(postalCode);
  const email = account?.email ?? null;

  const send = async () => {
    if (email === null) return;
    const placeCopy = placeMessages[locale].placeNotice;
    setSending(true);
    const { errorKey } = await recordZoneNoticeAction(postalCode, email, locale);
    setSending(false);
    if (errorKey) {
      toast(errorKey === 'place_unknown' ? placeCopy.placeUnknown : placeCopy.failed);
      return;
    }
    remember();
    toast(copy.sent);
  };

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-control bg-terracotta-bg p-3.5">
      <span className="font-sans text-control text-terracotta">{copy.title}</span>
      <p className="font-sans text-note leading-[1.6] text-body">{copy.body.replace('{place}', address.city)}</p>
      {done ? (
        <span className="font-sans text-note font-semibold text-olive-dark">{copy.done}</span>
      ) : (
        <PrimaryButton shape="block" label={copy.cta} onClick={() => void send()} disabled={sending || email === null} />
      )}
    </div>
  );
}
