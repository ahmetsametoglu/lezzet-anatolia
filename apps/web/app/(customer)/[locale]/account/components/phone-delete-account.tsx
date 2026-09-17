'use client';

import { useCallback, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Note } from '@/components/customer/phone-kit/note';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Dialog } from '@/components/customer/ui/dialog';
import { signOutAction } from '@/lib/auth/actions';
import { deleteAccountAction } from '../actions';
import type { AccountCopy } from '../account-types';

/**
 * Hesap silmenin telefon hâli, native silme çekmecesinin ikizi. Kalan kayıtlar gidenlerle aynı ağırlıkta yazılır ki müşteri
 * yanıltılmasın; oturum ancak silme başarılı olunca kapanır.
 */
interface PhoneDeleteAccountProps {
  copy: AccountCopy['deleteAccount'];
  locale: Locale;
}

export function PhoneDeleteAccount({ copy, locale }: PhoneDeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  // Kararlı kapatma: panel her yeni kapatma işlevinde odağı baştan kurar.
  const close = useCallback(() => setOpen(false), []);

  const confirm = async () => {
    setDeleting(true);
    setFailed(false);
    const { errorKey } = await deleteAccountAction();
    if (errorKey) {
      setDeleting(false);
      setFailed(true);
      return;
    }
    await signOutAction();
    // Tam yenileme oturuma göre kurulmuş istemci durumunu siler; dil yolda tutulur ki müşteri başka dilde bir anasayfaya düşmesin.
    window.location.assign(`/${locale}`);
  };

  return (
    <>
      <span className="self-start">
        <TextAction
          label={copy.action}
          tone="terracotta"
          onClick={() => {
            setFailed(false);
            setOpen(true);
          }}
        />
      </span>

      {open && (
        <Dialog title={copy.title} closeLabel={copy.cancel} onClose={close} placement="sheet">
          <div className="flex flex-col gap-2.5 pb-3">
            <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.body}</p>

            <div className="flex flex-col gap-1 rounded-control bg-sand-150 px-3.5 py-2.5">
              <span className="font-sans text-body-sm font-bold text-ink">{copy.goesTitle}</span>
              <span className="font-sans text-body-sm leading-[1.6] text-body">{copy.goes}</span>
            </div>

            <div className="flex flex-col gap-1 rounded-control border border-honey-line bg-honey-bg px-3.5 py-2.5">
              <span className="font-sans text-body-sm font-bold text-honey">{copy.staysTitle}</span>
              <span className="font-sans text-body-sm leading-[1.6] text-body">{copy.stays}</span>
            </div>

            <p className="font-sans text-body-sm font-bold text-terracotta">{copy.irreversible}</p>
            {failed && <Note tone="terracotta" description={copy.failed} />}

            {/* İkisi de dolgusuz ve geri çekilme ilk okunan: yıkıcı işin en güçlü çağrı olmaması gerekir. */}
            <div className="flex items-center justify-end gap-2.5">
              <TextAction label={copy.cancel} onClick={close} disabled={deleting} />
              <SecondaryButton
                label={deleting ? copy.deleting : copy.confirm}
                tone="terracotta"
                shape="pill"
                disabled={deleting}
                onClick={() => void confirm()}
              />
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
