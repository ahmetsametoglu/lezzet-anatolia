import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { deliveryTermsLines } from '@lezzet/helper';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { useDeliveryTerms } from '@/screens/customer-kit/use-delivery-terms.hook';
import { LegalFaq } from './legal-faq';
import {
  isLegalPageKey,
  LEGAL_MESSAGES,
  type LegalNoticeCopy,
  type LegalSectionCopy,
  type Messages,
} from './legal-types';

/*
  Bilgi sayfaları: tek ekran, beş belge. Son güncelleme satırı gövdenin ilk satırıdır, çünkü hukuki
  metinde hangi sürüme bakıldığı görünmeli ve tasarımın başlık çubuğunda ikinci satıra yer yok.
*/

interface LegalScreenProps {
  /** Rota parametresi — SERBEST metin; tanınmayan değer "bu sayfa yok" bloğuna düşer. */
  page: string;
}

export function LegalScreen({ page }: LegalScreenProps) {
  const locale = useAppLocale();
  const t: Messages = LEGAL_MESSAGES[locale];
  const router = useRouter();
  /* KOŞULSUZ çağrı: aşağıda "bu sayfa yok" erken dönüşü var ve hook ondan sonra çağrılamaz.
     Bedeli yok — yalnız teslimat sayfası okuyor, ötekiler cevabı hiç kullanmıyor. */
  const terms = useDeliveryTerms();

  const bar = (
    <AppBar
      title={isLegalPageKey(page) ? t.pages[page].title : t.missing.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="legal-back" />}
      testID="legal-appbar"
    />
  );

  /* Kırık bağlantı sessiz kalmaz, çünkü boş ekran hatayı görünmez yapardı. Çıkış SSS: belirli bir soruyla gelenin gidebileceği tek genel kapı. */
  if (!isLegalPageKey(page)) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          title={t.missing.title}
          description={t.missing.body}
          action={
            <PrimaryButton
              label={t.missing.cta}
              shape="pill"
              onPress={() => router.replace({ pathname: '/legal/[page]', params: { page: 'faq' } })}
              testID="legal-missing-cta"
            />
          }
          testID="legal-missing"
        />
      </View>
    );
  }

  const copy = t.pages[page];

  /**
   * Tutarlar metinden değil ayardan gelir: operatör ayarı değiştirince sayfa eski sayıyı ilan etmesin.
   * Ayar okunamazsa yalnız tutar bölümü tek cümleye iner, kuralları anlatan kısım etkilenmez.
   */
  const sections =
    page !== 'delivery'
      ? copy.sections
      : [
          ...t.pages.delivery.sections.slice(0, -2),
          {
            heading: t.pages.delivery.amounts.heading,
            paragraphs:
              terms.status === 'ready'
                ? [...deliveryTermsLines(terms.terms, t.pages.delivery.amounts, locale), t.pages.delivery.amounts.note]
                : [t.pages.delivery.amounts.unavailable],
            bullets: [],
          },
          ...t.pages.delivery.sections.slice(-2),
        ];

  return (
    <View style={styles.screen}>
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="legal-content">
        <Text style={styles.updated}>{copy.updatedAt}</Text>

        {sections.map((section) => (
          <LegalSection key={section.heading} section={section} />
        ))}

        {copy.questions.length === 0 ? null : (
          <LegalFaq questions={copy.questions} t={t} onWriteToUs={() => router.push('/support/new')} />
        )}

        {copy.notice.text.length === 0 ? null : <LegalNotice notice={copy.notice} />}
      </ScrollView>
    </View>
  );
}

interface LegalSectionProps {
  section: LegalSectionCopy;
}

/** Bir bölüm: başlık · paragraflar · (varsa) madde listesi. */
function LegalSection({ section }: LegalSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {section.heading}
      </Text>
      {section.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
      {section.bullets.map((bullet) => (
        <View key={bullet} style={styles.bulletRow}>
          {/* İm ekran okuyucudan gizli: "madde" bilgisini işaretin kendisi değil satırın metni taşır. */}
          <Text style={styles.bulletMark} accessibilityElementsHidden importantForAccessibility="no">
            ·
          </Text>
          <Text style={styles.bullet}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

interface LegalNoticeProps {
  notice: LegalNoticeCopy;
}

/**
 * Çıkış bandı: statik sayfa çıkmaz sokak olmamalı. Rotalanamayan hedef gizlenmez, düz metne düşer;
 * cümlenin yarısını yutmak eksik bir yönlendirme okuturdu.
 */
function LegalNotice({ notice }: LegalNoticeProps) {
  const router = useRouter();

  const follow = (target: string): (() => void) | null => {
    if (target === 'support') return () => router.push('/support/new');
    if (target === 'account') return () => router.push('/account');
    if (isLegalPageKey(target)) return () => router.push({ pathname: '/legal/[page]', params: { page: target } });
    return null;
  };

  return (
    <View style={styles.notice} testID="legal-notice">
      <Text style={styles.noticeText}>{notice.text}</Text>
      <View style={styles.noticeLinks}>
        {notice.links.map((link) => {
          const onPress = follow(link.target);

          return onPress === null ? (
            <Text key={link.target} style={styles.noticeText}>
              {link.label}
            </Text>
          ) : (
            <TextAction
              key={link.target}
              label={link.label}
              onPress={onPress}
              testID={`legal-notice-${link.target}`}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  /* Alt nefes cihazın kendi inset'iyle büyür; uzun hukuk metninin son satırı gövde çubuğunun altında kalmasın. */
  content: {
    paddingVertical: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['6xl'],
  },
  updated: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },

  section: {
    gap: theme.space.lg,
  },
  heading: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  /* Tasarımın 1,7 satır aralığı ölçekte yok; en yakın durak 1,6 (`lead--line-height`). */
  paragraph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  bulletMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.olive,
  },
  bullet: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  notice: {
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['4xl'],
    paddingHorizontal: theme.space['5xl'],
    gap: theme.space.lg,
  },
  noticeText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  noticeLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space['5xl'],
  },
}));
