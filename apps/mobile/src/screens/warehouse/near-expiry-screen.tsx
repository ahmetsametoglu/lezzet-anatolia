import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import type { NearExpiryBatchContract } from '@lezzet/types';

import { productLabel } from './warehouse-format';
import { urgencyOf, useNearExpiry } from './use-near-expiry.hook';

/*
  D3 · YAKIN-SKT TURU (v2:403-424) — bölümün TEK salt-okunur ekranı.

  ── EKRANDA HİÇBİR İŞARETLEME YOK, VE BU TASARIMIN KARARI ───────────────────
  v2 birebir: *"Karar sistemce türetilir — bu liste fiziksel ayıklama rehberidir; işaretleme yok."*
  Depocu burada bir şey seçmez, onaylamaz, indirim oranı girmez (o yönetimde onaylanır). Tek eylem
  tasarımın çizdiği geçiştir: *"'İmha edilmeli' → Sayım/Düzeltme"* ve o geçiş partiyi D4'e TAŞIR —
  D4'ün "hangi parti" sorusunun bugünkü tek cevabı bu.

  ── LİSTE ARTIK GERÇEK (21.187 · fikstür söküldü) ───────────────────────────
  Künye buraya *"kapısı yok, ekranın kendisi TAM yazıldı — o gün yalnız veri kaynağı değişir"*
  diye yazılmıştı. O gün geldi: uç açıldı (`/api/v1/warehouse/near-expiry`), fikstür söküldü,
  ekranın yapısına dokunulmadı. Değişen tek şey satırların nereden geldiği.

  ── KAPININ DİLİ EKRANIN DİLİDİR ────────────────────────────────────────────
  Karar adları motorun (`none · can_offer · offer_open · must_discard`); ekran kendi eş anlamlısını
  (`offer_candidate`, `discard`) TAŞIMIYOR. İkinci bir adlandırma, aynı kavramı iki dilde yaşatmak
  ve bir gün birini çevirmeyi unutmaktı (CLAUDE §1).
*/

const t = warehouseCopy;

export function NearExpiryScreen() {
  const router = useRouter();
  const nearExpiry = useNearExpiry();
  const candidate = nearExpiry.discardCandidate;

  /* Partiyi D4'e taşıyan tek yol — hem satırdaki bağ hem alttaki düğme buradan geçiyor.
     İki ayrı çağrı yazsaydık biri bir gün ötekinden başka parametre gönderirdi. */
  const toStockCount = (batch: NearExpiryBatchContract | null) =>
    router.navigate({
      pathname: '/stock-count',
      // Parti D4'e TAŞINIR: ekranın kendi partisi yok ve olmayan bir konuyu uydurmak yerine
      // buradaki seçim geçiriliyor. İmhalık yoksa konu da yok — D4 bunu söyler.
      params:
        batch === null
          ? {}
          : {
              stockId: batch.stockId,
              // Kodsuz parti de meşru: lot yazılmamış olabilir ve D4'e boş dize göndermektense
              // ekranın gösterdiği tireyi göndermek, oradaki künyeyi de tutarlı tutar.
              code: batch.lotNumber ?? t.nearExpiry.noLot,
              name: productLabel(batch.productName, batch.variantLabel),
            },
    });

  return (
    <View style={styles.screen} testID="warehouse-near-expiry">
      <OperationsStackHeader
        title={t.nearExpiry.title}
        subtitle={t.nearExpiry.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="warehouse-near-expiry-header"
      />

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-near-expiry-list">
        {nearExpiry.batches.map((batch) => {
          /* Aciliyet ve künye SATIRDA türetiliyor (hook'un künyesi): kapı günü sayı olarak veriyor,
             rengin eşiği ve "2 gün" cümlesi ekranın kararı. */
          const urgency = urgencyOf(batch.daysLeft);
          const code = batch.lotNumber ?? t.nearExpiry.noLot;
          return (
          /* SATIR BİR KARTTIR VE TONU KARARINI SÖYLER (v3:07 · düzeltme 30.08). Önce kesik çizgiyle
             ayrılmış düz satırlardı; tasarım her partiyi kendi zeminine oturtuyor ve karar renkten
             de okunuyor: imhalık KIRMIZI zeminli, kararı olmayan KESİKLİ ve sessiz, ötekiler sakin
             krem. Depocu listeyi okumadan önce ayıklıyor — kart bunu mümkün kılan şey. */
          <View
            key={batch.stockId}
            style={[styles.row, styles[`row_${batch.decision}`]]}
            testID={`warehouse-near-expiry-${code}`}
          >
            <View style={styles.rowHead}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{productLabel(batch.productName, batch.variantLabel)}</Text>
                <Text style={[styles.rowSub, styles[`urgency_${urgency}`]]}>
                  {fillCopy(t.nearExpiry.row, { qty: String(batch.qty), days: daysLabelOf(batch.daysLeft) })}
                </Text>
              </View>
              <Text style={[styles.decision, styles[`decision_${batch.decision}`]]}>
                {t.nearExpiry.decision[batch.decision]}
              </Text>
            </View>

            {/*
              ÖMÜR ÇUBUĞU (v3:840) — yüzdeyi hem çizerek hem yazarak söyler. Çubuk göz taramasıyla
              okunur, sayı kararı gerekçelendirir.

              ÖLÇÜLEMEYEN ÖMÜRDE ÇUBUK HİÇ ÇİZİLMEZ (CLAUDE §1): boş bir çubuk "%0" gibi görünür ve
              o partiyi imhalık gösterirdi. Onun yerine eşiğin neden uygulanmadığı yazılır.
            */}
            {batch.remainingPercent === null ? (
              <Text style={styles.lifeUnknown} testID={`warehouse-near-expiry-${code}-life-unknown`}>
                {t.nearExpiry.lifeUnknown}
              </Text>
            ) : (
              <View style={styles.lifeRow}>
                <OperationsProgressBar
                  value={batch.remainingPercent / 100}
                  tone={LIFE_TONE[urgency]}
                  testID={`warehouse-near-expiry-${code}-life`}
                />
                <Text style={[styles.lifeLabel, { color: LIFE_TONE[urgency] }]}>
                  {/* Yüzde TAM SAYIYA yuvarlanır: motor kesirli hesaplıyor (17.26027…) ve depocuya
                      ondalık göstermek kararı değiştirmeyen bir gürültüdür. */}
                  {fillCopy(t.nearExpiry.life, { n: String(Math.round(batch.remainingPercent)) })}
                </Text>
              </View>
            )}

            {/* İMHALIK SATIRIN KENDİ BAĞI (v3:849) — alttaki genel düğme "bir" partiyi taşır
                (`discardCandidate`); imhalık birden çoksa depocu hangisinin taşındığını bilemezdi.
                Satırdaki bağ o satırın partisini götürüyor. */}
            {batch.decision !== 'must_discard' ? null : (
              <TextAction
                label={t.nearExpiry.toBatchCount}
                onPress={() => toStockCount(batch)}
                testID={`warehouse-near-expiry-${code}-to-count`}
              />
            )}
          </View>
          );
        })}

        <Text style={styles.footnote}>{t.nearExpiry.footnote}</Text>

        <PressableSurface
          onPress={() => toStockCount(candidate)}
          feedback="scale"
          style={styles.toAdjustment}
          accessibilityLabel={t.nearExpiry.toAdjustment}
          testID="warehouse-near-expiry-to-count"
        >
          <Text style={styles.toAdjustmentLabel}>{t.nearExpiry.toAdjustment}</Text>
        </PressableSurface>
      </ScrollView>
    </View>
  );
}

/**
 * Ömür çubuğunun rengi — aciliyetten türer, karardan DEĞİL.
 *
 * İkisi ayrı şeydir: "karar" sistemin türettiği eylem (teklif · imha), "aciliyet" ise partinin
 * kaç günü kaldığıdır. Çubuk zamanı çiziyor, o yüzden zamanın rengini taşıyor; kararın rengi zaten
 * rozettedir ve ikisi aynı olsaydı satırda iki kez aynı şey söylenirdi.
 */
/**
 * Kalan günün CÜMLESİ — sayı kapıdan gelir, cümle burada kurulur (hook künyesi).
 *
 * ÜÇ HÂL ve üçü de ayrı şey söyler: geçmiş parti "geçti" der ve sayısı POZİTİF yazılır (depocu
 * "kaç gün geçmiş" diye sorar, eksi işaretini okumaz); bugün son günü olan partide sayı hiç
 * yazılmaz, çünkü "0 gün" bir süre değil bir sınırdır.
 */
function daysLabelOf(daysLeft: number): string {
  if (daysLeft < 0) return fillCopy(t.nearExpiry.daysPast, { n: String(Math.abs(daysLeft)) });
  if (daysLeft === 0) return t.nearExpiry.daysToday;
  return fillCopy(t.nearExpiry.daysLeft, { n: String(daysLeft) });
}

const LIFE_TONE = {
  expired: operationsTheme.colors.error,
  soon: operationsTheme.colors.terracotta,
  calm: operationsTheme.colors.olive,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    /* KARTLAR ARASI BOŞLUK (kullanıcı bulgusu 31.08): satır v3'te KART oldu ama liste hâlâ eski
       düzenin aralıksız kabıydı — kartlar bitişik çiziliyor, ayrı kutular olduğu okunmuyordu.
       Kart bir yüzeydir; yüzeyi yüzeyden ayıran şey aradaki boşluktur. */
    gap: operationsTheme.space.lg,
  },
  /* Satır artık iki katman: künye+karar üstte, ömür çubuğu altta (v3:836). Yön DİKEY oldu —
     çubuk künyenin yanına sıkışsaydı ne çubuk okunurdu ne ad. */
  row: {
    gap: operationsTheme.space.md,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  // Teklifi açık ve teklife girebilir partiler SAKİN krem kalır — kararları zaten rozette yazılı.
  row_offer_open: {},
  row_can_offer: {},
  /* İMHALIK KIRMIZI ZEMİNLİ: listedeki tek "şimdi bir şey yap" satırı odur ve göz onu kartın
     rengiyle bulur, rozeti okumadan. */
  row_must_discard: {
    borderColor: operationsTheme.colors['error-line'],
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  /* KARARI OLMAYAN KESİKLİ VE SESSİZ: eşik uygulanamadığı için burada bir iş YOK; dolu bir kart
     onu ötekilerle aynı ağırlıkta gösterirdi. */
  row_none: {
    borderStyle: 'dashed',
    // Zemin SAYFANIN kendi kremi: kart "yok gibi" görünsün diye — şeffaf yazmak yerine sayfanın
    // rengini vermek, panelin altındaki gölge/kenar hesabını da doğru bırakır.
    backgroundColor: operationsTheme.colors.cream,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  lifeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  lifeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  /** Ömür ölçülemediğinde çubuk YOK — eşiğin neden uygulanmadığı yazılır (CLAUDE §1). */
  lifeUnknown: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
  },
  urgency_expired: { color: operationsTheme.colors.error },
  urgency_soon: { color: operationsTheme.colors.terracotta },
  urgency_calm: { color: operationsTheme.colors.muted },
  decision: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  decision_offer_open: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  decision_can_offer: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  decision_must_discard: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  /** "Karar yok" nötr durur — bilinmeyen bir ömür, kötü bir haber değildir (CLAUDE §1). */
  decision_none: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.xl,
  },
  toAdjustment: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  toAdjustmentLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
});
