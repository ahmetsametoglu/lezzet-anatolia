import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { money, signedMoney } from '@/lib/operations/money';
import { dateLabelOf, timeOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { MoneyDayEnd } from '@lezzet/types';
import { moneyCopy } from './copy';
import { useMoneyDayEnd } from './use-money.hook';

/*
  M2 · GÜN SONU ÖZETİ (v3:24) — salt okuma; çözüm masaüstünde.

  ── UYUŞMAZLIK GÖRÜNÜR, DÜZELTİLMEZ ─────────────────────────────────────────
  Ekranın tek vurgulu bloğu farkın kendisi: beklenen ↔ sayılan nakit. Eksi işareti "eksik"
  demektir ve MUTLAK DEĞERE indirgenmez (`signedMoney`) — işareti silmek, eksik parayı fazlayla
  aynı cümleye sokardı. Düzeltme kaydı burada AÇILMAZ: para bu yüzeyde izlenir, muhasebe kaydı
  masaüstünde ve kendi kurallarıyla doğar (bölüm kökünün altın kuralı).

  ── v3 ANATOMİSİ (30.08 — ikinci tur) ───────────────────────────────────────
  İlk geçiş metni taşımıştı, kutuları taşımamıştı. Dört yapısal fark ölçülüp kapatıldı:
    · Üç özet satırı TEK KARTIN içinde (kesikli ayraçlarla) — çıplak satırlar sayfaya dağılıyor,
      "günün dökümü" tek bir şey olduğunu söyleyemiyordu.
    · Uyuşmazlık kenarı `error-line` (#e0b9b2), `terracotta` (#b05c2e) DEĞİL: dolu terracotta
      kutuyu bir uyarı bandına çeviriyordu; v3'ün kalıbı açık zemin + AÇIK renkli kenar + koyu
      aile metni.
    · Fark tutarı BAŞLIĞIN HİZASINDA, sağda (`body-sm`) — altta 22 punto ayrı satırdaydı ve
      cümleyle sayı iki ayrı olay gibi okunuyordu.
    · Eşleşmemiş hareket `neutral-bg` DOLGULU kutu, sayısı `card-title` Lora — kesikli bir liste
      satırıydı ve sayfanın son satırı olduğu için ekranın dışına düşmüş gibi duruyordu.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  `/money/day-end` okunur. Mutabakat üç hâlli ve üçü de çizili:
  · fark VAR   → `error-line` çerçeve + işaretli tutar (kapanan seferlerin beklenen−sayılan'ı)
  · fark YOK   → nötr çerçeve, "tutuyor" cümlesi
  · sefer YOK  → `discrepancy: null` — soru henüz sorulmadı; 0 yazmak "fark yok" YALANI olurdu
                 (fixture döneminin "sayaç yok (null ≠ 0)" disiplini, artık gerçek veride).
*/

const t = moneyCopy;

export function MoneyDayEndScreen() {
  const router = useRouter();
  const { state, retry } = useMoneyDayEnd();

  return (
    <View style={styles.screen} testID="money-day-end">
      <OperationsStackHeader
        title={t.dayEnd.title}
        /* HANGİ GÜNÜN ÖZETİ (v3:24) — "salt okuma" tek başına hangi günü anlattığını söylemiyordu;
           gün sunucudan geliyor (`summary.date`), cihazın takviminden tahmin edilmiyor. */
        subtitle={captionOf(state)}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="money-day-end-header"
      />

      {state.status === 'loading' ? (
        /* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08). Ölçüler ekranın kendi bloklarının:
           üç satırlık özet kartı 126 · uyuşmazlık kartı 96 · eşleşmemiş kutusu 64. */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[126, 96, 64]}
            label={t.common.loading}
            testID="money-day-end-loading"
          />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: retry }}
            testID="money-day-end-error"
          />
        </View>
      ) : (
        <DayEndBody summary={state.data} />
      )}
    </View>
  );
}

/**
 * Başlık altı — gün ADIYLA. Özet daha yüklenmediyse ya da düştüyse gün BİLİNMEZ ve kuyruksuz
 * yazılır: cihazın bugününü yazmak, sunucunun başka bir günü özetlediği hâlde doğru görünürdü.
 */
function captionOf(state: { status: string; data?: MoneyDayEnd }): string {
  const label = state.data === undefined ? null : dateLabelOf(state.data.date);
  return label === null ? t.dayEnd.captionNoDate : fillCopy(t.dayEnd.caption, { date: label });
}

/**
 * Uyuşmazlığın künyesi (v3:24) — "SF-26-YRNWV9 · Marc Lemoine · 17:42".
 *
 * TEK sefer varsa künyenin kendisi yazılır; BİRDEN ÇOK sefer farklıysa tek satıra üç künye
 * sığmaz ve sığdırmaya çalışmak muhasebeciye okunmaz bir dizi verirdi — o hâlde sayı yazılır
 * ("3 seferde fark var") ve döküm masaüstünde aranır, ekranın kendi kuralıyla tutarlı olarak.
 * Fark yoksa `runs` boştur ve künye HİÇ doğmaz.
 */
function runCaption(discrepancy: MoneyDayEnd['discrepancy']): string | null {
  const runs = discrepancy?.runs ?? [];
  if (runs.length === 0) return null;
  if (runs.length > 1) return fillCopy(t.dayEnd.discrepancy.manyRuns, { count: String(runs.length) });
  const run = runs[0];
  if (run === undefined) return null;
  const parts = run.courierName === null ? [run.referenceNo] : [run.referenceNo, run.courierName];
  return [...parts, timeOf(run.closedAt)].join(' · ');
}

interface DayEndBodyProps {
  summary: MoneyDayEnd;
}

function DayEndBody({ summary }: DayEndBodyProps) {
  const discrepancy = summary.discrepancy;
  const differenceCents = discrepancy === null ? null : discrepancy.countedCents - discrepancy.expectedCents;
  const calm = differenceCents === null || differenceCents === 0;

  return (
    <ScrollView contentContainerStyle={styles.body} testID="money-day-end-body">
      {/* GÜNÜN DÖKÜMÜ TEK KART (v3:24) — üç satır bir arada bir defter sayfası, ayrı ayrı üç
          cümle değil. Dolgu `none`: dikey nefes satırların kendisinde (v3: `padding:6px 16px`). */}
      <OperationsSurface tone="panel" padding="none" style={styles.summaryCard}>
        <View style={styles.summaryRow} testID="money-day-end-collected">
          <Text style={styles.rowLabel}>{t.dayEnd.collected}</Text>
          <Text style={styles.rowTotal}>{money(summary.collectedCents)}</Text>
        </View>
        {/* AYRAÇ SATIRLARIN ARASINDA — gerekçe `OperationsDashedRule` künyesinde (RN'in dash
            deseni tasarımınkiyle tutmuyor, desen ölçümden türetildi). */}
        <OperationsDashedRule />
        <View style={styles.summaryRow} testID="money-day-end-refunds">
          {/* SIFIR İADE KIRMIZI DEĞİLDİR (cihazda görüldü 30.08): "0,00 €" kırmızı yazılınca satır
              bir uyarı gibi okunuyordu — oysa iadesiz gün iyi bir gündür. Renk ancak gerçekten
              para geri gittiyse uyarır. */}
          <Text style={styles.rowLabel}>{t.dayEnd.refunds}</Text>
          <Text style={summary.refundCents === 0 ? styles.rowTotal : styles.rowRefund}>
            {signedMoney(summary.refundCents)}
          </Text>
        </View>
        <OperationsDashedRule />
        <View style={styles.summaryRow} testID="money-day-end-handover">
          <Text style={styles.rowLabel}>{t.dayEnd.courierHandover}</Text>
          <Text style={styles.rowTotal}>{money(summary.courierHandoverCents)}</Text>
        </View>
      </OperationsSurface>

      {/* ÜSTBAŞLIK HER HÂLDE NÖTR (v3:24) — v3 onu `muted` yazıyor, farkın rengine bağlamıyor:
          bölüm adı bir durum değil, bir başlık. Durumu söyleyen şey kartın kenarı ve metni. */}
      <Text style={styles.eyebrow}>{t.dayEnd.discrepancy.eyebrow}</Text>
      <OperationsSurface
        tone="panel"
        padding="lg"
        style={calm ? styles.discrepancyCalm : styles.discrepancyOpen}
        testID="money-day-end-discrepancy"
      >
        {differenceCents === null || differenceCents === 0 ? null : (
          /* CÜMLE ÖNCE, SAYI YANINDA (v3:24): "−4,50 €" tek başına ne olduğunu söylemiyor — eksi
             işareti eksik parayı mı fazlayı mı gösteriyor, hangi adımda doğdu? Başlık ikisini de
             söylüyor, sayı onun HİZASINDA duruyor (altında ayrı bir satır değil). */
          <View style={styles.discrepancyHead}>
            <View style={styles.discrepancyHeadText}>
              <Text style={styles.discrepancyHeadline}>
                {fillCopy(t.dayEnd.discrepancy.headline, {
                  amount: money(Math.abs(differenceCents)),
                  direction: differenceCents < 0 ? t.dayEnd.discrepancy.short : t.dayEnd.discrepancy.over,
                })}
              </Text>
              {/* HANGİ SEFER, KİM, NE ZAMAN (v3:24) — bir eksiğin peşine düşen muhasebeci neyi
                  arayacağını bilmeli; toplam tek başına "bir yerde 4,50 € eksik" diyordu.
                  Sözleşmeye 30.08'de eklendi (`discrepancy.runs`). */}
              {runCaption(discrepancy) === null ? null : (
                <Text style={styles.discrepancyMeta} testID="money-day-end-discrepancy-runs">
                  {runCaption(discrepancy)}
                </Text>
              )}
            </View>
            <Text style={styles.discrepancyValue}>{signedMoney(differenceCents)}</Text>
          </View>
        )}
        {/* ÖLÇÜM CÜMLESİ YALNIZ İKİ SAYI. "Eksi = eksik" açıklaması buradan ÇIKARILDI (cihazda
            görüldü 30.08): yön zaten başlıkta yazılı ve fark ARTI çıktığında o cümle ekranda duran
            sayıyla çelişiyordu. */}
        <Text style={calm ? styles.discrepancyBodyCalm : styles.discrepancyBody}>
          {discrepancy === null
            ? t.dayEnd.discrepancy.noRun
            : differenceCents === 0
              ? t.dayEnd.discrepancy.none
              : fillCopy(t.dayEnd.discrepancy.body, {
                  expected: money(discrepancy.expectedCents),
                  delivered: money(discrepancy.countedCents),
                })}
        </Text>
        {/* ÇÖZÜM NEREDE (v3:24) — ekran düzeltmiyor; nerede düzeltildiğini söylemezse muhasebeci
            burada bir düğme arar. v3 bu satırı da hata ailesinin rengiyle yazıyor: aynı kutunun
            içinde gri bir cümle, kartın parçası değil dipnotu gibi okunuyordu. */}
        {calm ? null : <Text style={styles.discrepancyBody}>{t.dayEnd.discrepancy.resolution}</Text>}
      </OperationsSurface>

      {/* DOLGULU KUTU, SATIR DEĞİL (v3:24) — sayfanın son bloğu ve kesikli bir satır olarak
          ekranın dışına düşmüş gibi duruyordu. `neutral-bg` dolgu onu sayfaya bağlıyor; sayı
          `card-title` Lora, çünkü bu bir sayaç — bir satır değeri değil. */}
      <OperationsSurface tone="panel" padding="lg" style={styles.unmatched} testID="money-day-end-unmatched">
        <View style={styles.unmatchedRow}>
          {/* SAYININ NE OLDUĞU ALTINDA (v3:24): "Eşleşmemiş hareket · 3" tek başına neyle
              eşleşmediğini söylemiyordu — banka ekstresi. */}
          <View style={styles.rowText}>
            <Text style={styles.unmatchedLabel}>{t.dayEnd.unmatched.label}</Text>
            <Text style={styles.rowHint}>{t.dayEnd.unmatched.hint}</Text>
          </View>
          <Text style={styles.unmatchedCount}>{String(summary.unmatchedMovementCount)}</Text>
        </View>
      </OperationsSurface>

      {/* KAPANIŞ CÜMLESİ (v3:24) — bu ekranın ne OLMADIĞI: kasa kapatmaz, sonucu gösterir. */}
      <Text style={styles.footnote} testID="money-day-end-footnote">
        {t.dayEnd.footnote}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  skeleton: {
    paddingTop: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  /* SAYFA KENARI 20 (v3: `padding:0 20px 24px`) — ilk geçiş 22 (`6xl`) yazmıştı. */
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },

  /* ── GÜNÜN DÖKÜMÜ ─────────────────────────────────────────────────────────── */
  summaryCard: {
    paddingHorizontal: operationsTheme.space['3xl'],
    paddingVertical: operationsTheme.space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
  },
  rowLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  rowTotal: {
    // v3: `700 15px` — ölçekte `body`.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowRefund: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.error,
  },

  /* ── UYUŞMAZLIK ───────────────────────────────────────────────────────────── */
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    textTransform: 'uppercase',
    marginTop: operationsTheme.space.sm,
  },
  /* AÇIK UYUŞMAZLIK: ZEMİN DE PEMBE (kullanıcı bulgusu 30.08). `error-bg` operasyon mobilde
     tasarımın ölçülen değerine çekildi (#fdf6f4) — tabanın #f4e3e0'ı bu yüzeyde dolu bir uyarı
     bandı gibi duruyordu; v3'ün kalıbı çok açık zemin + renkli kenar. */
  discrepancyOpen: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
    gap: operationsTheme.space.lg,
  },
  discrepancyCalm: {
    borderColor: operationsTheme.colors['sand-500'],
    gap: operationsTheme.space.lg,
  },
  discrepancyHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.lg,
  },
  discrepancyHeadText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  discrepancyHeadline: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  /* KÜNYE NÖTR GRİ (v3:24) — başlık kırmızı, künye `muted`: satırın alarmı bir kez verilir,
     "hangi sefer" bilgisi onun altında sakin durur. */
  discrepancyMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  discrepancyValue: {
    // v3: `700 14px` — başlığın HİZASINDA, ölçekte `body-sm`.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.error,
  },
  discrepancyBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  /* SAKİN HÂLDE CÜMLE NÖTR: "uyuşmazlık yok" ve "kapanan sefer yok" birer iyi haber; hata
     ailesinin rengiyle yazılsalardı kutu boşuna alarm verirdi. */
  discrepancyBodyCalm: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },

  /* ── EŞLEŞMEMİŞ HAREKET ───────────────────────────────────────────────────── */
  unmatched: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    // v3'te bu kutunun çerçevesi YOK — dolgusu kendi kenarı.
    borderWidth: 0,
  },
  unmatchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  unmatchedLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  rowHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.body,
  },
  unmatchedCount: {
    // v3: `600 24px 'Lora'` — sayaç, satır değeri değil.
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },

  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    /* v3 dipnot grisi `tab-inactive` (#a8a191) — gerekçe `money-screen.tsx` künyesinde. */
    color: operationsTheme.colors['tab-inactive'],
    marginTop: operationsTheme.space['2xs'],
  },
});
