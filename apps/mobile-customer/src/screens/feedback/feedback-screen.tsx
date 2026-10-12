import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { CLIENT_ERROR } from '@lezzet/mobile-kit/src/lib/api/client';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { PointsAward, PointsSpark } from '@/screens/customer-kit/points-award';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { FeedbackRow } from './feedback-row';
import { FeedbackSkeleton } from './feedback-skeleton';
import messages from '@lezzet/i18n/customer/feedback';
import { useFeedback } from './use-feedback.hook';

/*
  Sipariş sonrası değerlendirme, e-postadaki belirteçli bağlantıyla açılır: siparişin ürünleri tek ekranda, her birine oy ve isteğe
  bağlı yorum, sonunda teşekkür ve puan. Ekran kural hesaplamaz; veri ve yazımlar `use-feedback.hook`ta.
*/

type Messages = LocalizedCopy<typeof messages>;

/* Yalnız bu ekranın ölçüleri. */
const feedbackMetrics = {
  /** Sonuç sayfasının kahraman işareti. */
  sparkIcon: 120,
  /** Kural satırının işareti. */
  ruleIcon: 12,
} as const;

/** Yazım retlerinin cümlesi; tanınmayan anahtar jenerik cümleye düşer ki ekranda boş kırmızı satır durmasın. */
function writeErrorText(t: Messages, key: string): string {
  if (key === CLIENT_ERROR.network) return t.errors.network;
  if (key === 'invalid_link') return t.errors.invalid_link;
  if (key === 'vote_failed') return t.errors.vote_failed;
  return t.errors.unexpected;
}

interface FeedbackScreenProps {
  /** Derin bağlantıdaki davet belirteci; oturum yerine geçer. */
  token: string;
}

export function FeedbackScreen({ token }: FeedbackScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const feedback = useFeedback(token, locale);
  const { status, invite, votes, completion, errorKey, finishing } = feedback;

  const cards = invite?.cards ?? [];
  // Davet zaten tamamlanmışsa akış kurulmaz, çünkü puan ikinci kez verilmez.
  const alreadyDone = invite !== null && invite.completedAt !== null;
  const showDone = completion !== null || alreadyDone;
  const allVoted = cards.every((card) => votes[card.productId] !== undefined);

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="feedback-back" />}
      testID="feedback-appbar"
    />
  );

  /* İlk yükte listenin yerini iskelet tutar; başlık çubuğu gerçek basılır ki geri düğmesi beklerken de çalışsın. */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <FeedbackSkeleton testID="feedback-loading" />
      </View>
    );
  }

  /* Eskimiş bağlantı ağ arızasından ayrı çizilir: "bağlantını kontrol et" demek onu tel arızası gibi gösterirdi. */
  if (status === 'missing') {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          title={t.notFound.title}
          description={t.notFound.body}
          action={<PrimaryButton label={t.notFound.cta} shape="pill" onPress={() => router.replace('/')} testID="feedback-notfound-cta" />}
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
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={feedback.retry} testID="feedback-retry" />}
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

  const products = cards.length === 1 ? t.list.productsOne : t.list.productsMany.replace('{count}', String(cards.length));
  const eyebrow = invite.orderReferenceNo === null ? products : `${invite.orderReferenceNo} · ${products}`;
  const rule = t.list.rule.replace('{vote}', String(invite.votePoints)).replace('{review}', String(invite.reviewPoints));

  const errorLine =
    errorKey === null ? null : (
      <Text style={styles.errorLine} accessibilityRole="alert" testID="feedback-write-error">
        {writeErrorText(t, errorKey)}
      </Text>
    );

  return (
    <View style={styles.screen} testID="feedback-screen">
      {bar}
      {/* Kaydırıcı kitten: klavye açıkken ilk dokunuş düğmeye gider ve yorum alanı klavyenin üstünde kalır. */}
      <FormScroll contentContainerStyle={[styles.content, showDone ? styles.contentFill : undefined]} testID="feedback-scroll">
        {!showDone ? (
          <View style={styles.list} testID="feedback-list">
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.heading} accessibilityRole="header">
              {t.list.heading}
            </Text>
            <View style={styles.rule} testID="feedback-rule">
              <PointsSpark size={feedbackMetrics.ruleIcon} color={theme.colors.terracotta} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>

            <View style={styles.card}>
              {cards.map((card, index) => (
                <View key={card.productId} style={index > 0 ? styles.divider : undefined}>
                  <FeedbackRow
                    card={card}
                    vote={votes[card.productId]}
                    onVote={(value) => feedback.vote(card.productId, value)}
                    comment={feedback.comments[card.productId] ?? ''}
                    commentOpen={feedback.openComments.has(card.productId)}
                    onOpenComment={() => feedback.openComment(card.productId)}
                    onChangeComment={(text) => feedback.setComment(card.productId, text)}
                    short={feedback.shortComments.has(card.productId)}
                    reviewPoints={invite.reviewPoints}
                    minWords={invite.reviewMinWords}
                    t={t}
                    testID={`feedback-row-${index}`}
                  />
                </View>
              ))}
            </View>

            <Text style={styles.note}>{t.list.note}</Text>
            <PrimaryButton
              label={finishing ? t.comment.finishing : t.list.finish.replace('{points}', String(invite.completionPoints))}
              onPress={() => void feedback.finish()}
              disabled={!allVoted || finishing}
              testID="feedback-finish"
            />
            {errorLine}
          </View>
        ) : (
          /* Sonuç: kalan boşluk 4:6 paylaşılır ki blok sayfanın optik merkezinde dursun (`EmptyState` ile aynı oran). */
          <>
            <View style={styles.spacerTop} />
            <View style={styles.doneBlock} testID="feedback-done">
              {/* Kahraman işaret dairesiz, doğrudan zeminde, çünkü büyük solgun daire leke gibi okunur. */}
              <PointsSpark size={feedbackMetrics.sparkIcon} color={theme.colors.terracotta} />
              <Text style={styles.doneTitle} accessibilityRole="header">
                {completion === null ? t.already.title : t.done.title}
              </Text>

              {completion === null ? <Text style={styles.doneBody}>{t.already.body}</Text> : null}

              {/* Yazılan sayı turun toplamıdır; oy, yorum ve prim ayrı kayıtlardır ve toplamı yalnız motor bilir. */}
              {completion === null ? null : (
                <PointsAward points={completion.invitePointsTotal} balance={completion.balance} framed testID="feedback-points" />
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
  /** Düğmede yazan platform adı cevaptan gelir, ekrana gömülmez. */
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
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
  },
  /** Sonuç aşamasında kaydırıcının içeriği ekranın kalan yüksekliğini doldurur. */
  contentFill: { flexGrow: 1 },

  list: {
    paddingTop: theme.space['4xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    textTransform: 'uppercase',
    color: theme.colors.terracotta,
  },
  heading: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    color: theme.colors.ink,
  },
  rule: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.soft,
    backgroundColor: theme.colors['terracotta-bg'],
  },
  ruleText: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
  card: {
    marginTop: theme.space.xs,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
  },
  /* Kesikli ayraç dört kenarın rengini taşır, çünkü iOS kesik kenarı yalnız bütün kenarların rengi aynıyken çizer. */
  divider: {
    borderTopWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  errorLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.error,
    textAlign: 'center',
  },

  /* 4:6 — `EmptyState`in optik yerleşimiyle aynı oran; sayılar ölçü değil oran olduğu için `theme.space`ten gelmez. */
  spacerTop: { flex: 4 },
  spacerBottom: { flex: 6 },
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
