'use client';

import { useState } from 'react';
import { signedInText } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import { Button } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { signOutAction } from '@/lib/auth/actions';

interface NotYouProps {
  locale: Locale;
}

/**
 * "Siz değil misiniz?" gerçekten çıkış yapar, yoksa paylaşılan cihazda ikinci kişi birincinin hesabıyla sipariş verirdi. Tek dokunuşla
 * değil onayla çıkar, çünkü yanlışlıkla basan müşteri oturumunu kaybetmemeli; soru ayrı pencerede değil satırın içinde sorulur.
 */
export function NotYou({ locale }: NotYouProps) {
  const copy = cartMessages[locale].account;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tam yenileme, çünkü oturuma göre kurulmuş her şey (sepet, adresler, yer) sıfırdan kurulmalı.
  const signOut = async () => {
    setBusy(true);
    await signOutAction();
    window.location.reload();
  };

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

interface AccountBandProps {
  locale: Locale;
  email: string | null;
}

/** Telefon sepetinde misafirin giriş kartının yeri: girişli müşteri siparişin kimin adına verileceğini ödemeden önce burada görür. */
export function AccountBand({ locale, email }: AccountBandProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-sand-150 px-3.5 py-3">
      <span className="inline-flex max-w-full items-center gap-1.5 font-sans text-note font-semibold text-ink">
        <Icon name="check" size={14} className="flex-none" />
        <span className="min-w-0 break-words">{signedInText(email, locale)}</span>
      </span>
      <span className="ml-auto">
        <NotYou locale={locale} />
      </span>
    </div>
  );
}
