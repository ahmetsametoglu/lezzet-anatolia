import type { LocalizedCopy } from '@lezzet/i18n';
import type { MePointsEarnWayKey } from '@lezzet/types';
import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { PointsRules } from '@/lib/api/points';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import messages from './points-earn-messages.json';
import { formatCompactEuro } from '@lezzet/helper';

/*
  Puan kazanma yollarının anlatımı, üç yüzeyin ortak bileşeni (onboarding'in son adımı, hesap ekranının puan kartı, "Nasıl puan
  kazanırım?" çekmecesi): üçü aynı programı anlatır ve ayrı yazılsa bir ödül değiştiğinde biri unutulurdu. Puanlar sunucudan gelir,
  para karşılığı burada hesaplanır; tanınmayan anahtar sessizce düşer, çünkü eski sürüm yarının anahtarını tanımaz ve çizmemek
  çökmekten iyidir.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Her yol kendi ikonunu alır, çünkü hepsi aynı simgeyle çizilseydi liste bir renk lekesine dönerdi. Renk ödülün türünü söyler: davet
 * ödülleri terracotta, kendi başına yapılanlar zeytin.
 */
function iconOf(key: MePointsEarnWayKey, size: number, invited: string, own: string): ReactElement {
  const icons: Record<MePointsEarnWayKey, ReactElement> = {
    referral: <Icon name="share" size={size} color={invited} />,
    neighbor: <Icon name="home" size={size} color={invited} />,
    review: <Icon name="orders" size={size} color={own} />,
    /* Ziyaretin ikonu tekrar oku, onay işareti değil: tik "bugün alındı" durumuna ayrılmış, ikon "bu ne" der; dairesel ok ödülün
       her gün tekrarladığını söyler. */
    visit: <Icon name="refresh" size={size} color={own} />,
    feedback_purchase: <CustomerIcon name="star" size={size} color={own} />,
    feedback_candidate: <Icon name="search" size={size} color={own} />,
  };
  return icons[key];
}

/**
 * Düğme yalnız bazı yollarda, bu yüzden `Partial`: `visit` kendiliğinden yazılır, `feedback_purchase` teslim edilmiş siparişin
 * ekranında yapılır ve onlara düğme koymak basınca hiçbir şey olmayan bir yüzey olurdu.
 */
export type PointsEarnActions = Partial<Record<MePointsEarnWayKey, () => void>>;

interface PointsEarnListProps {
  rules: PointsRules;
  /**
   * Bugünkü ziyaret puanı alındı mı; verilmezse durum hiç çizilmez, çünkü bileşeni misafir de görür ve onun "bugün aldın mı" diye
   * bir hâli yoktur.
   */
  visitClaimedToday?: boolean;
  /** Verilmezse liste düğmesiz çizilir (onboarding: müşterinin daha hesabı yok). */
  actions?: PointsEarnActions;
  /**
   * Çevrim kuralı (oran satırı ve dipnotlar) çizilsin mi. Bileşen başlık taşımaz, çünkü başlık her zaman çağıranındır ve ikisi üst
   * üste binerdi.
   */
  showRules?: boolean;
  testID?: string;
}

export function PointsEarnList({ rules, actions, showRules = false, visitClaimedToday, testID }: PointsEarnListProps): ReactElement {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();

  const known = (key: string): key is MePointsEarnWayKey => key in t.ways;

  return (
    <View style={styles.list} testID={testID}>
      {showRules ? (
        <Text style={styles.rate}>
          {t.rate
            .replace('{points}', String(rules.redeem.minimumPoints))
            .replace('{value}', formatCompactEuro(rules.redeem.valueCents, locale))}
        </Text>
      ) : null}

      {rules.earnWays.filter((way) => known(way.key)).map((way) => {
        const copy = t.ways[way.key];
        const action = actions?.[way.key];
        /* Bugün alındı işareti yalnız ziyaret satırında, çünkü öteki yolların günlük hakkı yok; `=== true`, çünkü prop verilmezse
           bilmemek "alınmadı" sayılmaz. */
        const claimed = way.key === 'visit' && visitClaimedToday === true;
        return (
          <View key={way.key} style={styles.row} testID={`points-earn-${way.key}`}>
            <View style={styles.icon}>{iconOf(way.key, theme.size.inlineIcon, theme.colors.terracotta, theme.colors['olive-dark'])}</View>
            {/* Tek sütun: başlık, altında ödül rozeti ve sıklık, sonra tam genişlikte açıklama, çünkü sabit genişlikli bir sütun
                uzunluğu bilinmeyen metni taşıyamaz. Puan ile para aynı rozette, para parantez içinde (`+500 (5 €)`), çünkü ikisi eşit
                değil, biri ötekinin karşılığı. */}
            <View style={styles.body}>
              <View style={styles.titleLine}>
                <Text style={styles.title}>{copy.title}</Text>
                {/* İşaret başlığın yanında, satırın sonunda değil: sağa yaslanmış bir tik uzun başlıklarda metinden kopar ve hangi
                    satıra ait olduğu sorulurdu. */}
                {claimed ? (
                  /* İşaretin kendi test kimliği var, çünkü sıklık metni sözlük anahtarıyla korunuyor ama ikon değil: işareti kümeye yayan
                     bir yazım metinde görünmez, yalnız ikonda görünür. */
                  <View testID={`points-earn-${way.key}-claimed`}>
                    <CustomerIcon name="check" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
                  </View>
                ) : null}
              </View>
              <View style={styles.rewardLine}>
                <Text style={styles.rewardBadge}>
                  +{way.points} ({formatCompactEuro(way.points * rules.centValue, locale)})
                </Text>
                {/* `{max}` yalnız komşu satırında geçer ama değişim koşulsuz uygulanır, yoksa "hangi satır hangi yer tutucuyu bilir"
                    diye ikinci bir eşleme doğardı. Sıklık metni duruma göre değişir: "günde bir" kuraldır, "bugün alındı" olay. */}
                <Text style={styles.cadence}>
                  {claimed && 'claimedToday' in copy
                    ? copy.claimedToday
                    : copy.cadence.replace('{max}', String(rules.neighborMaxUses))}
                </Text>
              </View>
              <Text style={styles.description}>{copy.body}</Text>
              {action === undefined || !('cta' in copy) ? null : (
                <TextAction label={copy.cta} onPress={action} testID={`points-earn-${way.key}-cta`} />
              )}
            </View>
          </View>
        );
      })}

      {showRules ? (
        <View style={styles.footnotes}>
          <Text style={styles.footnote}>
            {t.footnote
              .replace('{threshold}', String(rules.redeem.minimumPoints))
              .replace('{value}', formatCompactEuro(rules.redeem.valueCents, locale))}
          </Text>
          {/* Davet ödülünün beklemesi burada söylenir: puan davet anında değil davet edilenin parası alındığında yazılır, söylenmezse
              müşteri "paylaştım, puan gelmedi" diye okurdu. */}
          <Text style={styles.footnote}>{t.paidNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { gap: theme.space['2xl'] },
  /* Kademe: satır başlığı ve ödül rozeti `body` (15), açıklama, koşul ve dipnot `body-sm` (14); müşterinin karar için okuduğu metin
     14'ün altına inmez ve hiyerarşi boyutla değil ağırlık ve renkle kurulur. */
  rate: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.terracotta,
  },
  /* Başlık + işaret aynı hizada; işaret başlığın SONUNA yapışır, satırın sonuna değil. */
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  icon: { paddingTop: theme.space['2xs'] },
  body: { flex: 1, gap: theme.space['2xs'] },
  title: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  /* İçerik metni `body-sm` (14), `helper` değil: müşteri ödülün kuralını buradan okur, bu ekranın asıl içeriği. */
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Ödül satırı: rozet ve sıklık yan yana ama saran (`wrap`), uzun sıklık rozetin altına geçer; sabit genişlik yok, çünkü uzunluğu
     bilinmeyen metne kutu biçilemez. */
  rewardLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    marginTop: theme.space['2xs'],
    marginBottom: theme.space['2xs'],
  },
  /* Rozet — ödülün KENDİSİ, başlığın rakibi değil cevabı. Kartın zemininden ayrılsın diye kum
     dolgu; `overflow:hidden` yarıçapın Android'de kesmesi için (kitin fiyat rozetiyle aynı desen). */
  rewardBadge: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    overflow: 'hidden',
  },
  /* Sıklık rozetin yanında ve sessiz, çünkü ödülün kendisi değil koşulu; `flex: 1` yok, çünkü dikey kapta yüksekliği sıfıra
     düşürür. `body-sm` (14), çünkü müşteri kaç kez kazanacağını buradan okur. */
  cadence: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  footnotes: { gap: theme.space.md },
  /* Dipnot da `body-sm`: ikisi de KURAL taşıyor — çevrim eşiği ve "ödül ödeme alınınca yazılır".
     İkincisi olmadan müşteri "paylaştım, puan gelmedi" diye okur; kuralı 13 pikselde saklamak,
     onu söylememeye yakın durur. */
  footnote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
}));
