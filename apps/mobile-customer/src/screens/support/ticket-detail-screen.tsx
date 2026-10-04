import { brand } from '@lezzet/brand';
import { MESSAGE_STAMP_VISIBLE_MS, awaitsOurReply, formatPrice, messageStamp, ticketScope, ticketTitle } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
// `ScrollView` yalnız tip: kaydırıcıyı `ChatLayout` çiziyor, ekran ona yalnız ref veriyor.
import { Image, Pressable, Text, View, type ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
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
import { markViewing } from '@lezzet/mobile-kit/src/lib/push/viewing-target';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { formatOrderDate } from '@/screens/orders/order-format';
import { TicketDetailSkeleton } from './ticket-detail-skeleton';
import { TicketStatusTag } from './ticket-status-tag';
import messages from '@lezzet/i18n/customer/support';
import { useTicket } from './use-ticket.hook';
import { TicketPhotoThumb } from './ticket-photo-thumb';
import { useTicketPhotos, type TicketPhotoFailure } from './use-ticket-photos.hook';

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
  // Yazışma öndeyken bu talebin bildirimi gösterilmez, cevap ekrana zille zaten düşer.
  useFocusEffect(useCallback(() => markViewing('ticket', id), [id]));
  const [draft, setDraft] = useState('');
  const [photoError, setPhotoError] = useState<TicketPhotoFailure | null>(null);
  const photos = useTicketPhotos({ ticketId: id, onFailed: setPhotoError });
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
    setPhotoError(null);
    const keys = photos.photos.map((photo) => photo.key);
    void ticket.send(draft, keys).then((sent) => {
      if (!sent) return;
      setDraft('');
      photos.reset();
      toastSuccess(t.detail.reply.sent);
    });
  };

  const pickPhoto = () => {
    // Yeni bir deneme eski reddi düşürür: kapanmış bir kapının uyarısı ekranda durmaz.
    setPhotoError(null);
    void photos.pick('camera');
  };

  // Yükleme sürerken Gönder kilitli, ki yarım fotoğraf mesaja girmesin.
  const canSend = draft.trim().length > 0 && !ticket.sending && photos.pending.length === 0;
  const last = detail.messages.at(-1);

  /** Altta sabit yazma çubuğu: kaydırma alanının dışında ama akışta; gerekçesi `composer` stilinde. */
  const composer = (
    <View style={styles.composer}>
      {/* Düşen gönderim SESSİZ DEĞİL: tek satırlık ret, taslak yerinde. */}
      {ticket.sendFailed ? (
        <Text style={styles.sendError} accessibilityRole="alert" testID="ticket-send-failed">
          {t.detail.reply.failed}
        </Text>
      ) : null}
      {photoError === null ? null : (
        <Text style={styles.sendError} testID="ticket-photo-error">
          {photoError === 'cameraDenied' ? t.detail.reply.cameraDenied : t.new.photo.errors[photoError]}
        </Text>
      )}
      {/* Ek, yeni talep çekmecesindeki gibi küçük resimdir ve köşesindeki düğmeyle kalkar; yolda olan yükleme yerinde bekler. */}
      {photos.photos.length + photos.pending.length === 0 ? null : (
        <View style={styles.attachRow} testID="ticket-photos">
          {photos.photos.map((photo, index) => (
            <TicketPhotoThumb
              key={photo.key}
              uri={photo.uri}
              size="sm"
              onRemove={() => photos.remove(photo.key)}
              label={t.detail.photo}
              removeLabel={t.new.photo.remove}
              testID={`ticket-photo-${index}`}
              removeTestID={`ticket-photo-remove-${index}`}
            />
          ))}
          {photos.pending.map((item) => (
            <TicketPhotoThumb
              key={item.id}
              uri={item.uri}
              size="sm"
              label={t.new.photo.uploading}
              removeLabel={t.new.photo.remove}
              testID="ticket-photo-pending"
            />
          ))}
        </View>
      )}
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
            multiline="grow"
            editable={!ticket.sending}
            testID="ticket-reply"
          />
        </View>
        <PressableSurface
          onPress={pickPhoto}
          feedback="scale-small"
          disabled={ticket.sending}
          style={styles.photoButton}
          accessibilityLabel={t.detail.reply.photo}
          testID="ticket-photo"
        >
          <Icon name="camera" size={theme.size.headerIcon} color={theme.colors.muted} />
        </PressableSurface>
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

        {detail.messages.map((message) => (
          <MessageBubble key={message.id} message={message} locale={locale} t={t} />
        ))}

        {/* Çeviri işareti baloncukta değil ekranda, bir kez: yazışmanın iki yönü de çevrildiği için baloncuk başına işaret gürültü
            olur. Hiç çeviri yoksa satır da yok. */}
        {detail.messages.some((message) => message.translated) ? (
          <Text style={styles.notice}>{t.detail.translatedNotice}</Text>
        ) : null}

        {awaitsOurReply(detail.status, last ? last.fromCustomer : null) ? <Text style={styles.notice}>{t.detail.notice}</Text> : null}
      </ChatLayout>
    </View>
  );
}

interface MessageBubbleProps {
  message: TicketMessage;
  locale: Locale;
  t: Messages;
}

function MessageBubble({ message, locale, t }: MessageBubbleProps) {
  // Ekip etiketi marka adıdır ve çevrilmez; tek kaynağı `@lezzet/brand`.
  const who = message.fromCustomer ? t.detail.fromCustomer : brand.name;
  const stamp = messageStamp(message.createdAt, locale, t.today);
  const stampOpacity = useSharedValue(0);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value }));

  // Saat yalnız dokununca görünür, çünkü kalıcı damga tek satırlık mesajda yazının kendisinden çok yer tutar.
  const revealStamp = () => {
    stampOpacity.value = withSequence(withTiming(1), withDelay(MESSAGE_STAMP_VISIBLE_MS, withTiming(0)));
  };

  return (
    <View
      style={[styles.bubbleRow, message.fromCustomer ? styles.mineRow : styles.theirsRow]}
      accessible
      accessibilityLabel={`${who}: ${message.body}, ${stamp}`}
      testID={`ticket-message-${message.id}`}
    >
      <View style={[styles.bubbleColumn, message.fromCustomer ? styles.mineColumn : styles.theirsColumn]}>
        {/* Dokunuş bir eylem değil, saati gösterir; ekran okuyucu saati satırın etiketinden duyduğu için yüzey ona kapalı. */}
        <Pressable
          onPress={revealStamp}
          accessible={false}
          style={[styles.bubble, message.fromCustomer ? styles.mine : styles.theirs]}
          testID={`ticket-bubble-${message.id}`}
        >
          {message.fromCustomer ? null : <Text style={styles.sender}>{brand.name}</Text>}
          {/* Gövde sohbet metni: işletmenin cevabı biçimlendirme işaretleriyle yazılır ve müşteri onu operasyonun gördüğü gibi görmeli. */}
          <ChatText style={[styles.bubbleText, message.fromCustomer ? styles.mineText : styles.theirsText]}>{message.body}</ChatText>
        </Pressable>

        <Animated.View
          pointerEvents="none"
          style={[styles.stamp, message.fromCustomer ? styles.stampMine : styles.stampTheirs, stampStyle]}
        >
          <Text style={styles.stampText}>{stamp}</Text>
        </Animated.View>

        {message.photos.length === 0 ? null : (
          <View style={styles.photoRow}>
            {message.photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photo} accessibilityLabel={t.detail.photo} accessibilityIgnoresInvertColors />
            ))}
          </View>
        )}
      </View>
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
    gap: theme.space.xs,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['sand-200'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    overflow: 'hidden',
  },
  mine: { backgroundColor: theme.colors.olive },
  theirs: { backgroundColor: 'transparent' },
  sender: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.micro,
    color: theme.colors.olive,
  },
  bubbleText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
  },
  mineText: { color: theme.colors.card },
  theirsText: { color: theme.colors.ink },
  /* Saat etiketi balonun üst kenarına ortadan oturur ve konumu mutlak olduğu için satırları oynatmaz. Yüksekliği satır, dolgu ve
     çerçeveden hesaplanır, çünkü sıfır yükseklikli kapla ortalamak yazıyı da sıfır yüksekliğe ölçtürür. */
  stamp: {
    position: 'absolute',
    top: -(theme.text.micro * theme.text['h1--line-height'] + 2 * theme.space['2xs'] + 2 * theme.border.hairline) / 2,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['sand-200'],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space['2xs'],
  },
  stampMine: { right: theme.space.xl },
  stampTheirs: { left: theme.space.xl },
  stampText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['h1--line-height'],
    color: theme.colors['sand-600'],
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
  // Alan uzayınca gönder düğmesi başparmağın yerinde, dipte kalır.
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.md,
  },
  composerField: { flex: 1 },
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  // Gönder düğmesiyle aynı dip hizası; dokunma hedefi tam ölçüde, çünkü ikon küçük.
  photoButton: {
    width: theme.size.touchTarget,
    height: theme.size.touchTarget,
    marginBottom: (theme.size.controlMd - theme.size.touchTarget) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    // Satır dibe hizalı; tek satırda düğme alanın ortasında kalsın.
    marginBottom: (theme.size.controlMd - theme.size.controlSm) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendEnabled: { backgroundColor: theme.colors.olive },
  /* Boş mesaj gönderilemez ve düğme bunu basılmadan önce söyler. Gönderim sürerken de kapalıdır, ki aynı mesaj iki kez gitmesin. */
  sendDisabled: { backgroundColor: theme.colors['disabled-fill'] },
}));
