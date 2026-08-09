import type { LocalizedCopy } from '@lezzet/i18n';
import type { FeedbackVote } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Tag } from '@/components/ui/tag';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import { emToDp } from '@/theme/parse';
import { HeartIcon, ThumbIcon } from './feedback-icons';
import {
  completeFeedbackFixture,
  feedbackInviteByToken,
  type FeedbackCardView,
  type FeedbackCompletionView,
  type FeedbackInviteView,
  type FeedbackVoteBody,
} from './feedback-fixture';
import messages from './messages.json';

/*
  GERİ BİLDİRİM (v3 `vFb`) — sipariş sonrası değerlendirme; mail/bildirimdeki token'lı derin
  bağlantıyla açılır (`/feedback/<token>`). Üç aşama, akış kurucusu v3:2007-2018 + `fbVote`/
  `fbFinish` (v3:560-561):
  · oy      — ürün ürün "Beğendim / Beğenmedim"; büyük fotoğraf + sipariş rozeti + sayaç ("1 / 3")
  · yorum   — tüm ürünler oylanınca tek serbest yorum (zorunlu değil)
  · sonuç   — teşekkür + puan kartı; hepsi beğenildiyse dış değerlendirme daveti, değilse
              "Sorun bildir" köprüsü (`/support/new?order=…`), en altta vitrine dönüş.

  ── UI-ONLY ─────────────────────────────────────────────────────────────────
  Geri bildirim uçları mobile bağlanmadı; davet fixture'dan okunur, oylar ekran durumunda birikir.
  Sözleşme YAZILI ve tek: `packages/types/.../feedback-api.schema.ts` — fixture onun alan alan
  aynası, bağlantı noktaları (oy · yorum · tamamlama) kod içinde işaretli. Yarıda bırakılan akış
  sözleşmenin kendi kuralıyla kaldığı yerden sürer (ilk oysuz kart).

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **`pageIn`/`pop` animasyonları çizilmedi** — onay ekranının verdiği kararla aynı gerekçe
     (`order-confirmed-screen`): tek giriş efekti için ekrana animasyon döngüsü bağlamak bu
     etabın kazancından büyük; öğeler ilk kareden tam boyuyla durur.
  2. **"Bulunamadı" durumu EKLENDİ** — şablonda yok (demo daveti hep çözülür) ama token'lı derin
     bağlantı eskimiş/bozuk gelebilir; "yok" sessizce boş akış değildir (CLAUDE §1). Deseni talep
     detayının `notFound`'u.
  3. **Dış değerlendirme düğmesi GERÇEKTEN açar** (`Linking.openURL`) — şablon demo toast basıyor
     ("açılıyor (demo)"); uygulamada toast katmanı yok (yeni-talep ekranının kararı) ve adres
     fixture'da hazır. Platform adı cevaptan gelir; "Google" ekrana gömülmez.
  4. **Yazı/ölçü duraklara çekildi** (ölçü katmanının ±yuvarlama kuralı): ürün adı 27→26
     (`page-title-sm`), teşekkür başlığı 22→24 (`card-title` — 20 ile eşit uzaklıkta, aşama-1
     başlığından büyük kalması için üste), puan 32→30 (`h1-sm`), rozet 11.5→12.5 (`badge`),
     oy/CTA etiketi 14→14.5 (`button`), yorum alanı 100→110 (kitin `controlMultiline`ı),
     eyebrow harf aralığı .16em→.18em (uygulama token'ı).
  5. **Oy düğmeleri yerel** — kit düğmelerinde ikon yuvası yok ve 56'lık boy kitin `controlLg`
     durağından bilerek büyük (şablonun kendi vurgusu); basılı geri bildirim kitin kuralından
     (gölgeli yüzey kayar, gölgesiz küçülür).
*/

type Messages = LocalizedCopy<typeof messages>;

/*
  v3'te ölçülmüş, ölçü katmanlarında (`theme/metrics` + `customer-kit/customer-metrics`) henüz
  olmayan duraklar. İki katman da bu etapta yazıya kapalı — customer-metrics'in kendi kuralıyla
  ham değerler komponent gövdesine DAĞITILMADI, ekranın tek yerine kondu; katman yazıya açılınca
  buradakiler oraya terfi eder (raporlandı).
*/
const feedbackMetrics = {
  /** Ürün fotoğrafı bloğu (v3:1016 — 380). */
  photo: 380,
  /** Oy düğmesi (v3:1026 — 56; kitin 52'lik `controlLg`sinden bilerek büyük). */
  voteButton: 56,
  /** Teşekkür dairesi (v3:1035 — 88; onay ekranının 92'lik işaretinden AYRI ölçü). */
  thanksMark: 88,
  /** Teşekkür kalbi (v3:1035 — 38). */
  heartIcon: 38,
} as const;

/**
 * Yarıda bırakılan akışın kaldığı yeri bulur — sözleşmenin kendi kuralı: ölçüt `existing` değil
 * `existing.vote` (yalnız yorum taşıyan kart hâlâ cevapsızdır). Hepsi cevaplıysa yorum aşaması.
 */
function firstUnvotedIndex(cards: FeedbackCardView[]): number {
  const index = cards.findIndex((card) => card.existing === null || card.existing.vote === null);
  return index === -1 ? cards.length : index;
}

interface FeedbackScreenProps {
  /** Derin bağlantıdaki davet token'ı — oturum yerine geçer, başka kimlik sorulmaz. */
  token: string;
  /** Test kapısı; verilmezse fixture token'la çözer (uç geldiğinde yerini gerçek okuma alır). */
  invite?: FeedbackInviteView | null;
}

export function FeedbackScreen({ token, invite = feedbackInviteByToken(token) }: FeedbackScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [index, setIndex] = useState(() => (invite === null ? 0 : firstUnvotedIndex(invite.cards)));
  const [votes, setVotes] = useState<FeedbackVoteBody[]>([]);
  const [comment, setComment] = useState('');
  const [completion, setCompletion] = useState<FeedbackCompletionView | null>(null);

  /* Aşama TÜRETİLİR, ayrıca saklanmaz (şablon `stage` tutuyor; tek kaynak yeter): kart varken oy,
     kartlar bitince yorum, tamamlama cevabı gelince sonuç. */
  const card = invite === null || index >= invite.cards.length ? null : (invite.cards[index] ?? null);

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="feedback-back" />}
      /* Sayaç yalnız oy aşamasında (şablon: `sc-if fv.stage0`) — `min(idx+1, toplam)` kuralı. */
      right={
        invite !== null && card !== null ? (
          <Text style={styles.progress} testID="feedback-progress">
            {t.progress
              .replace('{current}', String(Math.min(index + 1, invite.cards.length)))
              .replace('{total}', String(invite.cards.length))}
          </Text>
        ) : undefined
      }
      testID="feedback-appbar"
    />
  );

  /* Geçersiz/eskimiş bağlantı: davet yok. Şablonda karşılığı yok — sapma 2. */
  if (invite === null) {
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

  const vote = (value: FeedbackVote) => {
    if (card === null) return;
    /* BAĞLANTI NOKTASI — oy ÜRÜN BAŞINA ve ANINDA yazılır (`POST /feedback/:token/vote`,
       gövde `FeedbackVoteBodySchema`); yarıda bırakılan akış böylece kaldığı yerden sürer.
       Bu etapta ekran durumunda birikir. */
    setVotes([...votes, { productId: card.productId, vote: value }]);
    setIndex(index + 1);
  };

  const finish = () => {
    /* BAĞLANTI NOKTASI — iki yazım sırayla:
       1. Yorum doluysa `POST /feedback/:token/review` — sözleşme yorumu ÜRÜNE bağlar (`productId`
          zorunlu; "çok ürünlüde hedefi ekran belirler"): hedef ilk beğenilen kart, hiçbiri
          beğenilmediyse ilk kart olacak.
       2. `POST /feedback/:token/complete` — sonuç (`outcome`), puan ve dış değerlendirme
          bağlantısı CEVAPTAN okunur, ekran hesaplamaz; fixture o cevabın yer tutucusu.
       Davet ZATEN tamamlanmışsa (`invite.completedAt` dolu) uç puanı ikinci kez vermez; o durumda
       ekran açılışta doğrudan tamamlama çağırıp teşekkür durumuna düşecek (web sayfası emsali). */
    setCompletion(completeFeedbackFixture(votes));
  };

  /* Talep akışını SİPARİŞE bağlayarak açar (şablon: `openTalepNew(o.ref)`); kargosuz senaryoda
     referans yoksa genel talep kapısına düşer. */
  const reportIssue = () => {
    const reference = invite.orderReferenceNo;
    router.push(reference === null ? '/support/new' : { pathname: '/support/new', params: { order: reference } });
  };

  return (
    <View style={styles.screen} testID="feedback-screen">
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="feedback-scroll">
        {card !== null ? (
          /* ── Oy aşaması: fotoğraf + rozet + künye, iki oy düğmesi, alt not (v3:1014-1030) ── */
          <View testID="feedback-vote">
            <View style={styles.photo}>
              {/* Kırpma künyesi (`image.crop`) bugün uygulanmıyor — ürün detayının kahramanıyla
                  aynı durum: RN tarafında odak/zoom mekanizması kit işidir, ekran başına yazılmaz. */}
              {card.image.url === null ? (
                <View style={styles.photoFallback}>
                  <Text style={styles.photoInitial}>{card.name.slice(0, 1)}</Text>
                </View>
              ) : (
                <Image source={{ uri: card.image.url }} style={styles.photoImage} accessibilityIgnoresInvertColors />
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
                  onPress={() => vote('dislike')}
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
                  onPress={() => vote('like')}
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
            <Text style={styles.voteHint}>{t.vote.hint}</Text>
          </View>
        ) : completion === null ? (
          /* ── Yorum aşaması: başlık + açıklama + serbest alan + tamamla (v3:1032-1038) ── */
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
            <PrimaryButton label={t.comment.finish} onPress={finish} testID="feedback-finish" />
          </View>
        ) : (
          /* ── Sonuç: kalp + teşekkür + puan kartı + akış-sonu köprüsü (v3:1040-1060) ── */
          <View style={styles.doneBlock} testID="feedback-done">
            <View style={styles.thanksMark}>
              <HeartIcon size={feedbackMetrics.heartIcon} color={theme.colors.olive} />
            </View>
            <Text style={styles.doneTitle} accessibilityRole="header">
              {t.done.title}
            </Text>

            {/* Puan TAMAMLAMAYA bağlıdır, beğeniye değil (DOMAIN §14); 0 → kart çizilmez
                (B2B'de ve ikinci tamamlamada puan yok — şablonun `sc-if fv.ptsF` kapısı). */}
            {completion.pointsAwarded > 0 ? (
              <View style={styles.pointsCard} testID="feedback-points">
                <Text style={styles.pointsValue}>
                  {t.done.points.replace('{points}', String(completion.pointsAwarded))}
                </Text>
                <Text style={styles.pointsNote}>{t.done.pointsNote}</Text>
                <View style={styles.pointsTotal}>
                  <Text style={styles.pointsTotalLabel}>
                    {t.done.pointsTotal.replace('{points}', String(completion.balance))}
                  </Text>
                </View>
              </View>
            ) : null}

            {completion.outcome === 'review_invite' && completion.reviewUrl !== null && completion.reviewPlatform !== null ? (
              <ReviewInvite url={completion.reviewUrl} platform={completion.reviewPlatform} copy={t} />
            ) : null}

            {completion.outcome === 'report_issue' ? (
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
        )}
      </ScrollView>
    </View>
  );
}

interface ReviewInviteProps {
  url: string;
  /** Düğmede yazan platform adı — cevaptan gelir, "Google" ekrana gömülmez. */
  platform: string;
  copy: Messages;
}

/** Dış değerlendirme daveti — yalnız `review_invite` sonucunda (sapma 3: bağlantı gerçekten açılır). */
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
  /** Başlık çubuğundaki sayaç (v3:1012 — `700 12.5px`, sessiz ton). */
  progress: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
  },

  /* ── Oy aşaması ── */
  photo: {
    height: feedbackMetrics.photo,
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
    height: feedbackMetrics.voteButton,
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

  /* ── Yorum aşaması ── */
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

  /* ── Sonuç aşaması ── */
  doneBlock: {
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingVertical: theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
  },
  thanksMark: {
    width: feedbackMetrics.thanksMark,
    height: feedbackMetrics.thanksMark,
    borderRadius: feedbackMetrics.thanksMark / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['olive-bg'],
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
  pointsCard: {
    alignItems: 'center',
    gap: theme.space.xs,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['4xl'],
    paddingHorizontal: theme.space['8xl'],
    marginVertical: theme.space.sm,
    transform: [{ rotate: '-2deg' }],
    boxShadow: theme.shadow.hard,
  },
  pointsValue: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors.terracotta,
  },
  pointsNote: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.body,
  },
  pointsTotal: {
    backgroundColor: theme.colors.olive,
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space['2xl'],
    marginTop: theme.space['2xs'],
    transform: [{ rotate: '2deg' }],
  },
  pointsTotalLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.card,
  },
  /** "Sorun bildir" — kitin ikincil hap düğmesi TERRACOTTA metin varyantı taşımıyor (v3:1057);
      yüzey ve ölçüler `SecondaryButton`ın hap durağıyla bire bir, yalnız metin rengi ekranın. */
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
