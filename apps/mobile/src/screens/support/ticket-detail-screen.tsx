import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextField } from '@/components/ui/text-field';
import type { TicketMessage } from '@/lib/api/tickets';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { toastSuccess } from '@/lib/toast/toast-store';
import { formatOrderDate } from '@/screens/orders/order-format';
import { ticketScope, ticketTitle } from './ticket-format';
import { TicketDetailSkeleton } from './ticket-detail-skeleton';
import { TicketStatusTag } from './ticket-status-tag';
import messages from './messages.json';
import { useTicket } from './use-ticket.hook';

/*
  TALEP DETAYI (v3 `vTalepD`) — GERÇEK UÇTAN okur (`GET /api/v1/me/tickets/:id`) ve cevap GERÇEK
  UCA gider (`POST …/messages`): sonuç bloğu, baloncuklar, bilgi satırı ve yapışkan mesaj kutusu.

  ── GÖNDERİM SONUCU SUNUCUDAN GELİR, EKRANDA UYDURULMAZ ─────────────────────
  Cevap ucu GÜNCEL DETAYI döndürüyor; ekranın yerel "iyimser mesaj" listesi YOK. Kapanmış talebe
  yazmak onu yeniden açar (motorun kararı) ve yeni durum da o cevapla gelir — ekran tahmin etseydi
  bir gün sunucudan ayrışırdı. Düşen gönderim TASLAĞI SİLMEZ (hook künyesi): yazılan şikâyet metni
  kaybolmaz.

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Başlığın ikinci satırı çubuğun ALTINDA.** Şablon başlık çubuğuna iki satır koyuyor; kitin
     `AppBar`ı TEK satır başlık taşır ve çubuğu değiştirmek bu görevin yazma alanı dışında (kit
     ihtiyacı rapor edildi). Bilgi kaybı yok, yeri bir kademe aşağıda.
  2. **Yeniden açılan talebin durumu `open`.** Şablon "Yeniden açıldı" diye dördüncü bir durak
     çiziyor; şemada böyle bir durak YOK (`resolved → open`) ve uydurmak ekranı, şemanın bilmediği
     bir gerçeğin kaynağı yapardı.
  3. **Sonucun tutarı PARA ALANINDAN gelir**, elle yazılmış bir cümleden değil: sözleşme iadeyi
     `triggeredAt` + `refundedCents` olarak taşıyor ve bant yalnız `refundedCents > 0` iken çizilir
     (web bandının aynı ölçütü — "tetiklendi ama ödenmedi" gerçek bir ara hâl, 0 € iade "iade yok"
     demek değildir).
  4. **Çeviri İŞARETLENİR** (şablonda yok): mesaj okuyucunun dilinde geliyor (20.2) ve makine
     çevirisi bir şikâyeti yumuşatabilir — hangi baloncuğun çeviri olduğu söylenmeden gösterilmesi,
     personelin ağzına kurmadığı bir cümleyi koymak olurdu.
  5. **Ekli fotoğraflar çizilir** (şablonda yok): web'den ek gönderen müşteri kendi fotoğrafını
     burada da görmeli; adresler SÜRELİ imzalı (sözleşme künyesi), ekran onları yalnız gösterir.
  6. **Gönderim onayı TOAST** (v3 `tSend` → "Mesajınız iletildi"): önceki UI-only etapta toast
     katmanı yoktu, bugün var — şablonun kendi davranışı geri geldi. Mesajın yazışmada belirmesi
     de sürüyor; toast onu ezmiyor, süreliyor.

  BALONCUĞUN KİMLİĞİ EKRAN OKUYUCUYA DA GİDER: hizalama ve renk "kim yazdı"yı yalnız GÖRENE
  söyler; her baloncuk `Siz:` / `Lezzet Anatolia:` önekiyle tek parça okunur.
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

  /* İLK YÜK: başlık GERÇEK kalır (geri yolu açık), sayfanın geri kalanının yerini skeleton tutar.
     Blok ekrandan `ticket-detail-skeleton`a taşındı: üç ortalanmış çubuk buranın bir SOHBET
     ekranı olduğunu hiç göstermiyordu (o dosyanın künyesi). */
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
    const who = message.fromCustomer ? t.detail.fromCustomer : t.detail.fromTeam;
    const translated = message.translated ? ` (${t.detail.translated})` : '';

    return (
      <View
        key={message.id}
        style={[styles.bubbleRow, message.fromCustomer ? styles.mineRow : styles.theirsRow]}
        accessible
        accessibilityLabel={`${who}${translated}: ${message.body}`}
        testID={`ticket-message-${message.id}`}
      >
        <View style={[styles.bubbleColumn, message.fromCustomer ? styles.mineColumn : styles.theirsColumn]}>
          <Text style={[styles.bubble, message.fromCustomer ? styles.mine : styles.theirs]}>{message.body}</Text>

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

          {message.translated ? <Text style={styles.translated}>{t.detail.translated}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    /*
      KLAVYE KAÇINMASI EKRANIN KÖKÜNDE (kullanıcı bulgusu 16.08, iki cihazda birden).

      Yazma çubuğu klavyenin ALTINDA kalıyordu: müşteri yazdığını göremiyordu. Sebep `FormScroll`
      künyesinde ölçülü ve burada da aynı: Android `Theme.EdgeToEdge` ile açıldığı için pencereyi
      klavye için küçültmüyor, `adjustResize` işlemiyor; boşluğu uygulamanın kendisi tüketmeli.

      `FormScroll` KULLANILMADI ve bu bilinçli: o kap, içeriğin TAMAMINI tek bir kaydırıcıya koyan
      form ekranları için. Burası yazışma — kaydırılan yalnız mesaj listesi, yazma çubuğu ise sabit
      kalmalı. `FormScroll`a sarsaydık çubuk da kaydırma alanına girer ve "yapışkan" olmaktan
      çıkardı. O yüzden aynı KORUMA, farklı KAP: `KeyboardAvoidingView` kökü sarar, liste ile çubuk
      içeride kendi yerlerinde kalır.

      `behavior` platforma göre: iOS klavyeyi bir dolgu gibi iterken (`padding`), Android'de yükseklik
      ayarı doğru sonucu veriyor — kitin `bottom-sheet`i de aynı ayrımı yapıyor.
    */
    <View style={styles.screen}>
      {/* BAŞLIK ÇUBUĞU KAPIN DIŞINDA — kitin çalışan emsalinin birebir yerleşimi (`FormScroll`
          künyesi: *"üstündeki başlık çubuğu kendi yerini alır, kaydırıcı gerisini"*). İçeride
          dururken iOS'ta hiçbir kaçınma olmuyordu (simülatörde kare ile ölçüldü 16.08: çubuk yok,
          liste kısalmamış, dolgu eklenmemiş). Kullanıcının turu emsalin çalıştığını doğruladı —
          adres formu ve çekmeceler iOS'ta sorunsuz — yani kusur kaçınmada değil, bu ekranın
          kabında. Ofset de KALKTI: emsalde yok ve olmayan bir farkı düzeltmeye çalışıyordu. */}
      {appBar(title, <TicketStatusTag status={detail.status} label={t.status[detail.status]} testID="ticket-status" />)}
      <KeyboardAvoidingView style={styles.keyboardLayer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Yazışma eskiden yeniye dizili: SON mesaj en altta. Kaydırma her içerik değişiminde sona
          çekilir — açılışta müşteri en yeni cevabı görür, kendi mesajını gönderince de baloncuğu
          ekranda belirir (onayın kendisi budur; toast yalnız onu süreler). */}
      {/*
        ELLE YENİLEME YOK — ne aşağı ne yukarı çekme (kullanıcı kararı 17.08).

        Yukarı çekip yenileme yazılmıştı (yazışmada en yeni mesaj en altta olduğu için yön
        doğruydu) ama **Android'de çalışamayacağı ölçüldü**: RN'in Android `ScrollView`'ü taşma
        ofseti üretmiyor (`ReactScrollView.java` `overScrollBy`ı ezmiyor, Android'in
        `overscrollDistance`ı fiilen 0), yani `contentOffset` liste sonunda kilitleniyor ve
        ölçülecek bir taşma hiç doğmuyor. Cihazda kanıtlandı: çekişten sonraki altı karenin beşi
        öncekiyle bit bit aynı.

        Yerine platformun izin verdiği bir numara aramak yerine özellik KALDIRILDI: canlı zil
        zaten yazışmayı kendiliğinden tazeliyor, kullanıcı kararı bu yönde — *"sistem çalışıyor,
        gerek yok, kullanıcı en kötü çıkıp yeniden girer."* Ekrandan çıkıp girmek zaten tam bir
        okuma yapıyor.
      */}
      <ScrollView
        ref={threadRef}
        /* LİSTE ESNER, ÇUBUK ESNEMEZ (iOS ölçümü 16.08, simülatörde kare ile).
           Klavye açılınca `KeyboardAvoidingView` kabın altına klavye kadar dolgu koyuyor. Liste
           `flex: 1` almadığı için İÇERİK BOYUNDA kalıyordu, yani kap küçülürken o küçülmüyor ve
           yazma çubuğu ekranın dışına taşıyordu — ölçülen görüntü tam buydu: çubuk "klavyenin
           altında" değil, HİÇ YOKTU; yazışmanın sonuyla klavye arasında dolgu kadar boşluk vardı.
           Kısalması gereken listedir; çubuk sabit yükseklikte kalmalı. */
        style={styles.thread}
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

        <Text style={styles.notice}>{t.detail.notice}</Text>
      </ScrollView>

      {/* Yapışkan kutu kaydırma alanının DIŞINDA (RN'de `position: sticky` yok — kitin kalıbı) ama
          AKIŞTA: kaydırıcı `flex: 1` ile kalanı doldurduğu için kutu zaten en altta oturuyor,
          mutlak konuma gerek yok. Gereksiz de değil, ZARARLIYDI — gerekçesi `composer` künyesinde. */}
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    /*
      ALT GÜVENLİ ALAN KAÇINMA KABININ DIŞINDA — TEK ANİMASYON KALSIN DİYE (kullanıcı bulgusu 17.08).

      Bu dolgu yazma çubuğunun kendi üstündeydi ve klavye açılınca fazlalık yapıyordu: iOS'ta klavye
      ekranın ta dibine kadar uzanır, yani ana ekran çubuğunun yerini zaten o kaplar. "Klavye açıksa
      sıfırla" diye koşul yazmak kusuru İKİYE çıkardı: `KeyboardAvoidingView` kendi dolgusunu
      klavyenin süresinde yumuşatarak kaldırırken koşul 34pt'yi bir anda geri koyuyordu — çubuk önce
      aşağı kayıp sonra yukarı zıplıyordu.

      Dolgu KÖKTE durunca koşula gerek kalmıyor: kabın alt kenarı zaten güvenli alan kadar yukarıda
      başlar ve `KeyboardAvoidingView` klavyeyle ÖRTÜŞMEYİ ölçtüğü için o farkı kendiliğinden düşer.
      Tek hareket, tek süre.

      PAY GÜVENLİ ALANIN TAMAMI DEĞİL, ÇUBUĞUN KENDİSİ KADAR (kullanıcı kararı 17.08).

      İşletim sisteminin bildirdiği 34pt, yukarı KAYDIRMA hareketi için ayrılmış cömert bir şerit.
      Bu ekranda o hareket yok: çubuğun üstündeki tek etkileşim DOKUNMAKTIR ve dokunuş, kaydırma
      hareketiyle yarışmaz — parmak basıp çekmediği sürece olay yazı alanına gider. Şeridin tamamını
      boş tutmak, ekranın altında hiçbir şey anlatmayan geniş bir bant bırakıyordu.

      Bu yüzden pay `insets.bottom` ile SINIRLI ama ondan küçük: ana ekran çubuğunun çizgisi açıkta
      kalsın yeter — yazı alanının yuvarlak kenarı onun üstüne binmesin. Alt güvenli alanı olmayan
      cihazda (`insets.bottom === 0`) sıfıra iner, kutunun kendi payı zaten var.
    */
    paddingBottom: Math.min(rt.insets.bottom, theme.space['3xl']),
  },
  /** Başlığın ALTINDAKİ her şey — kaçınma kabı buradan başlar (`FormScroll`un `layer`ıyla aynı rol). */
  keyboardLayer: { flex: 1 },
  /** Kaydırıcının KENDİSİ — kalan alanı doldurur ve klavye açılınca kısalır (künyesi kullanım yerinde). */
  thread: { flex: 1 },
  content: {
    padding: theme.space['4xl'],
    /* Çubuğun altında AYRILMIŞ ALAN YOK ve olmamalı: çubuk artık akışta, kendi yerini kendi
       kaplıyor. Mutlak konumluyken buraya bir kutu boyu dolgu konuyordu — o dolgu bugün
       yazışmanın sonunda kocaman bir boşluk olurdu. */
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
  // Şablonun kendi sınırı: baloncuk satırın %78'inden geniş olmaz.
  bubbleColumn: { maxWidth: '78%', gap: theme.space.sm },
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
  translated: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
  },
  notice: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },

  /*
    ÇUBUK AKIŞTA DURUR — `position: absolute` DEĞİL (iOS klavye arızasının kökü, ölçüldü 16.08).

    Mutlak konumlu çocuk kabının ALT KENARINA asılıdır. iOS'ta `KeyboardAvoidingView` kabın altına
    klavye kadar DOLGU koyuyor; kabın alt kenarı yerinde kaldığı için çubuk da yerinde kalıyor,
    yani klavyenin altında. Android'de aynı kod ÇALIŞIYORDU çünkü oradaki `height` davranışı kabı
    kısaltıyor — alt kenar yukarı geliyor, çubuk onunla geliyor. "Android düzeldi, iOS düzelmedi"
    gözleminin tek sebebi buydu; kusur `behavior` seçiminde ya da ofsette değildi.

    Akışta duran çubuk iki davranışta da doğru: kaydırıcı `flex: 1` ile kalanı doldurduğu için
    kutu zaten en alta oturur, dolgu eklendiğinde de dolgunun ÜSTÜNDE kalır.
  */
  composer: {
    gap: theme.space.sm,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    /* Kutunun KENDİ dolgusu simetrik: güvenli alan artık ekranın kökünde (künyesi orada), burada
       yalnız çubuğun çerçevesiyle arasındaki nefes payı kalır. */
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
  sendError: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
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
