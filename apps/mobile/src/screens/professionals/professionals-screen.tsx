import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { emToDp } from '@/theme/parse';
import { ApplicationForm } from './application-form';
import type { Messages } from './professionals-types';
import messages from './messages.json';

/*
  PROFESYONEL BAŞVURUSU (v3 `vPro`) — vitrindeki davet kutusunun hedefi.

  İKİ HÂL, şablonun kendi ayrımı: `pr.notSent` (tanıtım + üç adım + form + WhatsApp satırı) ve
  `pr.sent` (ortalanmış onay bloğu). Onay hâli gövdenin TAMAMINI değiştirir — tanıtım da düşer,
  çünkü başvurmuş birine "başvurun" demenin anlamı yok (v3:66-73).

  Formun kendisi ve gönderim ucunun eksikliği `application-form.tsx` künyesinde
  (**BEKLEYEN(21.14)** — B2B uçları `apps/mobile-api`de bugün yok).

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Onay bloğu kitin `EmptyState`i.** v3'ün ölçüleri (`padding:70px 32px`, ortalanmış ikon ·
     başlık · gövde · hap düğme) kitin boş durumuyla zaten aynı iskelet; ikinci bir ortalanmış
     blok yazmak aynı yerleşimin ikinci kopyası olurdu. Başlık kitin kademesinde (18) kalıyor,
     şablonun 22'sinde değil — ekran başlığı kademesi kite ait bir karar.
  2. **İkon zarf, kâğıt uçak değil.** v3 bir kâğıt uçak çiziyor; o geometri ne kitin sözlüğünde
     ne müşteri tamamlayıcısında var ve ikisi de bu şeridin yazma alanı dışında. Zarf hem mevcut
     hem cümlenin kendisiyle aynı şeyi söylüyor ("sonucu e-posta ile bildireceğiz"); webin onay
     kartı da zarf kullanıyor (📨). İhtiyaç raporlandı.
  3. **WhatsApp satırı sohbeti AÇMAZ, "çok yakında" der.** Numara `@lezzet/brand`te ve o paket
     `apps/mobile`ın bağımlılığı değil; uydurma bir numaraya bağlantı kurmaktansa giriş ekranının
     kurulu davranışı tekrarlandı (`login-screen` WhatsApp düğmesi — web'le de aynı bilgi).
     Mesaj v3'ün kendi toast'ıyla veriliyor (v3:854 `pr.wa`).
*/

export function ProfessionalsScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [sent, setSent] = useState(false);

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="pro-back" />}
      testID="pro-appbar"
    />
  );

  if (sent) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<CustomerIcon name="mail" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
          title={t.sent.title}
          description={t.sent.body}
          action={
            /* Çıkış KATALOG, hesap değil: onay gelene kadar yapılabilecek şey alışverişe devam
               etmek — ve perakende fiyatla gezilebildiği hemen üstteki cümlede yazılı. */
            <PrimaryButton
              label={t.sent.cta}
              shape="pill"
              onPress={() => router.push('/catalog')}
              testID="pro-sent-cta"
            />
          }
          testID="pro-sent"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="pro-form">
        {/* Tanıtım kartı — v3'ün mürekkep bloğu: üstbaşlık · vaat · gerekçe. */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t.hero.eyebrow}</Text>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero.title}
          </Text>
          <Text style={styles.heroBody}>{t.hero.body}</Text>
        </View>

        {/* Üç adım — numara dairesi, sıranın kendisi bilgi taşıdığı için ekran okuyucuya da gider. */}
        <View style={styles.steps}>
          {t.steps.map((step, index) => (
            <View key={step} style={styles.stepRow} accessible accessibilityLabel={`${index + 1}. ${step}`}>
              <View style={styles.stepDot}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.stepLabel}>{step}</Text>
            </View>
          ))}
        </View>

        <ApplicationForm t={t} onSubmitted={() => setSent(true)} />

        <PressableSurface
          onPress={() => publishToast(t.whatsappSoon)}
          feedback="opacity"
          style={styles.whatsappRow}
          accessibilityLabel={t.whatsapp}
          testID="pro-whatsapp"
        >
          <Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors['brand-whatsapp-pure']} />
          <Text style={styles.whatsappLabel}>{t.whatsapp}</Text>
        </PressableSurface>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  /* v3: `padding:18px` · `gap:16px` — ikisi de ölçekten aynen (4xl · 3xl). */
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },

  /* v3: mürekkep zemin · `radius:20` · `padding:22px 20px` · `gap:10`. */
  hero: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['6xl'],
    paddingHorizontal: theme.space['5xl'],
    gap: theme.space.lg,
  },
  heroEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // Harf aralığı token'da `em`; dp'ye çeviri tek yerde (`theme/parse`), ham çarpan yazılmaz.
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    textTransform: 'uppercase',
    color: theme.colors['accent-leaf'],
  },
  heroTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    lineHeight: theme.text['h2-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors['sand-50'],
  },
  heroBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['on-image-soft'],
  },

  /* v3: satırlar `gap:8`, satır içi `gap:10`, daire 26 zeytin zeminli. */
  steps: {
    gap: theme.space.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  stepDot: {
    width: theme.size.markBox,
    height: theme.size.markBox,
    borderRadius: theme.size.markBox / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['olive-bg'],
  },
  stepNumber: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  stepLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },

  whatsappRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.xs,
  },
  whatsappLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },
}));
