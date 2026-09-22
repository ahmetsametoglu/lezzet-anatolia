import { brand } from '@lezzet/brand';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { MeLinkedChannel } from '@lezzet/types';
import { Linking, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { formatOrderDate } from '@/screens/orders/order-format';
// Yalnız metin bloğunun tipi için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from '@lezzet/i18n/customer/account';

type ChannelsCopy = LocalizedCopy<typeof accountMessages>['channels'];
type Source = MeLinkedChannel['source'];

const CHAT_URL: Partial<Record<Source, string | null>> = {
  messenger: brand.contact.messengerUrl,
  instagram: brand.contact.instagramUrl,
};

interface ChannelsCardProps {
  /** `null` okunamadı ya da okunuyor; bilinmeyen bağ "bağlı değil" diye gösterilmez. */
  channels: MeLinkedChannel[] | null;
  copy: ChannelsCopy;
  locale: Locale;
  /** Kodu hazırlanan kanal; öteki satırlar beklemez. */
  busy: Source | null;
  failed: boolean;
  /** Mesajı kopyalanmış, bağı henüz kurulmamış kanal; satırın altında adımlar açılır. */
  copiedSource: Source | null;
  onLink: (source: Source) => void;
  onCopyAgain: () => void;
}

/** Bağlı kanallar: satırlar salt okunur, çünkü bağı çözmek bir birleştirme kararıdır ve insana aittir. */
export function ChannelsCard({ channels, copy, locale, busy, failed, copiedSource, onLink, onCopyAgain }: ChannelsCardProps) {
  return (
    <View style={styles.card} testID="account-channels">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      {(channels ?? []).map((channel) => {
        const status = !channel.linked
          ? copy.notLinked
          : channel.since === null
            ? copy.linked
            : copy.since.replace('{date}', formatOrderDate(channel.since, locale));
        const name = copy.source[channel.source];
        const hazir = busy === channel.source;
        const copied = copiedSource === channel.source;
        const chatUrl = CHAT_URL[channel.source] ?? null;

        return (
          <View key={channel.source} style={styles.row} testID={`account-channel-${channel.source}`}>
            <View style={styles.line}>
              <View style={styles.text}>
                <Text style={styles.name}>{name}</Text>
                <Text style={channel.linked ? styles.linked : styles.muted}>{status}</Text>
                {channel.numbers.map((number) => (
                  <Text key={number} style={styles.number}>
                    {number}
                  </Text>
                ))}
                {channel.source === 'whatsapp' && channel.linked ? (
                  <TextAction
                    label={hazir ? copy.busy : copy.relink}
                    onPress={() => onLink('whatsapp')}
                    disabled={busy !== null}
                    testID="account-whatsapp-relink"
                  />
                ) : null}
              </View>
              {!channel.linked && !copied ? (
                <SecondaryButton
                  label={hazir ? copy.busy : copy.cta}
                  onPress={() => onLink(channel.source)}
                  disabled={busy !== null}
                  tone="olive"
                  shape="pill"
                  testID={`account-channel-${channel.source}-link`}
                />
              ) : null}
            </View>
            {copied && !channel.linked ? (
              <Note
                description={copy.copied.replace('{channel}', name)}
                tone="olive"
                testID={`account-channel-${channel.source}-steps`}
                action={
                  <View style={styles.actions}>
                    <TextAction label={copy.copyAgain} onPress={onCopyAgain} testID={`account-channel-${channel.source}-copy`} />
                    {chatUrl === null ? null : (
                      <TextAction label={copy.open.replace('{channel}', name)} onPress={() => void Linking.openURL(chatUrl)} />
                    )}
                  </View>
                }
              />
            ) : null}
          </View>
        );
      })}

      {failed ? <Note description={copy.failed} tone="terracotta" testID="account-whatsapp-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  title: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Satırlar kart içinde kesikli çizgiyle ayrılır, hesap ekranının öteki kartları gibi. */
  row: {
    gap: theme.space.md,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
    marginTop: theme.space.xs,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.space.lg },
  text: { flex: 1, gap: theme.space['2xs'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.lg },
  name: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  linked: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors['olive-dark'],
  },
  muted: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  number: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
}));
