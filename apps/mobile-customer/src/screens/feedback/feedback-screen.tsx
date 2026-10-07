import type { LocalizedCopy } from '@lezzet/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { Tag } from '@/components/ui/tag';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { CLIENT_ERROR } from '@lezzet/mobile-kit/src/lib/api/client';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { PointsAward, PointsSpark } from '@/screens/customer-kit/points-award';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { FeedbackSkeleton } from './feedback-skeleton';
import { ThumbIcon } from './feedback-icons';
import messages from '@lezzet/i18n/customer/feedback';
import { useFeedback } from './use-feedback.hook';

/*
  Sipariş sonrası değerlendirme, e-postadaki belirteçli bağlantıyla açılır: ürün ürün oy, oylar bitince tek yorum, sonunda teşekkür
  ve puan. Aşama istemcide türetilir ve ekran kural hesaplamaz; veri ve yazımlar `use-feedback.hook`ta.
*/

type Messages = LocalizedCopy<typeof messages>;

/* Yalnız bu ekranın ölçüsü; ölçü katmanlarında karşılığı yok. */
const feedbackMetrics = {
  /** Puan yıldızı — sayfanın kahraman işareti, doğrudan zemin üstünde. */
  sparkIcon: 120,
} as const;

/**
 * Yazım retlerinin cümlesi; tanınmayan anahtar jenerik cümleye düşer ki ekranda boş kırmızı satır durmasın. `review_empty` yok,
 * çünkü bu ekran yorumu yalnız boş değilken gönderir ve yıldız alanı yoktur.
 */
function writeErrorText(t: Messages, key: string): string {
  if (key === CLIENT_ERROR.network) return t.errors.network;
  if (key === 'invalid_link') return t.errors.invalid_link;
  if (key === 'vote_failed') return t.errors.vote_failed;
  return t.errors.unexpected;
}

interface FeedbackScreenProps {
  /** Derin bağlantıdaki davet token'ı — oturum yerine geçer, başka kimlik sorulmaz. */
  token: string;
}

export function FeedbackScreen({ token }: FeedbackScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const { status, invite, votes, errorKey, finishing, completion, retry, vote, finish } = useFeedback(token, locale);
  const [comment, setComment] = useState('');

  /* Aşama türetilir: oysuz kart varken oy, kartlar bitince yorum, tamamlama cevabı gelince sonuç; kart sırası oy haritasındaki ilk boşluk. */
  const cards = invite?.cards ?? [];
  const index = cards.findIndex((entry) => votes[entry.productId] === undefined);
  const card = index === -1 ? null : (cards[index] ?? null);
  /* Davet zaten tamamlanmışsa akış kurulmaz, çünkü puan ikinci kez verilmez. */
  const alreadyDone = invite !== null && invite.completedAt !== null;
  /** Sonuç aşaması; kaydırıcı yalnız burada ekranı doldurur. */
  const showDone = completion !== null || alreadyDone;

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="feedback-back" />}
      /* Sayaç yalnız oy aşamasında. */
      right={
        card !== null && !alreadyDone ? (
          <Text style={styles.progress} testID="feedback-progress">
            {t.progress.replace('{current}', String(index + 1)).replace('{total}', String(cards.length))}
          </Text>
        ) : undefined
      }
      testID="feedback-appbar"
    />
  );

  /* İlk yükte oy aşamasının yerini iskelet tutar; başlık çubuğu gerçek basılır ki geri düğmesi beklerken de çalışsın. */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <FeedbackSkeleton testID="feedback-loading" />
      </View>
    );
  }

  /* Eskimiş ya da bozuk bağlantı ağ arızasından ayrı çizilir: "bağlantını kontrol et" demek onu tel arızası gibi gösterirdi. */
  if (status === 'missing') {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          title={t.notFound.title}
          description={t.notFound.body}
          action={
            <PrimaryButton label={t.notFound.cta} shape="pill" onPress={() => router.replace('/')} testID="feedback-notfound-cta" />
          }
          testID="feedback-notfound"
        />
      </View>
    );
  }

  /* Telin arızasında davet duruyor olabilir, bu yüzden çıkış değil tekrar dene. */
  if (status === 'error' || invite === null) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={retry} testID="feedback-retry" />}
          testID="feedback-error"
        />
      </View>
    );
  }

  /* Talep akışını siparişe bağlayarak açar; referans yoksa genel talep kapısına düşer. */
  const reportIssue = () => {
    const reference = invite.orderReferenceNo;
    router.push(reference === null ? '/support/new' : { pathname: '/support/new', params: { order: reference } });
  };

  /** Son yazımın reddi — oy geri alındıysa kartın altında, tamamlama düştüyse düğmenin altında. */
  const errorLine =
    errorKey === null ? null : (
      <Text style={styles.errorLine} accessibilityRole="alert" testID="feedback-write-error">
        {writeErrorText(t, errorKey)}
      </Text>
    );

  return (
    <View style={styles.screen} testID="feedback-screen">
      {bar}
      {/* Kaydırıcı kitten: klavye açıkken "Değerlendirmeyi tamamla"ya ilk dokunuş klavyeyi kapatıp yorumu göndermezdi; aynı kap
          yorum alanını klavyenin üstünde tutar. */}
      <FormScroll
        contentContainerStyle={[styles.content, showDone ? styles.contentFill : undefined]}
        testID="feedback-scroll"
      >
        {card !== null && !alreadyDone ? (
          <View testID="feedback-vote">
            <View style={styles.photo}>
              {/* Kadraj CDN türevinde uygulanmış gelir ve kutuya en yakın çerçeve seçilir; ekran başına yazılmaz. */}
              {card.image.url === null ? (
                <View style={styles.photoFallback}>
                  <Text style={styles.photoInitial}>{card.name.slice(0, 1)}</Text>
                </View>
              ) : (
                <FrameImage image={card.image} style={styles.photoImage} />
              )}
              <LinearGradient {...theme.gradient.photoBottom} style={styles.photoScrim} pointerEvents="none" />
              {invite.orderReferenceNo === null ? null : (
                <View style={styles.photoBadge}>
                  <Tag label={invite.orderReferenceNo} tone="cream" rotate={3} shadow testID="feedback-order-badge" />
                </View>
              )}
              <View style={styles.photoCaption}>
                <Text style={styles.captionEyebrow}>{t.vote.eyebrow}</Text>
                <Text style={styles.captionName} accessibilityRole="header">
                  {card.name}
                </Text>
              </View>
            </View>
            <View style={styles.voteRow}>
              {/* Genişliği YUVA dağıtır (sekme çubuğunun kalıbı): `PressableSurface`in stili iç
                  yüzeydedir, dış `Pressable`a `flex: 1` geçirilemez. */}
              <View style={styles.voteSlot}>
                <PressableSurface
                  onPress={() => vote(card.productId, 'dislike')}
                  feedback="scale"
                  style={[styles.voteButton, styles.voteDislike]}
                  accessibilityLabel={t.vote.dislike}
                  testID="feedback-dislike"
                >
                  <ThumbIcon direction="down" size={theme.size.inlineIcon} color={theme.colors.ink} />
                  <Text style={[styles.voteLabel, styles.voteDislikeLabel]}>{t.vote.dislike}</Text>
                </PressableSurface>
              </View>
              <View style={styles.voteSlot}>
                <PressableSurface
                  onPress={() => vote(card.productId, 'like')}
                  feedback="shadow"
                  style={[styles.voteButton, styles.voteLike]}
                  accessibilityLabel={t.vote.like}
                  testID="feedback-like"
                >
                  <ThumbIcon direction="up" size={theme.size.inlineIcon} color={theme.colors.card} />
                  <Text style={[styles.voteLabel, styles.voteLikeLabel]}>{t.vote.like}</Text>
                </PressableSurface>
              </View>
            </View>
            {/* Ret satırı düğmelerin ALTINDA: geri alınan oyun kartı zaten yeniden çizildi, sebep
                de dokunulan yerin yanında durmalı. */}
            {errorLine}
            <Text style={styles.voteHint}>{t.vote.hint}</Text>
          </View>
        ) : completion === null && !alreadyDone ? (
          <View style={styles.commentBlock} testID="feedback-comment">
            <Text style={styles.commentTitle} accessibilityRole="header">
              {t.comment.title}
            </Text>
            <Text style={styles.commentBody}>{t.comment.body}</Text>
            <TextField
              value={comment}
              onChangeText={setComment}
              accessibilityLabel={t.comment.label}
              placeholder={t.comment.placeholder}
              multiline
              testID="feedback-comment-input"
            />
            <PrimaryButton
              label={finishing ? t.comment.finishing : t.comment.finish}
              onPress={() => void finish(comment)}
              disabled={finishing}
              testID="feedback-finish"
            />
            {/* Tamamlama düştüyse metin kutuda kalır, tek dokunuşla tekrarlanır. */}
            {errorLine}
          </View>
        ) : (
          /* Sonuç: kalan boşluk 4:6 paylaşılır ki blok sayfanın optik merkezinde dursun (`EmptyState` ile aynı oran). */
          <>
            <View style={styles.spacerTop} />
          <View style={styles.doneBlock} testID="feedback-done">
            {/* Sonuç sayfası kutusuz: hiyerarşi kutuyla değil ölçek ve boşlukla kurulur. */}
            {/* Kahraman işaret dairesiz, doğrudan zeminde, çünkü büyük solgun daire leke gibi okunur. */}
            <PointsSpark size={feedbackMetrics.sparkIcon} color={theme.colors.terracotta} />
            <Text style={styles.doneTitle} accessibilityRole="header">
              {completion === null ? t.already.title : t.done.title}
            </Text>

            {/* Zaten tamamlanmış davette puanın daha önce eklendiği söylenir; bu turda kazanılan bir şey olmadığı için sonuç blokları çizilmez. */}
            {completion === null ? <Text style={styles.doneBody}>{t.already.body}</Text> : null}

            {/* Yazılan sayı turun toplamıdır (`invitePointsTotal`), tamamlama primi değil: oy, yorum ve prim ayrı kayıtlardır ve toplamı
                yalnız motor bilir. */}
            {completion === null ? null : (
              <PointsAward points={completion.invitePointsTotal} balance={completion.balance} testID="feedback-points" />
            )}

            {completion !== null &&
            completion.outcome === 'review_invite' &&
            completion.reviewUrl !== null &&
            completion.reviewPlatform !== null ? (
              <ReviewInvite url={completion.reviewUrl} platform={completion.reviewPlatform} copy={t} />
            ) : null}

            {completion !== null && completion.outcome === 'report_issue' ? (
              <>
                <Text style={styles.doneBody}>{t.done.issueBody}</Text>
                <PressableSurface
                  onPress={reportIssue}
                  feedback="scale"
                  style={styles.issueButton}
                  accessibilityLabel={t.done.issueCta}
                  testID="feedback-issue"
                >
                  <Text style={styles.issueLabel}>{t.done.issueCta}</Text>
                </PressableSurface>
              </>
            ) : null}

            <View style={styles.homeSlot}>
              <PrimaryButton label={t.done.home} shape="pill" onPress={() => router.replace('/')} testID="feedback-home" />
            </View>
          </View>
            <View style={styles.spacerBottom} />
          </>
        )}
      </FormScroll>
    </View>
  );
}

interface ReviewInviteProps {
  url: string;
  /** Düğmede yazan platform adı — cevaptan gelir, "Google" ekrana gömülmez. */
  platform: string;
  copy: Messages;
}

/** Dış değerlendirme daveti, yalnız `review_invite` sonucunda; bağlantı cihazın tarayıcısında açılır. */
function ReviewInvite({ url, platform, copy }: ReviewInviteProps) {
  return (
    <>
      <Text style={styles.doneBody}>{copy.done.reviewBody.replace('{platform}', platform)}</Text>
      <SecondaryButton
        label={copy.done.reviewCta.replace('{platform}', platform)}
        shape="pill"
        onPress={() => void Linking.openURL(url)}
        testID="feedback-review"
      />
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    /* Yatay dolgu YOK: fotoğraf kenardan kenara, blokların dolgusu kendi üstlerinde. */
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
  },
  /** Başlık çubuğundaki sayaç, sessiz ton. */
  progress: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
  },

  /** Yazım reddi: talep ekranındaki gönderim hatasının ortalı hâli. */
  errorLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.error,
    textAlign: 'center',
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
  },

  photo: {
    height: customerMetrics.feedbackPhoto,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  photoInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors['on-image-soft'],
  },
  photoScrim: {
    position: 'absolute',
    inset: 0,
  },
  photoBadge: {
    position: 'absolute',
    top: theme.space['2xl'],
    right: theme.space['3xl'],
  },
  photoCaption: {
    position: 'absolute',
    left: theme.space['6xl'],
    right: theme.space['6xl'],
    bottom: theme.space['4xl'],
    gap: theme.space.xs,
  },
  captionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors['olive-light'],
  },
  captionName: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors['on-image'],
  },
  voteRow: {
    flexDirection: 'row',
    gap: theme.space['3xl'],
    paddingVertical: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
  },
  voteSlot: {
    flex: 1,
  },
  voteButton: {
    height: customerMetrics.feedbackVoteButton,
    borderRadius: theme.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
  },
  voteDislike: {
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    backgroundColor: 'transparent',
  },
  voteLike: {
    backgroundColor: theme.colors.olive,
    boxShadow: theme.shadow.hard,
  },
  voteLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
  },
  voteDislikeLabel: { color: theme.colors.ink },
  voteLikeLabel: { color: theme.colors.card },
  voteHint: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
    paddingHorizontal: theme.space['8xl'],
  },

  commentBlock: {
    paddingVertical: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    gap: theme.space['2xl'],
  },
  commentTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    color: theme.colors.ink,
  },
  commentBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  /** Kaydırıcının içeriği ekranın kalan yüksekliğini DOLDURUR; yalnız sonuç aşamasında eklenir
      (öteki aşamalar içerikleri kadar uzun, zorlanan yükseklik onlarda boşluk üretirdi). */
  contentFill: { flexGrow: 1 },
  /* 4:6 — `EmptyState`in optik yerleşimiyle AYNI oran, aynı gerekçe (`design/KARARLAR.md`).
     Sayılar ölçü durağı değil ORAN, o yüzden `theme.space`ten gelmez. */
  spacerTop: { flex: 4 },
  spacerBottom: { flex: 6 },
  /* Blok büyümez: kalan boşluğu iki pay paylaşır ve blok tam ortalarında durur. */
  doneBlock: {
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingVertical: theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
  },
  doneTitle: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  doneBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
    textAlign: 'center',
  },
  /** "Sorun bildir": kitin ikincil hap düğmesinde terracotta metin yok; yüzey ve ölçüler o düğmenin hap durağıyla aynı. */
  issueButton: {
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['6xl'],
    borderRadius: theme.radius.pill,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
    color: theme.colors.terracotta,
  },
  homeSlot: {
    marginTop: theme.space.xs,
  },
}));
