import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import { ticketById, type TicketMessageView, type TicketView } from './support-fixture';
import { TicketStatusTag } from './ticket-status-tag';
import messages from './messages.json';

/*
  TALEP DETAYI (v3 `vTalepD`) — yazışma görünümü: sonuç bloğu, baloncuklar, bilgi satırı ve
  yapışkan mesaj kutusu.

  ── UI-ONLY (21.14 ikinci dilim) ────────────────────────────────────────────
  Talep ucu YOK; talep fixture'dan numarayla okunuyor ve yazılan mesaj EKRANIN durumunda yaşıyor
  (gerçekten görünür, yalnız kalıcı değil). BULUNAMAYAN numara sessiz değil: boş bir yazışma
  yerine "bulamadık" bloğu çıkar ve listeye götürür (sipariş detayının aynı kuralı).

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Başlığın ikinci satırı çubuğun ALTINDA.** Şablon başlık çubuğuna iki satır koyuyor (tür +
     "Sipariş … · tarih"); kitin `AppBar`ı TEK satır başlık taşır ve çubuğu değiştirmek bu görevin
     yazma alanı dışında (kit ihtiyacı rapor edildi). İkinci satır içeriğin ilk satırı olarak
     yazıldı — bilgi kaybı yok, yeri bir kademe aşağıda.
  2. **Yeniden açılan talebin durumu `open`.** Şablon çözülmüş bir talebe mesaj yazılınca durumu
     "Yeniden açıldı" yapıyor; şemada böyle bir durak YOK ve olması da gerekmiyor — `TicketStatus`
     künyesi bunu açıkça yazıyor ("Çözülen talep müşteri dönerse yeniden açılır: resolved → open").
     Dördüncü bir durak uydurmak, ekranı şemanın bilmediği bir gerçeğin kaynağı yapardı.
  3. **Gönderim onayı toast DEĞİL.** Şablon "Mesajınız iletildi" toast'ı basıyor; toast küresel bir
     kabuk katmanıdır (vitrin ekranının kendi künyesindeki karar). Onay burada mesajın yazışmada
     BELİRMESİDİR — toast'tan daha kesin bir kanıt.

  BALONCUĞUN KİMLİĞİ EKRAN OKUYUCUYA DA GİDER: hizalama ve renk "kim yazdı"yı yalnız GÖRENE
  söyler; her baloncuk `Siz:` / `Lezzet Anatolia:` önekiyle tek parça okunur.
*/

type Messages = LocalizedCopy<typeof messages>;

interface TicketDetailScreenProps {
  /** Müşteriye görünen talep numarası (`T-108`). */
  id: string;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse fixture'dan numarayla okunur. */
  ticket?: TicketView | null;
}

export function TicketDetailScreen({ id, ticket = ticketById(id) }: TicketDetailScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  /* Yazışma ve durum ekranın durumunda: fixture yalnız başlangıç değeri (UI-only etap). */
  const [thread, setThread] = useState<TicketMessageView[]>(ticket?.messages ?? []);
  const [status, setStatus] = useState(ticket?.status ?? 'open');
  const [draft, setDraft] = useState('');

  if (ticket === null) {
    return (
      <View style={styles.screen}>
        <AppBar
          title={id}
          left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="ticket-back" />}
        />
        <EmptyState
          icon={<Icon name="whatsapp" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.detail.notFound}
          description={t.detail.notFoundBody}
          action={
            <PrimaryButton
              label={t.detail.notFoundCta}
              shape="pill"
              onPress={() => router.push('/support')}
              testID="ticket-not-found-cta"
            />
          }
          testID="ticket-not-found"
        />
      </View>
    );
  }

  const send = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    setThread([...thread, { id: `local-${thread.length + 1}`, fromCustomer: true, body }]);
    // Çözülmüş talebe yazmak onu yeniden açar (şemanın kendi hükmü: `resolved → open`).
    if (status === 'resolved') setStatus('open');
    setDraft('');
  };

  const scope =
    ticket.orderReference === null
      ? t.detail.generalScope
      : t.list.orderScope.replace('{reference}', ticket.orderReference);

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.type[ticket.type]}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="ticket-back" />}
        right={<TicketStatusTag status={status} label={t.status[status]} testID="ticket-status" />}
        testID="ticket-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="ticket-thread">
        <Text style={styles.meta} testID="ticket-meta">
          {t.list.meta.replace('{scope}', scope).replace('{date}', ticket.createdAtLabel)}
        </Text>

        {ticket.resolutionLabel === null ? null : (
          <Note
            description={t.detail.resolution.replace('{value}', ticket.resolutionLabel)}
            tone="olive"
            testID="ticket-resolution"
          />
        )}

        {thread.map((message) => (
          <View
            key={message.id}
            style={[styles.bubbleRow, message.fromCustomer ? styles.mineRow : styles.theirsRow]}
            accessible
            accessibilityLabel={`${message.fromCustomer ? t.detail.fromCustomer : t.detail.fromTeam}: ${message.body}`}
            testID={`ticket-message-${message.id}`}
          >
            <Text style={[styles.bubble, message.fromCustomer ? styles.mine : styles.theirs]}>{message.body}</Text>
          </View>
        ))}

        <Text style={styles.notice}>{t.detail.notice}</Text>
      </ScrollView>

      {/* Yapışkan kutu kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kalıbı). */}
      <View style={styles.composer}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={t.detail.reply.label}
          placeholder={t.detail.reply.placeholder}
          shape="pill"
          testID="ticket-reply"
        />
        <PressableSurface
          onPress={send}
          feedback="scale-small"
          disabled={draft.trim().length === 0}
          style={[styles.sendButton, draft.trim().length === 0 ? styles.sendDisabled : styles.sendEnabled]}
          accessibilityLabel={t.detail.reply.send}
          testID="ticket-send"
        >
          <Icon name="navigate" size={theme.size.inlineIcon} color={theme.colors.card} />
        </PressableSurface>
      </View>
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
    // Yapışkan kutunun altında kalan alan: kutu yüksekliği + cihazın alt güvenli alanı.
    paddingBottom: rt.insets.bottom + theme.space['9xl'],
    gap: theme.space.lg,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirsRow: { justifyContent: 'flex-start' },
  bubble: {
    // Şablonun kendi sınırı: baloncuk satırın %78'inden geniş olmaz.
    maxWidth: '78%',
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['sand-200'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    // Köşe yarıçapının metnin kendi kutusunda kırpılması için (RN metin arka planı).
    overflow: 'hidden',
  },
  mine: {
    backgroundColor: theme.colors.olive,
    color: theme.colors.card,
  },
  theirs: {
    backgroundColor: 'transparent',
    color: theme.colors.ink,
  },
  notice: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },

  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['2xl'],
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
    backgroundColor: theme.colors['sand-50'],
  },
  sendButton: {
    width: theme.size.controlSm,
    height: theme.size.controlSm,
    borderRadius: theme.size.controlSm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendEnabled: { backgroundColor: theme.colors.olive },
  /* Boş mesaj gönderilemez ve düğme bunu BASILMADAN ÖNCE söyler (şablon sessizce hiçbir şey
     yapmıyordu — engelli düğme kuralı basmadan anlatır). */
  sendDisabled: { backgroundColor: theme.colors['disabled-fill'] },
}));
