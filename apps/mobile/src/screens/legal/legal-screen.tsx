import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { deviceLocale } from '@/lib/i18n/locale';
import { LegalFaq } from './legal-faq';
import {
  isLegalPageKey,
  type LegalNoticeCopy,
  type LegalSectionCopy,
  type Messages,
} from './legal-types';
import messages from './messages.json';

/*
  BİLGİ SAYFALARI (v3 `vStatic`) — TEK ekran, beş belge: teslimat & iade · SSS · gizlilik · satış
  koşulları · yasal bilgiler.

  ── v3'ÜN VERDİĞİ VE VERMEDİĞİ ──────────────────────────────────────────────
  Şablon bu ekranı bir İSKELET olarak çiziyor (v3:1128-1136): yapışkan başlık çubuğu (geri + sayfa
  adı) ve `padding:20px 22px` içinde TEK paragraf. Çubuk ile dolgu buradan BİREBİR alındı. Gövde
  ise gerçekte tek paragraf değil — altı ila on bölüm, madde listeleri ve dokuz soruluk bir SSS.
  Bu yüzden gövdenin dokusu, aynı metnin ÇALIŞAN karşılığından (web `legal-page.mobile.tsx`)
  taşındı; şablona ait bir görsel karar EZİLMEDİ, şablonun boş bıraktığı yer dolduruldu.

  ── METİN NEREDEN ─────────────────────────────────────────────────────────
  `messages.json` webin `legal` klasöründeki beş `content.json` dosyasından ÜRETİLDİ (üç dil, beş
  sayfa) — tek cümle elle yazılmadı. Gerekçe ve terfi ihtiyacı `legal-types.ts` künyesinde.

  ── ŞABLONDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **"Bu sayfada" gezinmesi YOK.** Web mobilde bölüm başlıklarını yatay bir çip dizisine koyup
     çapaya kaydırıyor. RN'de çapa diye bir şey yok: her bölümün yerini ölçüp `scrollTo` yazmak
     gerekirdi ve v3 böyle bir öğe ÇİZMİYOR. Ölçülmemiş bir etkileşimi uydurmaktansa bölümler
     baştan sona açık duruyor; ihtiyaç raporlandı.
  2. **Son güncelleme satırı BAŞLIĞIN ALTINDA, gövdenin ilk satırı olarak.** Şablonun çubuğunda
     yalnız ad var ve oraya ikinci bir satır sıkıştırmak 40 dp'lik çubuğu bozardı. Satırın kendisi
     atlanamazdı: hukuki metinde hangi sürüme bakıldığı görünmeli (web `legal-types` künyesi).
  3. **Tarih sözlükte BİÇİMLENMİŞ duruyor** ("1 Temmuz 2026"), ISO + biçimleyici değil. Webin
     `formatOrderDate`i `apps/web`te yaşıyor ve `@lezzet/helper`a terfi etmedi; altı satırlık bir
     `Intl` sarmalayıcısını mobilde ikinci kez yazmak, para biçiminde bir kez yaşanan ayrışmanın
     (helper `format.ts` künyesi) aynısını tarihte açardı. Tarih zaten metinle birlikte değişen bir
     içerik; sözlükte metnin yanında duruyor. Terfi ihtiyacı raporlandı.
*/

interface LegalScreenProps {
  /** Rota parametresi — SERBEST metin; tanınmayan değer "bu sayfa yok" bloğuna düşer. */
  page: string;
}

export function LegalScreen({ page }: LegalScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const router = useRouter();

  const bar = (
    <AppBar
      title={isLegalPageKey(page) ? t.pages[page].title : t.missing.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="legal-back" />}
      testID="legal-appbar"
    />
  );

  /* Kırık bağlantı SESSİZ kalmaz: boş bir ekran, hatanın kendisini görünmez yapardı. Çıkış SSS —
     buraya belirli bir soruyla gelen ziyaretçinin gidebileceği tek genel kapı odur. */
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

  return (
    <View style={styles.screen}>
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="legal-content">
        <Text style={styles.updated}>{t.updatedAt}</Text>

        {copy.sections.map((section) => (
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
 * Çıkış bandı — "statik sayfa çıkmaz sokak olmamalı".
 *
 * ROTALANAMAYAN hedef düz metne düşer, gizlenmez: cümlenin yarısını yutmak, okuyanın eksik bir
 * yönlendirme okuması demekti. Bugün sözlükteki hedeflerin hepsi rotalanıyor; dal, sözlüğe yarın
 * yeni bir ad girerse ekranın sessizce boş bir bağlantı çizmemesi için var.
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
  /* v3: `padding:20px 22px` — dolgu ölçekten AYNEN (5xl · 6xl). Alt nefes cihazın kendi
     inset'iyle büyür; uzun hukuk metninin son satırı gövde çubuğunun altında kalmasın. */
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
  /* v3 gövdesi: `400 14px/1.7 'Karla'` · `#6d7261`. Ölçü ve renk birebir (`body-sm` · `body`);
     satır aralığı ölçekte 1,7 durağı olmadığı için 1,6'ya (`lead--line-height`) çekildi —
     token paketine yeni bir durak açmak bu şeridin yazma alanı dışında, ihtiyaç raporlandı. */
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
