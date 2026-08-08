import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { deviceLocale } from '@/lib/i18n/locale';
import { ticketsFixture, type TicketView } from './support-fixture';
import { TicketStatusTag } from './ticket-status-tag';
import messages from './messages.json';

/*
  TALEPLERİM (v3 `vTalepler`) — başlık çubuğu + "＋ Yeni", talep kartları ve boş durum.

  ── UI-ONLY (21.14 ikinci dilim) ────────────────────────────────────────────
  Talep ucu YOK; liste fixture'dan geliyor. İskelet ve ağ hatası ÇİZİLMEDİ (şablonda ağ hatası
  var): ikisi de bir AĞ olduğunu varsayar ve bu ekranda ağ yok — bugün çizilseler hiçbir koşulda
  görünmeyen ölü kod olurlardı (siparişler ekranının aynı gerekçesi).

  ── ŞABLONDAN SAPMA ────────────────────────────────────────────────────────
  Kartın satır düzeni şablonun kendisi (tür · kapsam · tarih · rozet · ›). Şablon kartın METNİNİ
  yığından okunan Türkçe sabitlerle yazıyor; burada tür ve durum ŞEMA ANAHTARINDAN çözülüp
  sayfanın sözlüğünden okunuyor — üç dilli yüzeyde metin veriye gömülemez.
*/

type Messages = LocalizedCopy<typeof messages>;

interface TicketsScreenProps {
  tickets?: TicketView[];
}

export function TicketsScreen({ tickets = ticketsFixture() }: TicketsScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const bar = (
    <AppBar
      title={t.list.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="tickets-back" />}
      right={
        <TextAction
          label={t.list.new}
          onPress={() => router.push('/support/new')}
          accessibilityHint={t.list.newLabel}
          testID="tickets-new"
        />
      }
      testID="tickets-appbar"
    />
  );

  if (tickets.length === 0) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="whatsapp" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.list.empty.title}
          description={t.list.empty.body}
          action={
            <PrimaryButton
              label={t.list.empty.cta}
              shape="pill"
              onPress={() => router.push('/support/new')}
              testID="tickets-empty-cta"
            />
          }
          testID="tickets-empty"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="tickets-list">
        {tickets.map((ticket) => {
          const scope =
            ticket.orderReference === null
              ? t.list.generalScope
              : t.list.orderScope.replace('{reference}', ticket.orderReference);

          return (
            <PressableSurface
              key={ticket.id}
              onPress={() => router.push({ pathname: '/support/[ticket]', params: { ticket: ticket.id } })}
              feedback="opacity"
              style={styles.card}
              accessibilityLabel={t.list.open.replace('{type}', t.type[ticket.type])}
              testID={`ticket-${ticket.id}`}
            >
              <View style={styles.cardText}>
                <Text style={styles.type}>{t.type[ticket.type]}</Text>
                <Text style={styles.meta}>
                  {t.list.meta.replace('{scope}', scope).replace('{date}', ticket.createdAtLabel)}
                </Text>
              </View>
              <TicketStatusTag status={ticket.status} label={t.status[ticket.status]} testID={`ticket-${ticket.id}-status`} />
              {/* İşaret METİNDİR (kitteki `NavRow` ile aynı): satırın kendisi zaten düğme. */}
              <View style={styles.chevronBox}>
                <Text style={styles.chevron}>›</Text>
              </View>
            </PressableSurface>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  cardText: { flex: 1, gap: theme.space['2xs'] },
  type: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  chevronBox: { justifyContent: 'center' },
  chevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['sand-600'],
  },
}));
