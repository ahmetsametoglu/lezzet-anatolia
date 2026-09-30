'use client';

import { useState } from 'react';
import { initialsOf } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { useSignOut } from '@/components/customer/account/use-sign-out.hook';
import { Button } from '@/components/customer/ui/button';
import type { CustomerIdentity } from '@/lib/guard';

/**
 * "Siz değil misiniz?" gerçekten çıkış yapar, yoksa paylaşılan cihazda ikinci kişi birincinin hesabıyla sipariş verirdi. Tek dokunuşla
 * değil onayla çıkar, çünkü yanlışlıkla basan müşteri oturumunu kaybetmemeli; soru ayrı pencerede değil satırın içinde sorulur.
 */
function NotYou({ locale }: { locale: Locale }) {
  const copy = cartMessages[locale].account;
  const [confirming, setConfirming] = useState(false);
  const { busy, signOut } = useSignOut();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="cursor-pointer self-start font-sans text-micro font-semibold text-olive underline hover:text-olive-dark"
      >
        {copy.notYou}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-sans text-micro text-olive-dark">{copy.confirm}</span>
      <Button variant="ghost" size="xs" disabled={busy} onClick={() => void signOut()}>
        {copy.yes}
      </Button>
      <Button variant="ghost" size="xs" disabled={busy} onClick={() => setConfirming(false)}>
        {copy.cancel}
      </Button>
    </span>
  );
}

interface AccountIdentityProps {
  locale: Locale;
  account: CustomerIdentity;
  /** Telefon yuvarlağı tasarımın mobil kartından (kum zemin); masaüstünde başlıktaki hesap girişinin tonu. */
  compact?: boolean;
}

/** Sepetin hesap kartının içi; telefon ve masaüstü kartı aynı içi çizer. */
export function AccountIdentity({ locale, account, compact = false }: AccountIdentityProps) {
  return (
    <>
      <span
        aria-hidden
        className={[
          'grid flex-none place-items-center rounded-full font-sans text-note font-bold text-honey',
          compact ? 'size-9.5 bg-sand-150' : 'size-9 bg-honey-line',
        ].join(' ')}
      >
        {initialsOf(account.name, account.email, locale)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-sans text-body-sm font-bold text-ink">{account.name || account.email}</span>
        {account.name && account.email && <span className="truncate font-sans text-micro text-muted">{account.email}</span>}
        <NotYou locale={locale} />
      </span>
    </>
  );
}

/** Telefon sepetinde girişli müşterinin hesap kartı (tasarımın mobil sepet kartı); "Siz değil misiniz?" tasarıma eklendi. */
export function PhoneAccountCard({ locale, account }: Pick<AccountIdentityProps, 'locale' | 'account'>) {
  return (
    <div className="flex items-center gap-2.75 rounded-control border-[1.5px] border-sand-300 bg-card px-3.5 py-3">
      <AccountIdentity locale={locale} account={account} compact />
    </div>
  );
}
