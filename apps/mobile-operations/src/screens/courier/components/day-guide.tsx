import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy } from '../copy';

const t = courierCopy;

/** Araç boşken gövde bir seçim değil bir rehberdir: kurye günün nasıl kurulduğunu (seç, yükle, başlat) burada okur ve seçime düğmeyle geçer. */
export function DayGuide() {
  return (
    <View style={styles.guide} testID="courier-day-guide">
      <Text style={styles.guideTitle}>{t.day.vanEmpty.title}</Text>
      <Text style={styles.guideBody}>{t.day.vanEmpty.body}</Text>
      <View style={styles.guideRule} />
      {[t.day.vanEmpty.step1, t.day.vanEmpty.step2, t.day.vanEmpty.step3].map((step, index) => (
        <View key={step} style={styles.guideStep}>
          <Text style={styles.guideNo}>{index + 1}</Text>
          <Text style={styles.guideLabel}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  guide: {
    marginTop: operationsTheme.space['2xl'],
    padding: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.lg,
  },
  guideTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.ink,
  },
  guideBody: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  guideRule: { height: 1, backgroundColor: operationsTheme.colors['neutral-bg'] },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  /* Numaralar yuvarlak kabında durur, çünkü adımlar bir liste değil bir sıradır. */
  guideNo: {
    width: operationsTheme.space['7xl'],
    height: operationsTheme.space['7xl'],
    borderRadius: operationsTheme.space['7xl'] / 2,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: operationsTheme.space['7xl'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  guideLabel: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
});
