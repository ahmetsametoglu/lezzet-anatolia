'use client';

import { useCallback } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { FormSelectField } from '@/components/customer/form/form-select-field';
import { useAccount } from '@/components/customer/account/account-context';
import { AddressPickerDialog } from './address-picker';
import { useDeliveryPlace } from './place-context';
import { usePlaceCodeEntry } from './use-place-answer.hook';
import messages from './place-messages.json';

type Copy = (typeof messages)['tr'];

/**
 * Telefonun yer çekmecesi: misafire ülke ve posta kodu sorulur, girişli müşteri sepetle aynı adres çekmecesini görür ki aynı seçim
 * için iki ayrı çekmece olmasın (native'de de tek). Gel-al kartı o çekmecede yalnız izinli müşteriye gelir.
 */
interface PlaceSheetProps {
  locale: Locale;
}

export function PlaceSheet({ locale }: PlaceSheetProps) {
  const t = messages[locale];
  const { panelOpen, setPanelOpen } = useDeliveryPlace();
  const account = useAccount();
  // `Dialog` kapanma işlevine bağlı bir efekt taşıyor; kimliği her çizimde değişirse odak tuzağı her seferinde yeniden kurulur.
  const close = useCallback(() => setPanelOpen(false), [setPanelOpen]);

  if (!panelOpen) return null;
  if (account) return <AddressPickerDialog locale={locale} compact initialMode="list" onClose={close} />;
  return (
    <Dialog placement="sheet" title={t.panelTitle} description={t.panelBody} closeLabel={t.close} onClose={close}>
      <CodeForm t={t} locale={locale} />
    </Dialog>
  );
}

function CodeForm({ t, locale }: { t: Copy; locale: Locale }) {
  const { country, setCountry, countries, state, problem } = usePlaceCodeEntry(locale);

  return (
    <>
      <div className="flex items-end gap-[9px]">
        <div className="w-[128px] flex-none">
          <FormSelectField variant="sheet" label={t.panelCountryLabel} value={country} options={countries} onChange={setCountry} />
        </div>
        <div className="min-w-0 flex-1">
          <FormInputField
            variant="sheet"
            label={t.panelCodeLabel}
            {...state.inputProps}
            placeholder="67000"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            invalid={problem !== null}
          />
        </div>
      </div>
      <Button size="sm" fullWidth onClick={() => void state.submit(state.value)} disabled={state.busy}>
        {t.submit}
      </Button>
      <span className="text-center font-sans text-micro leading-[1.55] text-muted">{t.panelHint}</span>
      {problem && (
        <p role="alert" className="text-center font-sans text-note font-semibold text-terracotta-bright">
          {problem}
        </p>
      )}
    </>
  );
}
