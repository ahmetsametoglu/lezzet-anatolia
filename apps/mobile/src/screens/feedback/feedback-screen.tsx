import type { LocalizedCopy } from '@lezzet/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Tag } from '@/components/ui/tag';
import { TextField } from '@/components/ui/text-field';
import { CLIENT_ERROR } from '@/lib/api/client';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { PointsAward, PointsSpark } from '@/screens/customer-kit/points-award';
import { emToDp } from '@/theme/parse';
import { FeedbackSkeleton } from './feedback-skeleton';
import { ThumbIcon } from './feedback-icons';
import messages from './messages.json';
import { useFeedback } from './use-feedback.hook';

/*
  GERİ BİLDİRİM (v3 `vFb`) — sipariş sonrası değerlendirme; mail/bildirimdeki token'lı derin
  bağlantıyla açılır (`/feedback/<token>`). Üç aşama, akış kurucusu v3:2007-2018 + `fbVote`/
  `fbFinish` (v3:560-561):
  · oy      — ürün ürün "Beğendim / Beğenmedim"; büyük fotoğraf + sipariş rozeti + sayaç ("1 / 3")
  · yorum   — tüm ürünler oylanınca tek serbest yorum (zorunlu değil)
  · sonuç   — teşekkür + puan kartı; hepsi beğenildiyse dış değerlendirme daveti, değilse
              "Sorun bildir" köprüsü (`/support/new?order=…`), en altta vitrine dönüş.

  ── GERÇEK UÇLARA BAĞLI (10.08) ─────────────────────────────────────────────
  Dört uç da `apps/mobile-api`de yazılıydı ve ekran onları HİÇ çağırmıyordu: davet fixture'dan
  okunuyor, oylar ekran durumunda birikip kayboluyordu — yani davet linkiyle gelen müşteri kurgu
  ürünleri oyluyordu. Veri artık `use-feedback.hook`tan gelir (`GET /feedback/:token` +
  oy/yorum/tamamlama yazımları); ekran kural hesaplamaz, sözleşmeyi çizer.

  Aşama İSTEMCİDE türetilir (sözleşmenin kararı), ama hangi kartta olduğumuz AYRI BİR DURUM DEĞİL:
  hook'un `votes` haritasındaki ilk oysuz kart. Yarıda bırakılan akış böylece kendiliğinden kaldığı
  yerden sürer ve reddedilen bir oy geri alındığında ekran o karta kendiliğinden döner.

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
  6. **Yükleme ve bağlantı hatası durumları EKLENDİ** — şablon ağı olmayan bir demoydu (envanter
     §5: "ilk yükleme skeleton'ları yok · ağ hatası hiçbir ekranda yok"). Yükleme `feedback-skeleton`,
     hata ise kitin `EmptyState`i + "Tekrar dene": tarif/paket detaylarının cümleleriyle BİREBİR
     aynı sözlük — aynı arıza iki ekranda iki türlü anlatılmaz.
  7. **"Zaten tamamlanmış davet" durumu EKLENDİ** — şablonda yok ama sözleşmede var
     (`completedAt`) ve web davet sayfasının kendi kutusu (`AlreadyDone`). Kartları göstermek,
     puanı ikinci kez kazanılabilirmiş gibi okuturdu; cümleler web'inkinin aynısı.
  8. **Yorum aşamasındaki metin ÜRÜNE yazılır** — sözleşme yorumu ürüne bağlıyor (`productId`
     zorunlu) ve tasarımın tek kutusu bir sadeleştirme. Hedefi seçen kural hook'ta
     (`reviewTargetOf`), gerekçesiyle birlikte.
*/

type Messages = LocalizedCopy<typeof messages>;

/*
  v3'te ölçülmüş, ölçü katmanlarında (`theme/metrics` + `customer-kit/customer-metrics`) henüz
  olmayan duraklar. İki katman da bu etapta yazıya kapalı — customer-metrics'in kendi kuralıyla
  ham değerler komponent gövdesine DAĞITILMADI, ekranın tek yerine kondu; katman yazıya açılınca
  buradakiler oraya terfi eder (raporlandı).
*/
const feedbackMetrics = {
  /* SAPMA — tasarımda teşekkür işareti 88'lik bir daire + 38'lik kalpti (v3:1035) ve o ölçü
     KARTLI yerleşimindi: dar bir etiketin üstünde duran küçük rozet. Kutu kalkıp sayfa
     bütünleşince (kullanıcı kararı 15.08) hiyerarşiyi taşıyan tek şey ÖLÇEK kaldı.
     İki adımda ölçüldü: 148'e büyütülen daire solgun kaldı ve leke gibi okundu; kullanıcı
     *"daha da büyütülebilir ve daha farklı bir görsel de seçilebilir"* dedi. Sonuç: daire ve
     kalp kalktı, yerine tek ve dolu bir işaret geldi. */
  /** Puan yıldızı — sayfanın kahraman işareti, doğrudan zemin üstünde. */
  sparkIcon: 120,
} as const;

/*
  Fotoğraf bloğu (380) ve oy düğmesi (56) `customerMetrics`e TERFİ ETTİ: skeleton da aynı ölçüleri
  istiyor ve bu dosyadan import etmesi dairesel bağımlılık, kopyalaması duplikasyon olurdu (tarif
  ve paket detaylarının aynı gerekçesi).
*/

/**
 * Yazım retlerinin cümlesi — tanınmayan anahtar jenerik cümleye düşer (web'in `errorText` kuralı:
 * ekranda hiçbir hâlde boş bir kırmızı satır durmaz).
 *
 * `review_empty` LİSTEDE YOK ve olmamalı: bu ekran yorumu yalnız boş DEĞİLKEN gönderiyor (hook'un
 * `trim` kapısı), yıldız alanı da tasarımda yok — yani o ret buradan doğamaz. Sözlüğe yazsaydık
 * müşteriye hiç göremeyeceği bir cümleyi vaat etmiş olurduk; gelirse jenerik cümleye düşer.
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

  /* Aşama TÜRETİLİR, ayrıca saklanmaz (şablon `stage` tutuyor; tek kaynak yeter): oysuz kart
     varken oy, kartlar bitince yorum, tamamlama cevabı gelince sonuç. Kartın SIRASI da türetilir —
     hook'un oy haritasındaki ilk boşluk (dosya künyesi). */
  const cards = invite?.cards ?? [];
  const index = cards.findIndex((entry) => votes[entry.productId] === undefined);
  const card = index === -1 ? null : (cards[index] ?? null);
  /* Davet zaten tamamlanmış: akış HİÇ kurulmaz (sapma 7) — puan ikinci kez verilmez. */
  const alreadyDone = invite !== null && invite.completedAt !== null;
  /** Sonuç aşaması — kaydırıcı yalnız BURADA ekranı doldurur (`contentFill` künyesi). */
  const showDone = completion !== null || alreadyDone;

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="feedback-back" />}
      /* Sayaç yalnız oy aşamasında (şablon: `sc-if fv.stage0`) — `min(idx+1, toplam)` kuralı. */
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

  /* İLK YÜK: oy aşamasının yerini skeleton tutar (neyin çizilip neyin çizilmediği o dosyanın
     künyesinde). Başlık çubuğu GERÇEK basılır — içindeki geri düğmesi beklerken de çalışmalı. */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <FeedbackSkeleton testID="feedback-loading" />
      </View>
    );
  }

  /* Geçersiz/eskimiş bağlantı (uç 404 `invalid_link`): davet yok. Şablonda karşılığı yok — sapma 2.
     Ağ arızasından AYRI hâl: "bağlantını kontrol et" demek, eskimiş bir linki tel arızası gibi
     gösterirdi (tarif detayının aynı ayrımı). */
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

  /* Telin arızası — davet duruyor olabilir, o yüzden çıkış değil TEKRAR DENE (sapma 6). */
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

  /* Talep akışını SİPARİŞE bağlayarak açar (şablon: `openTalepNew(o.ref)`); kargosuz senaryoda
     referans yoksa genel talep kapısına düşer. */
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
      {/* Kaydırıcı KİTTEN (`form-scroll`): klavye açıkken "Değerlendirmeyi tamamla"ya ilk dokunuş
          yalnız klavyeyi kapatıyor ve yorum GÖNDERİLMİYORDU — müşteri yazdığını sanıp çıkıyordu
          (cihazda ölçüldü 11.08). Aynı kap yorum alanını da klavyenin üstünde tutar. */}
      <FormScroll
        contentContainerStyle={[styles.content, showDone ? styles.contentFill : undefined]}
        testID="feedback-scroll"
      >
        {card !== null && !alreadyDone ? (
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
            <PrimaryButton
              label={finishing ? t.comment.finishing : t.comment.finish}
              onPress={() => void finish(comment)}
              disabled={finishing}
              testID="feedback-finish"
            />
            {/* Tamamlama düştüyse metin KUTUDA KALIR (talep ekranının kuralı: düşen gönderim
                taslağı silmez) — tek dokunuşla tekrarlanır. */}
            {errorLine}
          </View>
        ) : (
          /* ── Sonuç: kalp + teşekkür + puan kartı + akış-sonu köprüsü (v3:1040-1060) ── */
          <View style={styles.doneBlock} testID="feedback-done">
            {/* SONUÇ SAYFASI KUTUSUZ — kullanıcı kararı 15.08: *"kart görmek istemiyorum… tüm
                sayfayı kullanan… sayfa ekran ile bütünleşik olsun, bölüm bölüm görünmesini
                istemiyorum."* Eskiden puanlar kum zeminli, eğik, sert gölgeli bir ETİKETİN
                içindeydi (v3:1040-1060) ve ekran üç ayrı parçaya bölünüyordu: kalp, başlık, kutu.

                Şimdi hiyerarşi KUTUYLA değil ÖLÇEK ve BOŞLUKLA kuruluyor — zemin ekranın kendi
                zemini, renk kırılması yok, çerçeve yok. Blok ekranın kalan yüksekliğini doldurup
                içeriği dikey ortalıyor (`doneBlock` + `contentFill`), yani sayfa "bir kutunun
                durduğu ekran" değil, teşekkürün kendisi oluyor. */}
            {/* KAHRAMAN İŞARET — daire YOK (kullanıcı kararı 15.08). Solgun zeytin daire 148'e
                büyüyünce şekil değil LEKE gibi okunuyordu ve içindeki kalp boş bir halkanın
                ortasında kalıyordu; ölçek büyüdükçe düşük karşıtlık kusura dönüştü. Artık tek,
                güvenli bir şekil var: puan yıldızı, doğrudan sayfanın zemini üstünde. */}
            <PointsSpark size={feedbackMetrics.sparkIcon} color={theme.colors.terracotta} />
            <Text style={styles.doneTitle} accessibilityRole="header">
              {completion === null ? t.already.title : t.done.title}
            </Text>

            {/* ZATEN TAMAMLANMIŞ davet (sapma 7): puanın daha önce eklendiği söylenir, sonuç
                kutuları çizilmez — bu turda kazanılan bir şey yok ve akış hiç kurulmadı. */}
            {completion === null ? <Text style={styles.doneBody}>{t.already.body}</Text> : null}

            {/* Puan TAMAMLAMAYA bağlıdır, beğeniye değil (DOMAIN §14); 0 → kart çizilmez
                (B2B'de puan yok — şablonun `sc-if fv.ptsF` kapısı).

                YAZILAN SAYI TURUN TOPLAMIDIR (`invitePointsTotal`), tamamlama primi değil (MB-17).
                Ölçüldü 11.08: ekran "+5 puan" diyordu, deftere `feedback_purchase 5` + `review 20`
                + `feedback_purchase 5` = 30 yazılmıştı. Üç kaydın üçü de doğruydu (kart oyu · yorum ·
                tamamlama primi — `packages/application/src/feedback/invite.ts`), eksik olan
                SÖZLEŞMEYDİ: `/vote` ve `/review` yalnız `{ recorded: true }` dönüyor, `/complete`in
                `pointsAwarded`ı da yalnız primi taşıyor. Toplam istemcide HESAPLANAMAZ (günlük tavan ·
                B2B · aynı kayda ikinci puan hep motorun kararı), o yüzden uç açıldı: motor kendi
                defterini toplayıp `invitePointsTotal` olarak dönüyor.

                KAPI DA TOPLAMA BAĞLANDI, prime değil. Eskiden kart `pointsAwarded > 0` kapısındaydı
                ve bunun ölçülmüş bir bedeli vardı: günlük tavan dolduysa ya da davet İKİNCİ kez
                tamamlandıysa prim 0'a düşüyor, müşteri o turda yorum için 20 puan kazanmış olsa bile
                HİÇBİR puan bilgisi görmüyordu. Toplam o hâllerde de doludur.

                BLOK ARTIK KİTİN (kullanıcı isteği 15.08): üç satırın biçimi ve metni
                `customer-kit/points-award.tsx`te — keşif turunun bitişi de aynısını çiziyor. Burada
                kalan tek şey hangi SAYININ geçileceği, ve o bu ekranın bilgisi. */}
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

  /** Yazım reddi — talep ekranının `sendError` deseni (hata rengi + `micro`), akışın ortalanmışı. */
  errorLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.error,
    textAlign: 'center',
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
  },

  /* ── Oy aşaması ── */
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

  /* ── Sonuç aşaması — SAYFANIN TAMAMI, kutusuz ── */
  /** Kaydırıcının içeriği ekranın kalan yüksekliğini DOLDURUR; yalnız sonuç aşamasında eklenir
      (öteki aşamalar içerikleri kadar uzun, zorlanan yükseklik onlarda boşluk üretirdi). */
  contentFill: { flexGrow: 1 },
  doneBlock: {
    flexGrow: 1,
    /* Dikey ORTALAMA sayfayı bütünleşik yapan şeyin kendisi: içerik ekranın ortasında durur,
       üstte bir kutu + altta boşluk diye ikiye bölünmez. */
    justifyContent: 'center',
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
