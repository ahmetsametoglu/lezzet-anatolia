import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { SUPPLY_GROUP, UNMAPPED_SUPPLY } from './management-fixture';

/*
  Y4 · TEDARİK ÖNERİSİ (v2:635-662) — azalan stok listesi ve TASLAK tedarik siparişi.

  ── SİSTEM TEDARİKÇİYE BİR ŞEY GÖNDERMEZ ────────────────────────────────────
  Onay yalnız TASLAĞI kurar; gönderim (WhatsApp/PDF) insanın işidir ve referans (TS-26-…) gönderim
  anında doğar. Ekranda bir "gönder" düğmesi YOK — olmayan bir otomasyonu vaat etmemek tasarımın
  kendi kararı.

  ── EŞLENMEMİŞ GRUP GİZLENMEZ ───────────────────────────────────────────────
  Tedarikçisi eşlenmemiş varyant listede DURUR ama sipariş açamaz: "göremediğin eksik, sipariş
  edilmeyen eksiktir". Blok sönük değil AÇIK bir cümleyle kapalı — ne yapılacağı da yazıyor
  ("önce masada tedarikçi eşleyin").
  TASARIMDAN TEK SAPMA: v2 bu bloğu `opacity:.65` ile söndürüyor; ölçekte 0,65 durağı YOK ve ham
  bir sayı yazmak token disiplinini delerdi (CLAUDE §3). Blok zaten muted/kırmızı metinle sönük
  okunuyor; durak ihtiyacı raporlandı.

  BAĞLANMA NOKTASI: öneri listesi azalan-stok okumasından, onay ise taslak TS yazma ucundan gelir.
*/

const t = managementCopy;

export function SupplySuggestionScreen() {
  const router = useRouter();
  const [drafted, setDrafted] = useState(false);
  const group = SUPPLY_GROUP;

  return (
    <View style={styles.screen} testID="management-supply-suggestion">
      <OperationsStackHeader
        title={t.supply.title}
        subtitle={t.supply.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-supply-suggestion-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-supply-suggestion-body">
        <View style={styles.group}>
          <Text style={styles.groupTitle}>
            {fillCopy(t.supply.group, { supplier: group.supplier, reference: group.reference })}
          </Text>

          {group.lines.map((line) => (
            <View key={line.id} style={styles.line} testID={`management-supply-${line.id}`}>
              <View style={styles.lineHead}>
                <Text style={styles.lineName}>{line.name}</Text>
                <Text style={styles.lineSuggested}>{`+${line.suggested}`}</Text>
              </View>
              <Text style={styles.lineMeta}>
                {fillCopy(t.supply.row, {
                  current: String(line.current),
                  threshold: String(line.threshold),
                  lastPurchase: money(line.lastPurchaseCents),
                })}
              </Text>
              {line.elsewhere === undefined ? null : (
                <Text style={styles.lineElsewhere}>{fillCopy(t.supply.elsewhere, { where: line.elsewhere })}</Text>
              )}
            </View>
          ))}

          <PressableSurface
            onPress={() => setDrafted(true)}
            disabled={drafted}
            feedback="shadow"
            style={[styles.cta, drafted ? styles.ctaDone : styles.ctaOpen]}
            accessibilityLabel={drafted ? t.supply.ctaDone : t.supply.cta}
            testID="management-supply-cta"
          >
            <Text style={styles.ctaLabel}>{drafted ? t.supply.ctaDone : t.supply.cta}</Text>
          </PressableSurface>

          <Text style={styles.note}>{t.supply.note}</Text>
        </View>

        <View style={styles.unmapped} testID="management-supply-unmapped">
          <Text style={styles.unmappedTitle}>
            {fillCopy(t.supply.unmapped.title, { n: String(UNMAPPED_SUPPLY.variantCount) })}
          </Text>
          <Text style={styles.unmappedLine}>{UNMAPPED_SUPPLY.line}</Text>
          <Text style={styles.unmappedBlocked}>{t.supply.unmapped.blocked}</Text>
        </View>
      </ScrollView>
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
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['3xl'],
  },
  group: {
    gap: operationsTheme.space.xs,
  },
  groupTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  line: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  lineHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  lineName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  /** Önerilen adet ZEYTİN: eklenen mal, eksilen değil (v2:645). */
  lineSuggested: {
    // v2: `800 13.5px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.olive,
  },
  lineMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Başka depodaki mal DEPO tonunda: transferin ham verisi, kararı değil (v2:647). */
  lineElsewhere: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.warehouse,
  },
  cta: {
    height: operationsTheme.size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: operationsTheme.space.md,
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
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  unmapped: {
    gap: operationsTheme.space.xs,
  },
  unmappedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
  unmappedLine: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  /** Kapalı kapı KIRMIZI ve GEREKÇELİ: ne olduğu değil, ne yapılacağı yazıyor (v2:659). */
  unmappedBlocked: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
});
