import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { ORDER_INTENT } from './management-fixture';

/*
  Y6 · WHATSAPP SİPARİŞ NİYETİ (v2:698-714) — bölümün en küçük ekranı: oku, not düş, geç.

  ── UYGULAMADAN SİPARİŞ KURULMAZ ────────────────────────────────────────────
  v1'de kayıt masada kurulur; buradaki tek iş, işin unutulmaması için NOT DÜŞMEKTİR. Ekrana bir
  "sipariş oluştur" düğmesi konmadı — tasarımın kararı bu ve gerekçesi de yazılı (kaynak
  sözlüğünde "whatsapp" hazır, yani masadaki kayıt bu konuşmayla eşleşecek).

  ── "WHATSAPP'TA AÇ" EYLEMSİZ, ÇÜNKÜ NUMARA MASKELİ ─────────────────────────
  Konuşmayı açmak bir `wa.me/<numara>` bağlantısı ister; elimizdeki değer maskelidir (+33 6 12 …
  84) ve maskeden numara üretilemez. Dokunulabilir yapıp yanlış/boş bir sohbet açmak, kullanıcıya
  çalışan bir kapı gibi görünüp onu başka birinin konuşmasına götürebilirdi. Satır tasarımdaki
  yerinde duruyor, ama söz vermiyor.
  BAĞLANMA NOKTASI: gelen kutusu ucu ham numarayı (ya da hazır bir derin bağı) taşıdığı gün bu
  satır `Linking.openURL` ile açılır — o gün maskeli metin ekranda kalır, bağlantı arkada durur.
*/

const t = managementCopy;

export function OrderIntentScreen() {
  const router = useRouter();
  const [noted, setNoted] = useState(false);

  return (
    <View style={styles.screen} testID="management-order-intent">
      <OperationsStackHeader
        title={t.intent.title}
        subtitle={fillCopy(t.intent.caption, { phone: ORDER_INTENT.phoneMasked, ago: ORDER_INTENT.ago })}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-order-intent-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-order-intent-body">
        <View style={styles.bubble}>
          <Text style={styles.bubbleBody}>{ORDER_INTENT.message}</Text>
        </View>
        <Text style={styles.note}>{t.intent.note}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <PressableSurface
          onPress={() => setNoted(true)}
          disabled={noted}
          feedback="shadow"
          style={[styles.cta, noted ? styles.ctaDone : styles.ctaOpen]}
          accessibilityLabel={noted ? t.intent.ctaDone : t.intent.cta}
          testID="management-order-intent-note"
        >
          <Text style={styles.ctaLabel}>{noted ? t.intent.ctaDone : t.intent.cta}</Text>
        </PressableSurface>
        <Text style={styles.openChat}>{t.intent.openChat}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  bubbleBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaOpen: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  ctaDone: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  /** Eylemsiz satır — gerekçe dosya künyesinde (maskeli numaradan bağlantı üretilmez). */
  openChat: {
    paddingVertical: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
});
