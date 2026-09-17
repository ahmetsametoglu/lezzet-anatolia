'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { errorText } from '@/lib/customer-error-text';
import { signOutAction } from '@/lib/auth/actions';
import { deleteAccountAction } from '../actions';
import type { Messages } from '../account-types';

/**
 * Silme iki adımlıdır, çünkü işlem geri alınamaz ve diyalog neyin gittiğini de neyin yasal olarak kaldığını da ayrı ayrı söyler.
 * Silmeden sonra tam yenilemeyle çıkış yapılır, çünkü `anonymize` tarayıcıdaki oturum çerezine dokunmaz.
 */
interface DeleteAccountProps {
  t: Messages;
  /** Telefon görünümünün metin eylemi. */
  compact?: boolean;
}

export function DeleteAccount({ t, compact = false }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locale = useLocale();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const { errorKey } = await deleteAccountAction();
      if (errorKey) {
        setError(errorText(t.errors, errorKey));
        return;
      }
      // Çerez SİLME BAŞARILI OLDUKTAN SONRA temizlenir: sıra tersine olsaydı silme düşen bir
      // koşuda müşteri hem hesabıyla hem oturumuyla kalır, ne olduğunu anlamazdı.
      await signOutAction();
      // Dil yolda tutulur: çıplak `/` dili tarayıcıya sordurur ve müşteri başka dilde bir anasayfaya düşebilir.
      window.location.assign(`/${locale}`);
    });
  };

  return (
    <>
      {/* Dolgulu değil: dolgulu kırmızı düğme sayfanın en güçlü çağrısı olur ve müşteriyi silmeye davet ederdi. */}
      {compact ? (
        <span className="self-start">
          <TextAction label={t.deleteAccount.action} tone="terracotta" onClick={() => setOpen(true)} />
        </span>
      ) : (
        <Button variant="ghost" size="sm" className="!px-0 !text-terracotta-bright hover:!text-terracotta" onClick={() => setOpen(true)}>
          {t.deleteAccount.action}
        </Button>
      )}

      {open && (
        <Dialog title={t.deleteAccount.title} closeLabel={t.deleteAccount.cancel} onClose={() => setOpen(false)} maxWidth={460}>
          <div className="flex flex-col gap-3.5 pt-2">
            <p className="font-sans text-body-sm leading-relaxed text-body">{t.deleteAccount.body}</p>

            <div className="flex flex-col gap-1.5 rounded-soft bg-sand-50 px-4 py-3">
              <span className="font-sans text-note font-bold text-ink">{t.deleteAccount.goesTitle}</span>
              <span className="font-sans text-note leading-relaxed text-body">{t.deleteAccount.goes}</span>
            </div>

            {/* Kalan, gidenle aynı ağırlıkta çizilir: dipnot olsaydı okunmazdı ve okunmayan yer sonradan "bana söylenmedi"
                denilecek yerdir. */}
            <div className="flex flex-col gap-1.5 rounded-soft border border-honey-line bg-honey-bg px-4 py-3">
              <span className="font-sans text-note font-bold text-honey">{t.deleteAccount.staysTitle}</span>
              <span className="font-sans text-note leading-relaxed text-body">{t.deleteAccount.stays}</span>
            </div>

            <p className="font-sans text-note font-semibold text-terracotta-bright">{t.deleteAccount.irreversible}</p>
            {error && <p className="font-sans text-note font-semibold text-terracotta-bright">{error}</p>}

            <div className="flex items-center justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                {t.deleteAccount.cancel}
              </Button>
              <Button variant="outlineTerracotta" size="sm" onClick={confirm} disabled={pending}>
                {pending ? t.deleteAccount.deleting : t.deleteAccount.confirm}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
