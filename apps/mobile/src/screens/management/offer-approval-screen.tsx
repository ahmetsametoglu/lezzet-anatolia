import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { centsToAmountText, money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { OFFER_CANDIDATES } from './management-fixture';

/*
  Y3 · YAKIN-SKT KAMPANYA ONAYI (v2:612-633) — D3'ün aday listesi burada teklife dönüşür.

  Depo (D3) listeyi GÖRÜR ama karar vermez (o ekranın künyesi: "işaretleme yok"); karar bu ekranda,
  yönetimde verilir. İki ayrı ekranın aynı partileri göstermesi bir kopya değil, yetkinin bölünmesi.

  ── İKİ DÜZENLEME, İKİSİ DE GERİ ALINABİLİR ─────────────────────────────────
  · Satır listeden çıkarılır (✕) ve geri alınır (+). Çıkarılan parti SİLİNMEZ — aday listesinde
    kalır, yarınki turda yeniden önerilir (tasarımın kendi notu). O yüzden satır ekrandan
    kaybolmuyor, soluyor ve üstü çiziliyor: "bugün değil" ile "bir daha asla" aynı şey değil.
  · Fiyat düzeltilir. Motorun önerisi alt satırda AYNEN durur, yani operatör neyi değiştirdiğini
    görür.

  ── BOŞ GİRDİ SIFIR DEĞİLDİR ────────────────────────────────────────────────
  Alan metin taşır; ayrıştırma `parseAmountToCents` ile yapılır ve boş/bozuk girdi `null` döner
  (CLAUDE §1). Böyle bir satır teklife açılamaz — CTA onu saymaz ve satır kendini "fiyat bekliyor"
  diye gösterir. Sıfıra düşürmek, bedava satılan bir parti demekti.

  BAĞLANMA NOKTASI: aday listesi D3'ün okumasından, onay ise teklif yazma ucundan gelir; ekranın
  durumu (çıkarılanlar + düzeltilmiş fiyatlar) o gün istek gövdesi olur.
*/

const t = managementCopy;

export function OfferApprovalScreen() {
  const router = useRouter();
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(OFFER_CANDIDATES.map((candidate) => [candidate.id, centsToAmountText(candidate.suggestedCents)])),
  );
  const [opened, setOpened] = useState(false);

  /** Teklife açılabilir satır: listede duruyor VE okunabilir bir fiyatı var. */
  const openable = OFFER_CANDIDATES.filter(
    (candidate) => removed[candidate.id] !== true && parseAmountToCents(prices[candidate.id] ?? '') !== null,
  );

  return (
    <View style={styles.screen} testID="management-offer-approval">
      <OperationsStackHeader
        title={t.offer.title}
        subtitle={t.offer.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-offer-approval-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-offer-approval-body">
        {OFFER_CANDIDATES.map((candidate) => {
          const isRemoved = removed[candidate.id] === true;
          return (
            <View
              key={candidate.id}
              style={[styles.row, isRemoved ? styles.rowRemoved : undefined]}
              testID={`management-offer-${candidate.id}`}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, isRemoved ? styles.rowTitleRemoved : undefined]}>{candidate.name}</Text>
                <Text style={styles.rowMeta}>
                  {fillCopy(t.offer.row, {
                    batch: candidate.batchCode,
                    qty: String(candidate.qty),
                    days: String(candidate.days),
                    suggested: money(candidate.suggestedCents),
                  })}
                </Text>
              </View>

              {isRemoved ? null : (
                <TextInput
                  value={prices[candidate.id] ?? ''}
                  onChangeText={(value) => setPrices((current) => ({ ...current, [candidate.id]: value }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={fillCopy(t.offer.priceLabel, { name: candidate.name })}
                  style={styles.priceInput}
                  testID={`management-offer-price-${candidate.id}`}
                />
              )}

              <PressableSurface
                onPress={() => setRemoved((current) => ({ ...current, [candidate.id]: !isRemoved }))}
                feedback="scale-small"
                compact
                style={styles.toggle}
                accessibilityLabel={isRemoved ? t.offer.restore : t.offer.remove}
                testID={`management-offer-toggle-${candidate.id}`}
              >
                <Text style={isRemoved ? styles.toggleRestore : styles.toggleRemove}>{isRemoved ? '+' : '✕'}</Text>
              </PressableSurface>
            </View>
          );
        })}

        <Text style={styles.footnote}>{t.offer.footnote}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <PressableSurface
          onPress={() => setOpened(true)}
          disabled={opened || openable.length === 0}
          feedback="shadow"
          style={[styles.cta, opened || openable.length === 0 ? styles.ctaClosed : styles.ctaOpen]}
          accessibilityLabel={
            opened
              ? t.offer.ctaDone
              : openable.length === 0
                ? t.offer.ctaEmpty
                : fillCopy(t.offer.cta, { n: String(openable.length) })
          }
          testID="management-offer-cta"
        >
          <Text style={styles.ctaLabel}>
            {opened
              ? t.offer.ctaDone
              : openable.length === 0
                ? t.offer.ctaEmpty
                : fillCopy(t.offer.cta, { n: String(openable.length) })}
          </Text>
        </PressableSurface>
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  /** Çıkarılan satır SOLUR ama durur — "bugün değil" ile "bir daha asla" ayrı şeyler (v2:620). */
  rowRemoved: {
    opacity: operationsTheme.soldOutOpacity,
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  rowTitleRemoved: {
    textDecorationLine: 'line-through',
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** v2:622 — 72 dp genişlik. Ölçü `size`+`space`ten türer (adet kutusuyla aynı desen). */
  priceInput: {
    width: operationsTheme.size.avatarLg + operationsTheme.space['3xl'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.md,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    textAlign: 'right',
    // v2: `800 14px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  toggle: {
    width: operationsTheme.size.stepButton,
    height: operationsTheme.size.stepButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
  },
  toggleRemove: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.error,
  },
  toggleRestore: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.xl,
  },
  footer: {
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
  ctaClosed: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
});
