import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { placeAnswerNote } from '@lezzet/domain-core';
import messages from '@lezzet/i18n/customer/place';

import { Skeleton } from '@/components/ui/skeleton';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { CountryChips } from './country-chips';
import type { PostalCodeDraft } from './use-postal-code-draft.hook';

/** Posta kodu çekmecesi ile teslimat bölgeleri sayfasının ortak gövdesi: ülke, kod, öneriler ve canlı cevap. */
interface PostalCodeFieldsProps {
  form: PostalCodeDraft;
  /** Yer adıyla cevap notu arasına giren satır (çekmecede girişliye "yalnız gezinme" uyarısı). */
  aside?: ReactNode;
  /** Alt öğelerin test kimlikleri bundan türer. */
  testID?: string;
}

export function PostalCodeFields({ form, aside, testID }: PostalCodeFieldsProps) {
  const copy = messages[useAppLocale()].zip;
  /* İskelet çubuklarının boyu metin kademesinden okunur ki yazı boyutu büyütülünce bekleyiş de cevapla birlikte büyüsün. */
  const { theme } = useUnistyles();
  const { place } = form;
  const inRoute = place?.kind === 'resolved' && place.place.inRoute;
  const placeName = place?.kind === 'resolved' ? place.place.placeName : null;
  const note = place === null ? null : copy[`${placeAnswerNote(place)}Note`];
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  return (
    <>
      <CountryChips value={form.country} onChange={form.setCountry} testIDPrefix={`${testID ?? 'zip'}-country`} />
      <TextField
        value={form.draft}
        onChangeText={form.type}
        accessibilityLabel={copy.field}
        placeholder={copy.placeholder}
        content="postalCode"
        numeric
        testID={idOf('field')}
      />
      {/* Künye satırı yok: veri kendi referansımız, Etalab yükümlülüğü yalnız BAN listesinindir. */}
      {!form.suggestOpen ? null : (
        <SuggestionList items={form.suggestions} onSelect={form.pick} accessibilityLabel={copy.suggestLabel} testID={idOf('suggestions')} />
      )}
      {/* İskelet cevabın şeklini taklit eder ki cevap gelince gövde yeniden düzenlenmesin. */}
      {form.pending ? (
        <View style={styles.skeleton} testID={idOf('skeleton')}>
          <Skeleton width={140} height={theme.text.control} radius="badge" />
          <Skeleton width="100%" height={theme.text.note} radius="badge" tone="soft" />
        </View>
      ) : null}
      {placeName === null ? null : (
        <Text style={styles.place} testID={idOf('place')}>
          {form.draft} · {placeName}
        </Text>
      )}
      {aside}
      {note === null ? null : (
        <Text style={[styles.note, inRoute ? styles.noteInside : styles.noteShipping]} testID={idOf('note')}>
          {note}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  place: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  skeleton: { gap: theme.space.xs },
  note: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    lineHeight: theme.text['field-label'] * theme.text['lead--line-height'],
  },
  /** Rota içi: olumlu cevap zeytin tonunda. */
  noteInside: { color: theme.colors['olive-dark'] },
  /** Öteki hâller gövde renginde, çünkü soluk ton kum zeminde okunma eşiğinin altında kalır. */
  noteShipping: { color: theme.colors.ink },
}));
