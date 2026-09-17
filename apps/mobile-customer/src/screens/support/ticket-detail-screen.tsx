import { brand } from '@lezzet/brand';
import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
// `ScrollView` yalnız tip: kaydırıcıyı `ChatLayout` çiziyor, ekran ona yalnız ref veriyor.
import { Image, Text, View, type ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { ChatLayout } from '@lezzet/mobile-kit/src/components/ui/chat-layout';
import { ChatText } from '@lezzet/mobile-kit/src/components/ui/chat-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import type { TicketMessage } from '@/lib/api/tickets';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { formatOrderDate } from '@/screens/orders/order-format';
import { ticketScope, ticketTitle } from './ticket-format';
import { TicketDetailSkeleton } from './ticket-detail-skeleton';
import { TicketStatusTag } from './ticket-status-tag';
import messages from '@lezzet/i18n/customer/support';
import { useTicket } from './use-ticket.hook';

/*
  Talep detayı: gönderimin sonucu sunucudan gelir, ekran iyimser mesaj uydurmaz ve düşen gönderim taslağı silmez. Her baloncuk
  ekran okuyucuya "Siz:" ya da marka adı önekiyle tek parça okunur, çünkü hizalama ve renk yazanı yalnız görene söyler.
*/

type Messages = LocalizedCopy<typeof messages>;

interface TicketDetailScreenProps {
  /** Talebin kimliği — rota parametresi (`/support/<uuid>`). */
  id: string;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function TicketDetailScreen({ id, locale: forcedLocale }: TicketDetailScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const ticket = useTicket(id, locale);
  const [draft, setDraft] = useState('');
  const threadRef = useRef<ScrollView>(null);

  /* Başlık her hâlde durur (şablonda da yüklenen sayfanın üstünde): geri yolu ekran boşken de açık. */
  const appBar = (title: string, right?: React.ReactNode) => (
    <AppBar
      title={title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="ticket-back" />}
      right={right}
      testID="ticket-appbar"
    />
  );

  /* İlk yükte başlık gerçek kalır ki geri yolu açık olsun; sayfanın geri kalanının yerini iskelet tutar. */
  if (ticket.status === 'loading') {
    return (
      <View style={styles.screen}>
        {appBar(t.list.title)}
        <TicketDetailSkeleton testID="ticket-loading" />
      </View>
    );
  }

  if (ticket.status !== 'ready' || ticket.detail === null) {
    /* Üç ayrı hâl, üç ayrı cümle: misafir bir kapıdır (giriş), 404 eski bir bağlantıdır (listeye
       dön), hata bir arızadır (tekrar dene). Tek "hata"ya indirmek üçünü de yanlış anlatırdı. */
    const guest = ticket.status === 'guest';
    const missing = ticket.status === 'missing';
    return (
      <View style={styles.screen}>
        {appBar(t.list.title)}
        <EmptyState
          icon={
            <Icon
              name={missing || guest ? 'whatsapp' : 'connection-off'}
              size={missing || guest ? theme.size.emptyIcon : theme.size.errorIcon}
              color={theme.colors['sand-600']}
            />
          }
          title={guest ? t.guest.title : missing ? t.detail.notFound : t.error.title}
          description={guest ? t.guest.body : missing ? t.detail.notFoundBody : t.error.body}
          action={
            <PrimaryButton
              label={guest ? t.guest.cta : missing ? t.detail.notFoundCta : t.error.retry}
              shape="pill"
              onPress={guest ? () => router.push('/login') : missing ? () => router.push('/support') : ticket.retry}
              testID="ticket-error-action"
            />
          }
          testID={guest ? 'ticket-guest' : missing ? 'ticket-not-found' : 'ticket-error'}
        />
      </View>
    );
  }

  const detail = ticket.detail;
  const scope = ticketScope(detail.orderReference, t.list.orderScope, t.detail.generalScope);
  const title = ticketTitle(t.type[detail.type], detail.subject, t.list.withSubject);
  // İade ancak ödenmişse söylenir: tetiklenmiş ama ödenmemiş iade gerçek bir ara hâldir.
  const refunded = detail.returnOutcome !== null && detail.returnOutcome.refundedCents > 0
    ? formatPrice(detail.returnOutcome.refundedCents, locale)
    : null;

  const send = () => {
    void ticket.send(draft).then((sent) => {
      if (!sent) return;
      setDraft('');
      toastSuccess(t.detail.reply.sent);
    });
  };

  const canSend = draft.trim().length > 0 && !ticket.sending;

  const renderMessage = (message: TicketMessage) => {
    // Ekip etiketi marka adıdır ve çevrilmez; tek kaynağı `@lezzet/brand`.
    const who = message.fromCustomer ? t.detail.fromCustomer : brand.name;

    return (
      <View
        key={message.id}
        style={[styles.bubbleRow, message.fromCustomer ? styles.mineRow : styles.theirsRow]}
        accessible
        accessibilityLabel={`${who}: ${message.body}`}
        testID={`ticket-message-${message.id}`}
      >
        <View style={[styles.bubbleColumn, message.fromCustomer ? styles.mineColumn : styles.theirsColumn]}>
          {/* Gövde sohbet metni: işletmenin cevabı biçimlendirme işaretleriyle yazılır ve müşteri onu operasyonun gördüğü gibi görmeli. */}
          <ChatText style={[styles.bubble, message.fromCustomer ? styles.mine : styles.theirs]}>
            {message.body}
          </ChatText>

          {message.photos.length === 0 ? null : (
            <View style={styles.photoRow}>
              {message.photos.map((uri) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={styles.photo}
                  accessibilityLabel={t.detail.photo}
                  accessibilityIgnoresInvertColors
                />
              ))}
            </View>
          )}

        </View>
      </View>
    );
  };

  /** Altta sabit yazma çubuğu: kaydırma alanının dışında ama akışta; gerekçesi `composer` stilinde. */
  const composer = (
    <View style={styles.composer}>
      {/* Düşen gönderim SESSİZ DEĞİL: tek satırlık ret, taslak yerinde. */}
      {ticket.sendFailed ? (
        <Text style={styles.sendError} accessibilityRole="alert" testID="ticket-send-failed">
          {t.detail.reply.failed}
        </Text>
      ) : null}
      <View style={styles.composerRow}>
        {/* Alanın kendi kökü esnemez (kit `TextField` bir `View` döndürüyor ve `flex` taşımıyor);
            genişliği saran kutu verir — örtük esnemeye güvenilmez, kural açık yazılır. */}
        <View style={styles.composerField}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            accessibilityLabel={t.detail.reply.label}
            placeholder={t.detail.reply.placeholder}
            shape="pill"
            editable={!ticket.sending}
            testID="ticket-reply"
          />
        </View>
        <PressableSurface
          onPress={send}
          feedback="scale-small"
          disabled={!canSend}
          style={[styles.sendButton, canSend ? styles.sendEnabled : styles.sendDisabled]}
          accessibilityLabel={ticket.sending ? t.detail.reply.sending : t.detail.reply.send}
          testID="ticket-send"
        >
          <Icon name="navigate" size={theme.size.inlineIcon} color={theme.colors.card} />
        </PressableSurface>
      </View>
    </View>
  );

  return (
    /* Klavye kaçınması kitin yazışma kabında (`ChatLayout`); başlık çubuğu kabın dışında, çünkü içeride dururken iOS'ta kaçınma
       olmaz. */
    <View style={styles.screen}>
      {appBar(title, <TicketStatusTag status={detail.status} label={t.status[detail.status]} testID="ticket-status" />)}
      {/* En yeni mesaj en altta ve kaydırıcı her içerik değişiminde sona kayar, böylece en yeni cevap ve müşterinin kendi baloncuğu
          ekranda kalır. */}
      {/* Elle yenileme yok: Android'de kaydırıcı liste sonunda taşma üretmediği için çekerek yenileme çalışmaz; canlı zil yazışmayı
          zaten tazeliyor. */}
      <ChatLayout
        composer={composer}
        scrollRef={threadRef}
        onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.content}
        testID="ticket-thread"
      >
        <Text style={styles.meta} testID="ticket-meta">
          {/* Liste kartıyla AYNI biçim (yıllı kısa tarih): iki ekran aynı talebi aynı künyeyle anar. */}
          {`${scope} · ${formatOrderDate(detail.createdAt, locale)}`}
        </Text>

        {refunded === null ? null : (
          <Note
            description={t.detail.resolution.replace('{value}', t.detail.refunded.replace('{amount}', refunded))}
            tone="olive"
            testID="ticket-resolution"
          />
        )}

        {detail.messages.map(renderMessage)}

        {/* Çeviri işareti baloncukta değil ekranda, bir kez: yazışmanın iki yönü de çevrildiği için baloncuk başına işaret gürültü
            olur. Hiç çeviri yoksa satır da yok. */}
        {detail.messages.some((message) => message.translated) ? (
          <Text style={styles.notice}>{t.detail.translatedNotice}</Text>
        ) : null}

        <Text style={styles.notice}>{t.detail.notice}</Text>
      </ChatLayout>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    /* Alt güvenli alan kökte, çünkü yazma çubuğunun üstünde olsaydı klavye açılırken iki ayrı animasyon doğardı. Pay güvenli alanın
       tamamı değil, ana ekran çizgisi açıkta kalacak kadar: bu ekranda çubuğun üstünde kaydırma hareketi yok. */
    paddingBottom: Math.min(rt.insets.bottom, theme.space['3xl']),
  },
  /* Kaçınma kabının ve kaydırıcının ölçüleri BURADA DEĞİL: ikisi de `ChatLayout`ın kuralı
     (`chat-layout.tsx` künyesi). Ekran yalnız yazışmanın kendi dolgusunu söylüyor. */
  content: {
    /* Yazışmada yatay dolgu daha dar: metin baloncuğun kendi dolgusuyla ikinci kez daralıyor. */
    paddingHorizontal: theme.space['3xl'],
    paddingVertical: theme.space['4xl'],
    /* Çubuğun altında ayrılmış alan yok: çubuk akışta, kendi yerini kendisi kaplıyor. */
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
  /* Baloncuk tavanı %88: kaldırılmaz, çünkü kimin yazdığını karşılıklı hizadaki boşluk söyler; daha dar tavan uzun cevabı gereksiz
     satırlara böler. */
  bubbleColumn: { maxWidth: '88%', gap: theme.space.sm },
  mineColumn: { alignItems: 'flex-end' },
  theirsColumn: { alignItems: 'flex-start' },
  bubble: {
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
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  photo: {
    // Tasarımda ek fotoğraf yok; kitin küçük daire durağı ölçü olarak alındı (yeni sayı açılmadı).
    width: theme.size.circleSm,
    height: theme.size.circleSm,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors['sand-250'],
  },
  notice: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },

  /* Çubuk akışta durur: mutlak konumlu çocuk kabın alt kenarına asılı kalır ve iOS'ta klavye dolgusu eklenince klavyenin altında
     kalır. */
  composer: {
    gap: theme.space.sm,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    /* Kutunun kendi dolgusu simetrik; güvenli alan ekranın kökünde. */
    paddingBottom: theme.space.lg,
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
    backgroundColor: theme.colors['sand-50'],
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  composerField: { flex: 1 },
  /* Gönderim hatası ipucu satırlarından büyük (`note`), çünkü müşteriden bir şey istiyor; yazma alanından büyük değil ki bağırmasın. */
  sendError: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.error,
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
     yapmıyordu — engelli düğme kuralı basmadan anlatır). Gönderim sürerken de kapalıdır: aynı
     mesaj iki kez gitmez. */
  sendDisabled: { backgroundColor: theme.colors['disabled-fill'] },
}));
