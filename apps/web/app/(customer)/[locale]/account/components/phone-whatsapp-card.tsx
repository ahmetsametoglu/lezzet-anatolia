'use client';

import { Note } from '@/components/customer/phone-kit/note';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { errorText } from '@/lib/customer-error-text';
import type { AccountCopy, Messages } from '../account-types';
import { useWhatsappLink } from '../use-whatsapp-link.hook';

/**
 * Hesabın WhatsApp bağı, native WhatsApp kartının ikizi. Bağlı numaralar salt okunur, çünkü onlar müşterinin tercihi değil kendi
 * hattından gönderdiği mesajın kanıtıdır; başka numara bağlamak yeni bir kanıt ister.
 */
interface PhoneWhatsappCardProps {
  t: Messages;
  copy: AccountCopy['whatsapp'];
  numbers: string[];
}

export function PhoneWhatsappCard({ t, copy, numbers }: PhoneWhatsappCardProps) {
  const linked = numbers.length > 0;
  return (
    <SettingsCard
      title={copy.title}
      aside={linked ? <span className="font-sans text-helper font-bold text-olive-dark">{copy.verified}</span> : undefined}
    >
      <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.body}</p>
      {numbers.map((number) => (
        <span key={number} className="font-sans text-note font-bold text-ink">
          {number}
        </span>
      ))}
      <LinkAction t={t} copy={copy} numbers={numbers} />
    </SettingsCard>
  );
}

interface LinkActionProps {
  t: Messages;
  copy: AccountCopy['whatsapp'];
  numbers: string[];
}

function LinkAction({ t, copy, numbers }: LinkActionProps) {
  const { busy, errorKey, start } = useWhatsappLink(copy.message, numbers);
  const linked = numbers.length > 0;
  return (
    <>
      {linked ? (
        <span className="self-start">
          <TextAction label={busy ? copy.busy : copy.relink} onClick={() => void start()} disabled={busy} />
        </span>
      ) : (
        <>
          <span className="self-start">
            <SecondaryButton label={busy ? copy.busy : copy.cta} tone="olive" shape="pill" onClick={() => void start()} disabled={busy} />
          </span>
          <p className="font-sans text-helper text-muted">{copy.hint}</p>
        </>
      )}
      {errorKey !== null && <Note tone="terracotta" description={errorText(t.errors, errorKey)} />}
    </>
  );
}
