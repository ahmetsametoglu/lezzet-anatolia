import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { OfferCandidate } from '@lezzet/types';
import { managementCopy } from './copy';
import { useOfferApproval } from './use-offer-approval.hook';

/*
  Y3 · YAKIN-SKT KAMPANYA ONAYI (v2:612-633) — aday partiler burada teklife dönüşür.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  Aday listesi raf ömrü MOTORUNDAN gelir (`can_offer` — hub'ın saydığı kümenin ta kendisi), onay
  teklif yazma ucuna gider ve DLC kapısı SUNUCUDADIR: web'in `setOfferPriceAction`ı ile aynı motor
  (`openBatchOffer` terfisi). Akıbet satır satır döner — açılamayan parti listede İŞARETLİ kalır,
  "bir şeyler ters gitti"ye indirgenmez.

  ── İKİ DÜZENLEME, İKİSİ DE GERİ ALINABİLİR ─────────────────────────────────
  · Satır listeden çıkarılır (✕) ve geri alınır (+). Çıkarılan parti SİLİNMEZ — aday listesinde
    kalır, yarınki turda yeniden önerilir. Satır kaybolmaz, solar ve üstü çizilir.
  · Fiyat düzeltilir. Motorun önerisi alt satırda AYNEN durur — operatör neyi değiştirdiğini görür.

  ── BOŞ GİRDİ SIFIR DEĞİLDİR ────────────────────────────────────────────────
  Boş/bozuk fiyat `null` ayrıştırılır (CLAUDE §1) ve satır GÖNDERİLMEZ; CTA onu saymaz. Sıfıra
  düşürmek, bedava satılan bir parti demekti.
*/

const t = managementCopy;

export function OfferApprovalScreen() {
  const router = useRouter();
  const approval = useOfferApproval();
  const { state } = approval;

  return (
    <View style={styles.screen} testID="management-offer-approval">
      <OperationsStackHeader
        title={t.offer.title}
        subtitle={t.offer.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-offer-approval-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="management-offer-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: approval.retry }}
            testID="management-offer-error"
          />
        </View>
      ) : state.candidates.length === 0 ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.offer.empty.title}
            description={approval.lastOpenedCount === null ? t.offer.empty.body : t.offer.ctaDone}
            testID="management-offer-empty"
          />
        </View>
      ) : (
        <>
          <FormScroll contentContainerStyle={styles.body} testID="management-offer-approval-body">
            {state.candidates.map((candidate) => (
              <CandidateRow key={candidate.stockId} candidate={candidate} approval={approval} />
            ))}
            {approval.lastOpenedCount !== null && Object.keys(approval.failures).length > 0 ? (
              <Text style={styles.partialNote} testID="management-offer-partial">
                {fillCopy(t.offer.partialNote, {
                  ok: String(approval.lastOpenedCount),
                  failed: String(Object.keys(approval.failures).length),
                })}
              </Text>
            ) : null}
            <Text style={styles.footnote}>{t.offer.footnote}</Text>
          </FormScroll>

          <View style={styles.footer}>
            <PressableSurface
              onPress={approval.submit}
              disabled={approval.sending || approval.openableCount === 0}
              feedback="shadow"
              style={[styles.cta, approval.sending || approval.openableCount === 0 ? styles.ctaClosed : styles.ctaOpen]}
              accessibilityLabel={ctaLabel(approval.sending, approval.openableCount)}
              testID="management-offer-cta"
            >
              <Text style={styles.ctaLabel}>{ctaLabel(approval.sending, approval.openableCount)}</Text>
            </PressableSurface>
          </View>
        </>
      )}
    </View>
  );
}

function ctaLabel(sending: boolean, openableCount: number): string {
  if (sending) return t.offer.ctaSending;
  if (openableCount === 0) return t.offer.ctaEmpty;
  return fillCopy(t.offer.cta, { n: String(openableCount) });
}

interface CandidateRowProps {
  candidate: OfferCandidate;
  approval: ReturnType<typeof useOfferApproval>;
}

function CandidateRow({ candidate, approval }: CandidateRowProps) {
  const isRemoved = approval.removed[candidate.stockId] === true;
  const failure = approval.failures[candidate.stockId];

  return (
    <View style={[styles.row, isRemoved ? styles.rowRemoved : undefined]} testID={`management-offer-${candidate.stockId}`}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, isRemoved ? styles.rowTitleRemoved : undefined]}>{candidate.title}</Text>
        <Text style={styles.rowMeta}>
          {fillCopy(t.offer.row, {
            batch: candidate.lotNumber ?? t.offer.noLot,
            qty: String(candidate.qty),
            days: String(candidate.daysLeft),
            suggested: candidate.suggestedCents === null ? t.offer.noSuggestion : money(candidate.suggestedCents),
            warehouse:
              candidate.warehouse === null ? '' : fillCopy(t.offer.warehousePart, { code: candidate.warehouse.code }),
          })}
        </Text>
        {failure === undefined ? null : (
          <Text style={styles.rowFailure} testID={`management-offer-failed-${candidate.stockId}`}>
            {t.offer.failed[failure === 'must_discard' ? 'must_discard' : 'not_found']}
          </Text>
        )}
      </View>

      {isRemoved ? null : (
        <TextInput
          value={approval.prices[candidate.stockId] ?? ''}
          onChangeText={(value) => approval.setPrice(candidate.stockId, value)}
          keyboardType="decimal-pad"
          accessibilityLabel={fillCopy(t.offer.priceLabel, { name: candidate.title })}
          style={styles.priceInput}
          testID={`management-offer-price-${candidate.stockId}`}
        />
      )}

      <PressableSurface
        onPress={() => approval.toggleRemoved(candidate.stockId)}
        feedback="scale-small"
        compact
        style={styles.toggle}
        accessibilityLabel={isRemoved ? t.offer.restore : t.offer.remove}
        testID={`management-offer-toggle-${candidate.stockId}`}
      >
        <Text style={isRemoved ? styles.toggleRestore : styles.toggleRemove}>{isRemoved ? '+' : '✕'}</Text>
      </PressableSurface>
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
  /** Açılamayan partinin sebebi SATIRINDA durur — toplu bir hataya indirgenmez (uç künyesi). */
  rowFailure: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
  partialNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
    paddingTop: operationsTheme.space.lg,
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
