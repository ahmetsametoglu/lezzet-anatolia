'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
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
 * Masaüstü başlığının yer paneli: hapa basınca başlık satırının altında açılır, sayfa değişince kapanır. Ziyaretçiye önce ülke sonra
 * posta kodu sorulur; girişli müşteriye kayıtlı adres kartları gelir, çünkü onun yeri adresinden gelir ve kod sormak onu çereze yönlendirirdi.
 */
interface PlacePanelProps {
  locale: Locale;
}

export function PlacePanel({ locale }: PlacePanelProps) {
  const t = messages[locale];
  const { panelOpen, setPanelOpen } = useDeliveryPlace();
  const account = useAccount();
  // "+ Yeni adres ekle" paneli KAPATIP pencereyi açar (v1 `yerYeniAdres`). Pencere panelin içinde
  // dursaydı panel kapanınca onunla birlikte sökülürdü — durumu burada, panelin dışında.
  const [adding, setAdding] = useState(false);

  /* Panel açılınca sayfanın tepesine gidilir, çünkü panel yapışkan başlığın dışında, sayfa akışında durur ve ürün, paket ya da
     katalogdaki düğmelerden açılınca ekranın dışında kalırdı. */
  useEffect(() => {
    if (!panelOpen || window.scrollY === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [panelOpen]);

  return (
    <>
      {panelOpen && (
        <div className="animate-fade-in border-b border-sand-275 bg-cream-deep motion-reduce:animate-none">
          <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-start gap-11 px-12 pt-5.5 pb-6">
            <div className="flex w-[380px] flex-none flex-col gap-1.25">
              <span className="font-serif text-h2-sm text-ink">{t.panelTitle}</span>
              <span className="font-sans text-note leading-relaxed text-body">{account ? t.panelBodyAddress : t.panelBody}</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="mt-1 w-max cursor-pointer font-sans text-note font-semibold text-muted underline transition-colors hover:text-ink"
              >
                {t.promptSkip}
              </button>
            </div>
            {account ? (
              <AddressCards
                t={t}
                locale={locale}
                onAdd={() => {
                  setPanelOpen(false);
                  setAdding(true);
                }}
              />
            ) : (
              <CodeEntry t={t} locale={locale} />
            )}
          </div>
        </div>
      )}
      {adding && <AddressPickerDialog locale={locale} initialMode="new" onClose={() => setAdding(false)} />}
    </>
  );
}

function CodeEntry({ t, locale }: { t: Copy; locale: Locale }) {
  const { country, setCountry, countries, state, problem } = usePlaceCodeEntry(locale);

  return (
    <div className={cardClass({ pad: 'tight', gap: 'xs' })}>
      <div className="flex flex-wrap items-end gap-3.5">
        <div className="w-[127px]">
          <FormSelectField
            variant="inline"
            label={t.panelCountryLabel}
            value={country}
            options={countries}
            onChange={setCountry}
          />
        </div>
        {/* v1 burada yalnız kod soruyor (5 hane, örnek "67000"); ad araması mobil webdeki pencerede. */}
        <div className="w-[165px]">
          <FormInputField
            variant="inline"
            label={t.panelCodeLabel}
            {...state.inputProps}
            placeholder="67000"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            invalid={problem !== null}
          />
        </div>
        <Button size="sm" onClick={() => void state.submit(state.value)} disabled={state.busy} className="!h-10 !px-6">
          {t.submit}
        </Button>
        <span className="w-full max-w-[330px] font-sans text-note leading-normal text-muted">{t.panelHint}</span>
      </div>
      {/* Sorun satırı kartı genişletmez (`w-0 min-w-full`), çünkü genişliği karta katılsaydı kart panele sığmaz ve alt satıra kayardı. */}
      {problem && (
        <p role="alert" className="w-0 min-w-full font-sans text-note font-semibold text-terracotta-bright">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * Girişli müşterinin kayıtlı adres kartları; seçmek varsayılan yapmaktır, bu yüzden seçili kart "· varsayılan" taşır. Seçilince panel
 * kapanır ve bildirim hangi adrese göre gösterildiğini söyler.
 */
function AddressCards({ t, locale, onAdd }: { t: Copy; locale: Locale; onAdd: () => void }) {
  const { addresses, failed, busy, current, pick } = useAddressPick(locale);

  return (
    <div className="flex min-w-[420px] flex-1 flex-col gap-3">
      {failed && <span className="font-sans text-note font-semibold text-terracotta">{t.failed}</span>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-2.5">
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
                'flex cursor-pointer items-start gap-2.5 rounded-2xl px-3.75 py-3.25 text-left transition-colors hover:border-olive disabled:cursor-progress',
                selected ? 'border-2 border-olive bg-olive-bg' : 'border border-sand-300 bg-card',
              ].join(' ')}
            >
              <RadioMark selected={selected} />
              <span className="flex min-w-0 flex-col gap-0.75">
                <span className="truncate font-sans text-body-sm font-bold text-ink">
                  {row.label || row.city}
                  {selected && ` · ${t.panelDefault}`}
                </span>
                <span className="font-sans text-note leading-[1.45] text-body">
                  {row.line1}
                  <br />
                  {row.postalCode} {row.city}
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
          // v1 `min-height:86px` İÇERİĞİN yüksekliği (taslak `content-box` ölçüyor): dolgu ve kenarla
          // kutu 115px. Kit `border-box` ölçer — aynı kutu için toplam yazılır.
          className="grid min-h-[115px] cursor-pointer place-items-center rounded-2xl border-[1.5px] border-dashed border-sand-500 px-3.75 py-3.25 font-sans text-body-sm font-bold text-olive transition-colors hover:border-olive"
        >
          {t.panelAdd}
        </button>
      </div>
    </div>
  );
}
