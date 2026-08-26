import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { SupplyGroup } from '@lezzet/types';
import { managementCopy } from './copy';
import { supplyGroupKey, useSupply } from './use-supply.hook';

/*
  Y4 · TEDARİK ÖNERİSİ (v2:635-662) — azalan stok listesi ve TASLAK tedarik siparişi.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  Öneri `ReorderService`ten (eşik depo bazlı · yoldaki düşülmüş · koli katına yuvarlı); onay
  taslak TS yazar ve kalem listesi GÖNDERİLMEZ — sunucu öneriyi onay anında tazeler. `no_suggestion`
  cevabı "ekran bayattı" demektir: liste yeniden okunur, grup kendiliğinden düşer.

  ── SİSTEM TEDARİKÇİYE BİR ŞEY GÖNDERMEZ ────────────────────────────────────
  Onay yalnız TASLAĞI kurar; gönderim (WhatsApp/PDF) insanın işidir ve referans (TS-26-…) gönderim
  anında doğar. Ekranda bir "gönder" düğmesi YOK — olmayan bir otomasyonu vaat etmemek tasarımın
  kendi kararı.

  ── EŞLENMEMİŞ GRUP GİZLENMEZ ───────────────────────────────────────────────
  Tedarikçisi eşlenmemiş varyant listede DURUR ama sipariş açamaz: "göremediğin eksik, sipariş
  edilmeyen eksiktir". Blok sönük değil AÇIK bir cümleyle kapalı — ne yapılacağı da yazıyor
  ("önce masada tedarikçi eşleyin").
*/

const t = managementCopy;

export function SupplySuggestionScreen() {
  const router = useRouter();
  const supply = useSupply();
  const { state } = supply;

  return (
    <View style={styles.screen} testID="management-supply-suggestion">
      <OperationsStackHeader
        title={t.supply.title}
        subtitle={t.supply.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-supply-suggestion-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="management-supply-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: supply.retry }}
            testID="management-supply-error"
          />
        </View>
      ) : state.groups.length === 0 ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.supply.empty.title}
            description={t.supply.empty.body}
            testID="management-supply-empty"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} testID="management-supply-suggestion-body">
          {state.groups
            .filter((group) => group.supplierId !== null)
            .map((group) => (
              <MappedGroup key={supplyGroupKey(group)} group={group} supply={supply} />
            ))}
          {state.groups
            .filter((group) => group.supplierId === null)
            .map((group) => (
              <UnmappedGroup key={supplyGroupKey(group)} group={group} />
            ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Satırın orta cümlesi — son alış yoksa "—": bilinmeyen fiyat sıfır gibi okutulmaz. */
function lineMeta(line: SupplyGroup['lines'][number]): string {
  return fillCopy(t.supply.row, {
    current: String(line.availableQty),
    threshold: String(line.minStockQty),
    lastPurchase: line.lastPurchaseCents === null ? t.supply.noPurchase : money(line.lastPurchaseCents),
  });
}

interface MappedGroupProps {
  group: SupplyGroup;
  supply: ReturnType<typeof useSupply>;
}

function MappedGroup({ group, supply }: MappedGroupProps) {
  const key = supplyGroupKey(group);
  const draft = supply.drafts[key];
  const label =
    draft === undefined
      ? t.supply.cta
      : draft.status === 'sending'
        ? t.supply.ctaSending
        : draft.status === 'stale'
          ? t.supply.ctaStale
          : fillCopy(t.supply.ctaDone, { n: String(draft.itemCount) });

  return (
    <View style={styles.group} testID={`management-supply-group-${key}`}>
      <Text style={styles.groupTitle}>
        {fillCopy(t.supply.group, {
          supplier: group.supplierName ?? '—',
          warehouse: group.warehouseCode ?? '',
        })}
      </Text>

      {group.lines.map((line) => (
        <View key={line.variantId} style={styles.line} testID={`management-supply-${line.variantId}`}>
          <View style={styles.lineHead}>
            <Text style={styles.lineName}>{line.title}</Text>
            <Text style={styles.lineSuggested}>{`+${line.suggestedQty}`}</Text>
          </View>
          <Text style={styles.lineMeta}>{lineMeta(line)}</Text>
          {line.elsewhere.length === 0 ? null : (
            <Text style={styles.lineElsewhere}>
              {fillCopy(t.supply.elsewhere, {
                where: line.elsewhere.map((spot) => `${spot.warehouseCode} ${spot.qty}`).join(' · '),
              })}
            </Text>
          )}
        </View>
      ))}

      <PressableSurface
        onPress={() => supply.approve(group)}
        disabled={draft !== undefined && draft.status !== 'stale'}
        feedback="shadow"
        style={[styles.cta, draft === undefined || draft.status === 'stale' ? styles.ctaOpen : styles.ctaDone]}
        accessibilityLabel={label}
        testID={`management-supply-cta-${key}`}
      >
        <Text style={styles.ctaLabel}>{label}</Text>
      </PressableSurface>

      <Text style={styles.note}>{t.supply.note}</Text>
    </View>
  );
}

interface UnmappedGroupProps {
  group: SupplyGroup;
}

function UnmappedGroup({ group }: UnmappedGroupProps) {
  return (
    <View style={styles.unmapped} testID="management-supply-unmapped">
      <Text style={styles.unmappedTitle}>{fillCopy(t.supply.unmapped.title, { n: String(group.lines.length) })}</Text>
      {group.lines.map((line) => (
        <Text key={line.variantId} style={styles.unmappedLine}>
          {fillCopy(t.supply.unmapped.line, {
            name: line.title,
            current: String(line.availableQty),
            threshold: String(line.minStockQty),
          })}
        </Text>
      ))}
      <Text style={styles.unmappedBlocked}>{t.supply.unmapped.blocked}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  pending: {
    paddingTop: operationsTheme.space['8xl'],
    alignItems: 'center',
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
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
