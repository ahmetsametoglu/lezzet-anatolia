import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
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
  Y3 · YAKIN-SKT TEKLİFİ (Operasyon Mobil v3:30) — aday partiler burada teklife dönüşür.

  ── v3 SATIRI KARTA ÇEVİRDİ, EKRANI DEĞİL ───────────────────────────────────
  v3 bu ekranı TEK partinin künye kartı gibi çiziyor: dört ölçüm alt alta (kalan adet · kalan ömür ·
  liste fiyatı · önerilen), altında iki karar düğmesi. Kart dili birebir uygulandı; ama ekran TEKİL
  hâle GETİRİLMEDİ ve bu ölçülmüş bir karar: uç bir LİSTE döndürüyor (`/management/offers` →
  `candidates[]`) ve hub da "N aday parti" diyerek buraya gönderiyor. Tek partiye indirseydik, N
  parti için N kez aynı yolculuk gerekirdi — teklif kararı günde bir kez ve TOPLU verilen bir
  karardır. Yani her aday kendi kartını alır, kararlar tek turda toplanır ve tek onayla yazılır.

  ── SÖZLEŞMEDE OLMAYAN İKİ ŞEY YAZILMADI ────────────────────────────────────
  · **"%18 kalan ömür"**: v3 kalan günün yanına raf ömrünün yüzdesini koyuyor. Oranı hesaplamak için
    partinin ÜRETİM tarihi (ya da toplam raf ömrü) gerekir; `OfferCandidate` yalnız `daysLeft`
    taşıyor. Yüzde uydurmak, operatöre ölçülmemiş bir kesinlik satmaktı — kalan gün yazılıyor.
  · **Üç oranlı indirim çipi (%20/%30/%40)**: sözleşmede TEK oran var (`offerDiscountPercent`, ayardan
    türeyen motor önerisi). Öteki iki çipin değerleri uydurma olurdu ve ayar değişince yalan
    söylerlerdi. Yerinde v2'den beri çalışan şey duruyor: öneri fiyatı alana DOLU gelir, operatör
    isterse üstüne yazar — fiyat zaten sözleşmenin son sözü (`offerPriceCents`).

  ── İKİ KARAR, İKİSİ DE GERİ ALINABİLİR ─────────────────────────────────────
  · "Teklif verme — imhaya bırak" (v3'ün ikinci düğmesi) partiyi bu turun DIŞINA çıkarır; kart
    solar, üstü çizilir ama SİLİNMEZ — aday listesinde kalır, yarınki turda yeniden önerilir.
    Sunucuya bir şey gitmez: "bugün teklif vermedim" bir yazma değil, bir yazmamadır.
  · Fiyat düzeltilir; motorun önerdiği oran etiketin içinde AYNEN durur — operatör neyi
    değiştirdiğini görür.

  ── BOŞ GİRDİ SIFIR DEĞİLDİR ────────────────────────────────────────────────
  Boş/bozuk fiyat `null` ayrıştırılır (CLAUDE §1) ve satır GÖNDERİLMEZ; CTA onu saymaz. Sıfıra
  düşürmek, bedava satılan bir parti demekti.

  ── AKIBET SATIR SATIR ──────────────────────────────────────────────────────
  DLC kapısı SUNUCUDADIR (web'in `setOfferPriceAction`ı ile aynı motor). Açılamayan parti kartında
  İŞARETLİ kalır, "bir şeyler ters gitti"ye indirgenmez.

  ── İKİNCİL DÜĞMENİN ÇERÇEVESİ `error-line` ─────────────────────────────────
  v3 "imhaya bırak" düğmesini AÇIK kırmızı bir çerçeveyle çiziyor; dolu `error` tonu çerçevede bir
  kademe yüksek sesli kalıyor ve ikincil düğme birincilden daha çok bağırıyordu. Token seti bu
  durağı zaten taşıyor (`error-line`, kırmızı ailenin `olive-line` karşılığı) — yeni durak
  açılmadı, var olan kullanıldı. YAZI rengi `error` kalır: okunması gereken şey çerçeve değil,
  cümlenin kendisi.
*/

const t = managementCopy;

/**
 * İskelet kutusu aday kartının KENDİ ölçüsünden türer (bildirimler emsali): iki dolgu + künye iki
 * satır + üç ölçüm satırı + öneri satırı (kutu yüksekliğinde) + ikincil düğme + iç aralıklar.
 */
const SKELETON_CARD_HEIGHT =
  operationsTheme.space['3xl'] * 2 +
  operationsTheme.space.lg * 5 +
  operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.tag * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.note * operationsTheme.text['lead--line-height'] * 3 +
  operationsTheme.size.controlMd * 2;

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
        /* İLK YÜK İSKELETLE (v3 dili). Bu ekranda fark en büyük: aday listesi 49 parti getiriyor
           ve cihazda ölçüldü (30.08) — halka sekiz saniye boyunca BOŞ bir sayfanın ortasında
           dönüyordu, yani ekran "veri yok" ile "veri geliyor"u aynı biçimde gösteriyordu. */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[SKELETON_CARD_HEIGHT, SKELETON_CARD_HEIGHT, SKELETON_CARD_HEIGHT]}
            label={t.offer.loading}
            testID="management-offer-loading"
          />
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
          {/* AŞAĞI ÇEKİNCE YENİLE: aday listesi partilerin SKT'sinden türüyor ve gün içinde
              değişiyor; kabın kendi `refresh` desteği kullanıldı (`FormScroll` künyesi). */}
          <FormScroll
            contentContainerStyle={styles.body}
            refresh={{ onRefresh: approval.refresh, refreshing: approval.reloading }}
            testID="management-offer-approval-body"
          >
            {state.candidates.map((candidate) => (
              <CandidateCard key={candidate.stockId} candidate={candidate} approval={approval} />
            ))}
            {approval.lastOpenedCount !== null && Object.keys(approval.failures).length > 0 ? (
              <Text style={styles.partialNote} testID="management-offer-partial">
                {fillCopy(t.offer.partialNote, {
                  ok: String(approval.lastOpenedCount),
                  failed: String(Object.keys(approval.failures).length),
                })}
              </Text>
            ) : null}
            {/* v3'ün dipnotu (teklifin ömrü) + v2'den kalan "çıkarılan parti kaybolmaz" sözü:
                ikisi de operatörün "bu düğmeye basarsam ne olur" sorusunun parçası. */}
            <Text style={styles.footnote}>{t.offer.publishNote}</Text>
            <Text style={styles.footnote}>{t.offer.footnote}</Text>
          </FormScroll>

          <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
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
          </LinearGradient>
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

interface DetailRowProps {
  label: string;
  value: string;
  /** Terracotta okunan değer — "izle" demektir; kırmızı bir HATA iddiası olurdu. */
  watch?: boolean;
}

function DetailRow({ label, value, watch = false }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, watch ? styles.detailValueWatch : undefined]}>{value}</Text>
    </View>
  );
}

interface CandidateCardProps {
  candidate: OfferCandidate;
  approval: ReturnType<typeof useOfferApproval>;
}

function CandidateCard({ candidate, approval }: CandidateCardProps) {
  const isRemoved = approval.removed[candidate.stockId] === true;
  const failure = approval.failures[candidate.stockId];

  /* Kalan gün NEGATİF olabilir (motor "satılabilir pencerede" diyebilir ama tarih geçmiştir);
     "-2 gün" diye yazmak yerine hâli söylenir. */
  const lifeValue =
    candidate.daysLeft < 0
      ? t.offer.rows.lifeValuePast
      : fillCopy(t.offer.rows.lifeValue, { days: String(candidate.daysLeft) });

  return (
    <View
      style={[styles.card, isRemoved ? styles.cardRemoved : undefined]}
      testID={`management-offer-${candidate.stockId}`}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, isRemoved ? styles.cardTitleRemoved : undefined]}>{candidate.title}</Text>
        <Text style={styles.cardMeta}>
          {fillCopy(t.offer.meta, {
            batch: candidate.lotNumber ?? t.offer.noLot,
            warehouse:
              candidate.warehouse === null ? '' : fillCopy(t.offer.warehousePart, { code: candidate.warehouse.code }),
          })}
        </Text>
      </View>

      <DetailRow label={t.offer.rows.qty} value={String(candidate.qty)} />
      <DetailRow label={t.offer.rows.life} value={lifeValue} watch />
      <DetailRow
        label={t.offer.rows.listPrice}
        value={candidate.listPriceCents === null ? t.offer.noSuggestion : money(candidate.listPriceCents)}
      />

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <Text style={styles.suggestLabel}>
          {fillCopy(t.offer.rows.suggested, { percent: String(candidate.offerDiscountPercent) })}
        </Text>
        {isRemoved ? null : (
          <View style={styles.priceField}>
            <TextInput
              value={approval.prices[candidate.stockId] ?? ''}
              onChangeText={(value) => approval.setPrice(candidate.stockId, value)}
              keyboardType="decimal-pad"
              accessibilityLabel={fillCopy(t.offer.priceLabel, { name: candidate.title })}
              style={styles.priceInput}
              testID={`management-offer-price-${candidate.stockId}`}
            />
            <Text style={styles.priceCurrency}>€</Text>
          </View>
        )}
      </View>

      {failure === undefined ? null : (
        <Text style={styles.cardFailure} testID={`management-offer-failed-${candidate.stockId}`}>
          {t.offer.failed[failure === 'must_discard' ? 'must_discard' : 'not_found']}
        </Text>
      )}

      <PressableSurface
        onPress={() => approval.toggleRemoved(candidate.stockId)}
        feedback="scale"
        style={[styles.secondary, isRemoved ? styles.secondaryRestore : styles.secondaryRemove]}
        accessibilityLabel={isRemoved ? t.offer.restore : t.offer.remove}
        testID={`management-offer-toggle-${candidate.stockId}`}
      >
        <Text style={isRemoved ? styles.secondaryLabelRestore : styles.secondaryLabelRemove}>
          {isRemoved ? t.offer.restore : t.offer.remove}
        </Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet listenin kendi kenar boşluğunda durur — kutular kartların yerini tutuyor. */
  skeleton: {
    paddingTop: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    // Yapışkan CTA mutlak konumlu: listenin kuyruğu onun altında kalmasın.
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },

  /* ── Aday kartı (v3:30) ───────────────────────────────────────────────────── */
  card: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
  },
  /** Turun dışına çıkarılan kart SOLUR ama durur — "bugün değil" ile "bir daha asla" ayrı şeyler. */
  cardRemoved: {
    opacity: operationsTheme.soldOutOpacity,
  },
  cardHead: {
    gap: operationsTheme.space['2xs'],
  },
  cardTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  cardTitleRemoved: {
    textDecorationLine: 'line-through',
  },
  cardMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  detailLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  detailValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  detailValueWatch: {
    color: operationsTheme.colors.terracotta,
  },
  divider: {
    height: operationsTheme.border.base,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  /** Motorun oranı etiketin İÇİNDE durur — operatör neyin üstüne yazdığını görsün. */
  suggestLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['olive-dark'],
  },
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
  },
  /** v3: 72 dp'lik alan. Ölçü `size`+`space`ten türer (adet kutusuyla aynı desen). */
  priceInput: {
    width: operationsTheme.size.avatarLg + operationsTheme.space['3xl'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.md,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  priceCurrency: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  /** Açılamayan partinin sebebi KARTINDA durur — toplu bir hataya indirgenmez. */
  cardFailure: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
  secondary: {
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
  },
  secondaryRemove: {
    borderColor: operationsTheme.colors['error-line'],
  },
  secondaryRestore: {
    borderColor: operationsTheme.colors['olive-line'],
  },
  secondaryLabelRemove: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  secondaryLabelRestore: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  partialNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  /* Gölgesiz (v3'te sert gölge yok, ölçüm 30.08). Yapışkan çubuğun kendi ışıması ayrı bir
     karardır ve OKUTMA CTA'sınındır — teklif düğmesi sayfanın üstünde yüzmez, listenin sonudur. */
  ctaOpen: {
    backgroundColor: operationsTheme.colors.olive,
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
