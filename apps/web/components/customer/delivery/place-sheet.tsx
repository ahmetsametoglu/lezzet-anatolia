'use client';

import { useCallback } from 'react';
import { POSTAL_CODE_LENGTH } from '@lezzet/address';
import { placeAnswerNote } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import placeCopy from '@lezzet/i18n/customer/place';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { Dialog } from '@/components/customer/ui/dialog';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { useToast } from '@/components/customer/ui/toast';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { useAccount } from '@/components/customer/account/account-context';
import { AddressPickerDialog } from './address-picker';
import { CountryChoice } from './country-choice';
import { useDeliveryPlace } from './place-context';
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
  const { answer } = draft;
  const placeName = answer?.kind === 'resolved' ? answer.place.placeName : null;
  const inRoute = answer?.kind === 'resolved' && answer.place.inRoute;
  const note = answer === null ? null : copy[`${placeAnswerNote(answer)}Note`];

  const save = async () => {
    const result = await draft.save();
    if (result === null) return notify(messages[locale].failed);
    if (result.kind !== 'resolved') return;
    onSaved();
    notify(copy.saved);
  };

  return (
    <>
      <CountryChoice locale={locale} value={draft.country} onChange={draft.setCountry} compact />
      <FormInputField
        variant="soft"
        hideLabel
        label={copy.field}
        placeholder={copy.placeholder}
        value={draft.code}
        onChange={(e) => draft.type(e.target.value)}
        inputMode="numeric"
        autoComplete="postal-code"
      />
      {draft.suggestOpen && <SuggestionList items={draft.suggestions} onSelect={draft.pick} label={copy.suggestLabel} />}
      {/* İskelet cevabın iki satırının yerini tutar: kısa çubuk yer adı, uzun çubuk teslimat cümlesi. */}
      {draft.pending && (
        <span className="flex flex-col gap-1">
          <Skeleton className="h-(--text-control) w-35 rounded-badge" />
          <Skeleton className="h-(--text-note) w-full rounded-badge" />
        </span>
      )}
      {placeName && (
        <p className="font-sans text-body-sm font-bold text-ink">
          {draft.code} · {placeName}
        </p>
      )}
      {signedIn && <p className="font-sans text-helper leading-[1.6] text-muted">{copy.browsingOnly}</p>}
      {note && <p className={`font-sans text-field-label leading-[1.6] font-semibold ${inRoute ? 'text-olive-dark' : 'text-muted'}`}>{note}</p>}
      <PrimaryButton
        label={copy.save}
        shape="block"
        disabled={draft.code.length < POSTAL_CODE_LENGTH || draft.saving}
        onClick={() => void save()}
      />
    </>
  );
}
