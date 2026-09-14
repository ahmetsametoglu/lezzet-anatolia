'use client';

import { useCallback, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { FormSelectField } from '@/components/customer/form/form-select-field';
import { RadioMark } from '@/components/customer/form/radio-mark';
import { useAccount } from '@/components/customer/account/account-context';
import { AddressPickerDialog } from './address-picker';
import { ChannelBadge } from './channel-badge';
import { useDeliveryPlace } from './place-context';
import { useAddressPick, usePlaceCodeEntry } from './use-place-answer.hook';
import messages from './place-messages.json';

type Copy = (typeof messages)['tr'];

/**
 * **Mobil webin yer çekmecesi — `Musteri Mobil v1.dc.html` yer panelinin görünümde birebir aynısı**
 * (13.09).
 *
 * Soru masaüstü paneliyle AYNI ("Nereye getirelim?"), ayrım da aynı: v1 gibi GİRİŞE göre
 * (`yerPanelAdres: girisli`) — ziyaretçide ÜLKE + POSTA KODU + "Göster", girişli müşteride kayıtlı
 * adres kartları ve "+ Yeni adres ekle". Davranış iki kabukta ortak (`use-place-answer.hook`),
 * parçalar kitten (form kiti · `ChannelBadge` · `Button` · `RadioMark`); burada yalnız dar ekranın çizimi
 * var: alttan açılan çekmece, kartlar alt alta, düğme tam genişlikte. Alanlar BEYAZ zeminli
 * (`sheet` çizimi): çekmecenin zemini krem, masaüstü panelinin tersi.
 *
 * Açık/kapalı durumu bağlamda (`PlaceProvider.panelOpen`) — masaüstünde aynı durum başlığın altındaki
 * paneli açıyor. Yer satırı çekmeceyi açar, sayfa değişince kapanır (bağlamın kuralı).
 *
 * v1'in çizmediği tek hâl sorun satırı: çekmece açık kalır, alan kırmızı çerçeve alır ve düğmenin
 * altında tek satır belirir — masaüstü panelinin aynı kararı.
 */
interface PlaceSheetProps {
  locale: Locale;
}

export function PlaceSheet({ locale }: PlaceSheetProps) {
  const t = messages[locale];
  const { panelOpen, setPanelOpen } = useDeliveryPlace();
  const account = useAccount();
  // "+ Yeni adres ekle" çekmeceyi KAPATIP adres çekmecesini açar (v1 `yerYeniAdres`). Durum burada,
  // çekmecenin dışında: içeride dursaydı çekmece kapanınca onunla birlikte sökülürdü.
  const [adding, setAdding] = useState(false);
  // `Dialog` kapanma işlevine bağlı bir efekt taşıyor; kimliği her çizimde değişirse odak tuzağı
  // her seferinde yeniden kurulur.
  const close = useCallback(() => setPanelOpen(false), [setPanelOpen]);

  return (
    <>
      {panelOpen && (
        <Dialog placement="sheet" title={t.panelTitle} description={account ? t.panelBodyAddress : t.panelBody} closeLabel={t.close} onClose={close}>
          {account ? (
            <AddressList
              t={t}
              locale={locale}
              onAdd={() => {
                setPanelOpen(false);
                setAdding(true);
              }}
            />
          ) : (
            <CodeForm t={t} locale={locale} />
          )}
        </Dialog>
      )}
      {adding && <AddressPickerDialog locale={locale} compact initialMode="new" onClose={() => setAdding(false)} />}
    </>
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

/**
 * Girişli müşterinin cevabı — kayıtlı adres kartları alt alta (v1 mobil). Seçili kart adının yanında
 * "· varsayılan" taşır (v1 "Ev · varsayılan"); adresi hiç yoksa yalnız ekleme kartı kalır.
 */
function AddressList({ t, locale, onAdd }: { t: Copy; locale: Locale; onAdd: () => void }) {
  const { addresses, failed, busy, current, pick } = useAddressPick(locale);

  return (
    <>
      {failed && (
        <span role="alert" className="font-sans text-note font-semibold text-terracotta">
          {t.failed}
        </span>
      )}
      {(addresses ?? []).map((row) => {
        const selected = row.id === current?.id;
        return (
          <button
            key={row.id}
            type="button"
            disabled={busy}
            aria-pressed={selected}
            onClick={() => void pick(row)}
            className={[
              'flex cursor-pointer items-start gap-2.5 rounded-soft p-3.25 text-left transition-colors hover:border-olive disabled:cursor-progress',
              focusRingClass,
              selected ? 'border-2 border-olive bg-olive-bg' : 'border border-sand-300 bg-card',
            ].join(' ')}
          >
            <RadioMark selected={selected} />
            <span className="flex min-w-0 flex-col gap-0.75">
              <span className="font-sans text-note font-bold text-ink">
                {row.label || row.city}
                {selected && ` · ${t.panelDefault}`}
              </span>
              <span className="font-sans text-[12px] leading-[1.45] text-body">
                {row.line1} · {row.postalCode} {row.city}
              </span>
              <span className="mt-0.5">
                <ChannelBadge postalCode={row.postalCode} locale={locale} />
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className={`cursor-pointer rounded-soft border-[1.5px] border-dashed border-sand-500 p-3.25 text-center font-sans text-note font-bold text-olive transition-colors hover:border-olive ${focusRingClass}`}
      >
        {t.panelAdd}
      </button>
    </>
  );
}
