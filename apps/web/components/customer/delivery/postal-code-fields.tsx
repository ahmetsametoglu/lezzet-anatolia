'use client';

import type { ReactNode } from 'react';
import { placeAnswerNote } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import placeCopy from '@lezzet/i18n/customer/place';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { CountryChoice } from './country-choice';
import type { usePostalCodeDraft } from './use-postal-code-draft.hook';

/** Posta kodu çekmecesi ile teslimat bölgeleri sayfasının ortak gövdesi: ülke, kod, öneriler ve canlı cevap (native ikiziyle aynı). */
interface PostalCodeFieldsProps {
  locale: Locale;
  draft: ReturnType<typeof usePostalCodeDraft>;
  /** Yer adıyla cevap notu arasına giren satır (çekmecede girişliye "yalnız gezinme" uyarısı). */
  aside?: ReactNode;
}

export function PostalCodeFields({ locale, draft, aside }: PostalCodeFieldsProps) {
  const copy = placeCopy[locale].zip;
  const { answer } = draft;
  const placeName = answer?.kind === 'resolved' ? answer.place.placeName : null;
  const inRoute = answer?.kind === 'resolved' && answer.place.inRoute;
  const note = answer === null ? null : copy[`${placeAnswerNote(answer)}Note`];

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
      {aside}
      {note && <p className={`font-sans text-field-label leading-[1.6] font-semibold ${inRoute ? 'text-olive-dark' : 'text-ink'}`}>{note}</p>}
    </>
  );
}
