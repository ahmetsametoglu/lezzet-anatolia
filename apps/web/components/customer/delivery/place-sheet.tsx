'use client';

import { useCallback } from 'react';
import { POSTAL_CODE_LENGTH } from '@lezzet/address';
import type { Locale } from '@lezzet/i18n';
import placeCopy from '@lezzet/i18n/customer/place';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Dialog } from '@/components/customer/ui/dialog';
import { useToast } from '@/components/customer/ui/toast';
import { useAccount } from '@/components/customer/account/account-context';
import { AddressPickerDialog } from './address-picker';
import { useDeliveryPlace } from './place-context';
import { PostalCodeFields } from './postal-code-fields';
import { usePostalCodeDraft } from './use-postal-code-draft.hook';
import messages from './place-messages.json';

/**
 * Telefonun yer çekmecesi: adresi olan müşteri sepetle aynı adres çekmecesini görür ki aynı seçim için iki ayrı çekmece olmasın,
 * adresi olmayana native'in posta kodu çekmecesi açılır. Gel-al kartı adres çekmecesinde yalnız izinli müşteriye gelir.
 */
interface PlaceSheetProps {
  locale: Locale;
}

export function PlaceSheet({ locale }: PlaceSheetProps) {
  const { panelOpen, setPanelOpen, address } = useDeliveryPlace();
  const account = useAccount();
  // `Dialog` kapanma işlevine bağlı bir efekt taşıyor; kimliği her çizimde değişirse odak tuzağı her seferinde yeniden kurulur.
  const close = useCallback(() => setPanelOpen(false), [setPanelOpen]);

  if (!panelOpen) return null;
  if (account && address) return <AddressPickerDialog locale={locale} compact initialMode="list" onClose={close} />;
  return (
    <Dialog placement="sheet" title={placeCopy[locale].zip.title} closeLabel={messages[locale].close} onClose={close}>
      <CodeForm locale={locale} signedIn={account !== null} onSaved={close} />
    </Dialog>
  );
}

interface CodeFormProps {
  locale: Locale;
  /** Girişli müşteriye kodun yalnız gezinme için olduğu söylenir, yoksa girdiği kodu teslimat adresi sanırdı. */
  signedIn: boolean;
  onSaved: () => void;
}

function CodeForm({ locale, signedIn, onSaved }: CodeFormProps) {
  const copy = placeCopy[locale].zip;
  const notify = useToast();
  const draft = usePostalCodeDraft();

  const save = async () => {
    const result = await draft.save();
    if (result === null) return notify(messages[locale].failed);
    if (result.kind !== 'resolved') return;
    onSaved();
    notify(copy.saved);
  };

  return (
    <>
      <PostalCodeFields
        locale={locale}
        draft={draft}
        aside={signedIn && <p className="font-sans text-helper leading-[1.6] text-muted">{copy.browsingOnly}</p>}
      />
      <PrimaryButton
        label={copy.save}
        shape="block"
        disabled={draft.code.length < POSTAL_CODE_LENGTH || draft.saving}
        onClick={() => void save()}
      />
      {/* İkinci yol düğmenin altında ve ortada: aynı sorunun öteki yüzü. Çekmeceyi sayfa değişince yer bağlamı kapatır. */}
      <div className="flex justify-center">
        <TextAction label={placeCopy[locale].placeNotice.zones} href="/delivery-zones" />
      </div>
    </>
  );
}
