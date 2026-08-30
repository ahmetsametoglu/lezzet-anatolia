import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { SupplyGroup } from '@lezzet/types';
import { managementCopy } from './copy';
import { supplyGroupKey, useSupply } from './use-supply.hook';

/*
  Y4 · TEDARİK TASLAĞI (Operasyon Mobil v3:31) — azalan stok listesi ve TASLAK tedarik siparişi.

  ── v3 SATIRI KARTA ÇEVİRDİ; EKRAN YİNE GRUPLU ──────────────────────────────
  v3 her kalemi kendi kartında çiziyor (ad + ölçüm satırı solda, önerilen adet sağda zeytin) ve
  altta TEK koyu düğme koyuyor. Kart dili birebir uygulandı. Ama v3'ün ekranı TEK tedarikçinin
  taslağıdır; uç ise gruplu döner (`groups[]` = depo + tedarikçi) ve onay da grup KİMLİĞİYLE gider.
  Bu yüzden koyu düğme yapışkan bir alt çubuğa değil, HER GRUBUN sonuna konur: yapışkan tek düğme,
  ekranda üç grup varken hangisini onayladığını söyleyemezdi.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  Öneri `ReorderService`ten (eşik depo bazlı · yoldaki düşülmüş · koli katına yuvarlı); onay
  taslak TS yazar ve kalem listesi GÖNDERİLMEZ — sunucu öneriyi onay anında tazeler. `no_suggestion`
  cevabı "ekran bayattı" demektir: liste yeniden okunur, grup kendiliğinden düşer.

  ── SİSTEM TEDARİKÇİYE BİR ŞEY GÖNDERMEZ ────────────────────────────────────
  Onay yalnız TASLAĞI kurar; gönderim (WhatsApp/PDF) insanın işidir ve referans (TS-26-…) gönderim
  anında doğar. Ekranda bir "gönder" düğmesi YOK — olmayan bir otomasyonu vaat etmemek tasarımın
  kendi kararı.

  ── SÖZLEŞMEDE OLMAYAN ÜÇ ŞEY YAZILMADI ─────────────────────────────────────
  v3'ün ölçüm satırı "stok 24 · günlük 3,1 · 8 gün" diyor, künyesi "12 gün kapak", bir kartı da
  "imha oranı yüksek · öneri düşürüldü" diye terracotta çerçeveyle uyarıyor. GÜNLÜK SATIŞ HIZI,
  GÜN KAPAĞI ve İMHA ORANI `SupplyLine`de YOK — hiçbiri sorulmuyor. Satır elimizdeki gerçek
  ölçümlerle kuruldu (stok · eşik · yoldaki · son alış); uydurma bir hız, tedarik kararının
  altındaki tek sayı olurdu.

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

          {/* Dipnot listenin SONUNDA, bir kez: öneriyi neyin ürettiği ve sistemin tedarikçiye bir
              şey göndermediği grup başına tekrarlanacak bir bilgi değil. */}
          <Text style={styles.footnote}>{t.supply.footnote}</Text>
          <Text style={styles.footnote}>{t.supply.note}</Text>
        </ScrollView>
      )}
    </View>
  );
}

/** Kartın ölçüm satırı — son alış yoksa "—": bilinmeyen fiyat sıfır gibi okutulmaz. */
function lineMeta(line: SupplyGroup['lines'][number]): string {
  return fillCopy(t.supply.row, {
    current: String(line.availableQty),
    threshold: String(line.minStockQty),
    incoming: String(line.incomingQty),
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
  const ctaOpen = draft === undefined || draft.status === 'stale';

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
          <View style={styles.lineText}>
            <Text style={styles.lineName}>{line.title}</Text>
            <Text style={styles.lineMeta}>{lineMeta(line)}</Text>
            {/* GEREKÇE EKRANDAN ÇIKTI (cihazda görüldü 30.08): satır "— transfer seçeneğinin ham
                verisi" diye bitiyordu ve bu bir GELİŞTİRİCİ notudur; sekiz satırda tekrarlanınca
                ekranı kendi kendini açıklayan bir belgeye çeviriyordu. Neden gösterildiği bu
                künyede yazılı: elimizdeki tek "dikkat" sinyali bu ve bir uyarı değil BİLGİdir —
                satın almadan önce transfer bakılabilir. */}
            {line.elsewhere.length === 0 ? null : (
              <Text style={styles.lineElsewhere}>
                {fillCopy(t.supply.elsewhere, {
                  where: line.elsewhere.map((spot) => `${spot.warehouseCode} ${spot.qty}`).join(' · '),
                })}
              </Text>
            )}
          </View>
          <Text style={styles.lineSuggested}>{`+${line.suggestedQty}`}</Text>
        </View>
      ))}

      <PressableSurface
        onPress={() => supply.approve(group)}
        disabled={!ctaOpen}
        feedback="shadow"
        style={[styles.cta, ctaOpen ? styles.ctaOpen : styles.ctaDone]}
        accessibilityLabel={label}
        testID={`management-supply-cta-${key}`}
      >
        <Text style={ctaOpen ? styles.ctaLabel : styles.ctaLabelDone}>{label}</Text>
      </PressableSurface>
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
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['3xl'],
  },
  group: {
    gap: operationsTheme.space.lg,
  },
  /** Grubun künyesi üstbaşlık kademesinde: kartların KİMİN için olduğunu söyler, kart değildir. */
  groupTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    textTransform: 'uppercase',
    color: operationsTheme.colors.muted,
  },

  /* ── Kalem kartı (v3:31) ──────────────────────────────────────────────────── */
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
  },
  lineText: {
    flex: 1,
    minWidth: 0,
    gap: operationsTheme.space['2xs'],
  },
  lineName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  lineMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /** Başka depodaki mal DEPO tonunda: transferin ham verisi, kararı değil. */
  lineElsewhere: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.warehouse,
  },
  /** Önerilen adet ZEYTİN: eklenen mal, eksilen değil. */
  lineSuggested: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.olive,
  },

  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: operationsTheme.space.xs,
    borderRadius: operationsTheme.radius.control,
  },
  /** Koyu CTA (v3:31). Gölgesi mürekkep OLAMAZ (görünmez) — kum gölge (`hard-on-ink`). */
  ctaOpen: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaDone: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
    textAlign: 'center',
  },
  /** Onaylanmış grubun düğmesi bir SONUÇ satırıdır: sönük zemin, okunur koyu yazı. */
  ctaLabelDone: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.body,
    textAlign: 'center',
  },

  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
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
  /** Kapalı kapı KIRMIZI ve GEREKÇELİ: ne olduğu değil, ne yapılacağı yazıyor. */
  unmappedBlocked: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
});
