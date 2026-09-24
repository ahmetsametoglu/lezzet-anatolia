import { useRouter } from 'expo-router';
import { Fragment, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { captionOf } from '@/lib/operations/caption';
import { money } from '@/lib/operations/money';
import { todayLabel } from '@/lib/operations/stamp';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsIdentity, useOperationsWorkplace } from '@/screens/operations/sections-context';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import type { MoneyOverview, PendingCollection } from '@lezzet/types';
import { moneyCopy } from './copy';
import { useMoneyOverview } from './use-money.hook';

/*
  Para kökü, tahsilat izleme: salt okumadır, para burada düzeltilmez, yalnız izlenir; tek eylem "gün sonu →" gezintisidir ve götürdüğü listenin yanında durur.
  Veri `/money/overview`dandır; bekleyen küme günün ödenmemiş siparişleridir ve hesap satırları defterdeki adıyla çizilir, çünkü hesap sayısı işletme kurulumudur.
*/

const t = moneyCopy;
const shell = operationsCopy;

export function MoneyTrackingScreen() {
  const { state, retry } = useMoneyOverview();
  const identity = useOperationsIdentity();
  const workplace = useOperationsWorkplace();

  /* Başlık kaydırıcının içindedir: tam başlık sayfayla yukarı kayar ve yerini mikro başlık alır; dışarıda kalsaydı ikisi üst üste binerdi. */
  const header = (
    <OperationsSectionHeader
      section="money"
      eyebrow={shell.sections.money.eyebrow}
      title={shell.sections.money.title}
        /* Kim, hangi gün, nerede: para ekranı bir günün fotoğrafıdır; tesis adı personelin bağlamıdır, süzgeç değil, kapsamı tek tesis çözmeyende yazılmaz. */
      context={captionOf(identity.name, todayLabel(), workplace)}
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
    />
  );

  return (
    <View style={styles.screen} testID="operations-section-money">
      {state.status === 'loading' ? (
        /* İlk yük iskelettir, halka değil: halka yerleşim tutmaz ve söndüğü an sayfa zıplar; ölçüler ekranın kendi bloklarınındır. */
        <>
          {header}
          <View style={styles.skeleton}>
            <OperationsSkeletonList
              heights={[146, 60, 60]}
              label={t.common.loading}
              testID="money-tracking-loading"
            />
          </View>
        </>
      ) : state.status === 'error' ? (
        <>
          {header}
          <View style={styles.errorBlock}>
            <OperationsNoticeBlock
              variant="error"
              title={t.common.error.title}
              description={t.common.error.body}
              retry={{ label: t.common.error.retry, onPress: retry }}
              testID="money-tracking-error"
            />
          </View>
        </>
      ) : (
        <OverviewBody overview={state.data} header={header} />
      )}
    </View>
  );
}

interface OverviewBodyProps {
  overview: MoneyOverview;
  /** Sayfayla birlikte kayan tam başlık — kaydırıcının ilk çocuğu. */
  header: ReactNode;
}

function OverviewBody({ overview, header }: OverviewBodyProps) {
  const router = useRouter();

  return (
    /* KABUK DAVRANIŞLARI TEK KAPIDAN (M1b · M1c): yapışkan mikro başlık ve sekme çubuğu gizlemesi
       bu kaptan besleniyor — ekranın yazdığı tek şey ekran adı. */
    <OperationsScreenScroll
      title={shell.sections.money.title}
      caption={shell.sections.money.tab}
      contentContainerStyle={styles.body}
      testID="money-tracking-body"
    >
      {header}
      {/* Günün parası en üstte ve koyu: muhasebenin ilk sorusu "bugün ne girdi"; toplam kırılımdan türer ki ikinci bir gerçek doğmasın. */}
      <OperationsSurface tone="ink" padding="none" style={styles.todayCard} testID="money-today-card">
        {/* Rozet tutarın yanındadır: adet tutardan türemez ve "gün yoğun muydu" sorusunun cevabı adettedir. */}
        <View style={styles.todayHead}>
          <View style={styles.todayHeadText}>
            <Text style={styles.eyebrowOnInk}>{t.track.today.eyebrow}</Text>
            {overview.todayByMethod.length === 0 ? null : (
              <Text style={styles.todayTotal} testID="money-today-total">
                {money(overview.todayByMethod.reduce((sum, row) => sum + row.cents, 0))}
              </Text>
            )}
          </View>
          {overview.todayCount === 0 ? null : (
            <Text style={styles.todayBadge} testID="money-today-count">
              {fillCopy(t.track.today.count, { count: String(overview.todayCount) })}
            </Text>
          )}
        </View>
        {overview.todayByMethod.length === 0 ? (
          <Text style={styles.emptyOnInk} testID="money-today-empty">
            {t.track.today.empty}
          </Text>
        ) : (
          <>
            <View style={styles.todayCells}>
              {overview.todayByMethod.map((row) => (
                <View key={row.method} style={styles.todayCell} testID={`money-today-${row.method}`}>
                  {/* ÇEK AMBER (v3:23) — koyu kartın öteki sayıları krem, çek `on-ink-warn`.
                      Çek bir DURUMDUR, bir tutar değil: elde duran, henüz tahsil edilmemiş kâğıt. */}
                  <Text style={row.method === 'cheque' ? styles.todayCellWarn : styles.todayCellValue}>
                    {money(row.cents)}
                  </Text>
                  <Text style={styles.todayCellLabel}>{t.common.method[row.method]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </OperationsSurface>

      {/* EYLEM LİSTESİNİN YANINDA (v3:23) — "gün sonu →" başlığın sağ yuvasından buraya taşındı. */}
      <View style={styles.sectionRow}>
        <Text style={styles.eyebrow}>{t.track.pending.eyebrow}</Text>
        <PressableSurface
          onPress={() => router.navigate('/day-end')}
          feedback="opacity"
          compact
          accessibilityLabel={t.track.dayEnd}
          testID="money-day-end-link"
        >
          <Text style={styles.dayEndLabel}>{t.track.dayEnd}</Text>
        </PressableSurface>
      </View>

      {overview.pending.length === 0 ? (
        <Text style={styles.emptyLine} testID="money-pending-empty">
          {t.track.pending.empty}
        </Text>
      ) : (
        <View style={styles.cardList}>
          {overview.pending.map((item) => (
            <OperationsSurface
              key={item.orderId}
              tone="panel"
              padding="md"
              testID={`money-pending-${item.orderId}`}
            >
              <View style={styles.cardRow}>
                <View style={styles.rowText}>
                  {/* REFERANS VE MÜŞTERİ TEK SATIRDA (v3:23) — satırın kimliği ikisinin birleşimi;
                      ayrı satırlara bölündüğünde kart iki başlıklı görünüyordu. */}
                  <Text style={styles.rowTitle}>
                    {item.referenceNo ?? t.track.pending.noRef} · {item.customerName}
                  </Text>
                  <Text style={styles.rowMeta}>{t.track.pending.state[item.status]}</Text>
                </View>
                {/* TUTAR BÜYÜK, ETİKET ALTINDA (v3:23): satırın cevabı tutardır; "kapıda mı, kalan
                    mı" ve yöntem onun künyesi — tek cümleye dizildiğinde tutar cümlenin içinde
                    kayboluyordu. Etiket TERRACOTTA: bu para henüz kasada değil. */}
                <View style={styles.pendingRight}>
                  <Text style={styles.pendingAmount}>{money(item.remainingCents)}</Text>
                  <Text style={styles.pendingTag}>{pendingTag(item)}</Text>
                </View>
              </View>
            </OperationsSurface>
          ))}
        </View>
      )}

      <Text style={styles.eyebrow}>{t.track.float.eyebrow}</Text>
      {/* Para kimde: kart sefer başınadır (kurye adı ve sefer künyesi); uyarı tonundadır, çünkü bu para sefer kapanışına dek kasada değildir. */}
      {overview.courierFloat.length === 0 ? (
        <Text style={styles.emptyLine} testID="money-float-empty">
          {t.track.float.empty}
        </Text>
      ) : (
        <View style={styles.cardList} testID="money-courier-float">
          {overview.courierFloat.map((row) => (
            <OperationsSurface
              key={row.runId}
              tone="panel"
              padding="lg"
              style={styles.floatCard}
              testID={`money-float-${row.runId}`}
            >
              <View style={styles.cardRow}>
                <View style={styles.rowText}>
                  {/* Kurye adı okunamadıysa künye KUYRUKSUZ kalır — uydurma bir ad, parayı yanlış
                      kişinin üstünde gösterirdi. */}
                  <Text style={styles.rowTitle}>
                    {row.courierName === null ? row.referenceNo : `${row.courierName} · ${row.referenceNo}`}
                  </Text>
                  <Text style={styles.rowMeta}>{t.track.float.state}</Text>
                </View>
                <Text style={styles.floatTotal}>
                  {money(row.cashCents + row.cardCents + row.chequeCents)}
                </Text>
              </View>
            </OperationsSurface>
          ))}
        </View>
      )}

      <Text style={styles.eyebrow}>{t.track.balances.eyebrow}</Text>
      {/* HESAPLAR TEK KARTIN İÇİNDE (v3:23) — satırlar sayfaya çıplak dağılmaz; kart onları bir
          defter sayfası gibi bir arada tutuyor. Dolgu `none`: dikey nefes satırların kendisinde. */}
      <OperationsSurface tone="panel" padding="none" style={styles.ledgerCard}>
        {overview.accounts.map((account, index) => (
          /* AYRAÇ SATIRLARIN ARASINA (v3:23) — satırın ALTINA değil: son satırın altında hat
             olmamalı ve "sonuncu mu" sorusunu her satıra sordurmak yerine ayraç aradaki yerini
             kendisi alıyor. */
          <Fragment key={`${account.type}-${account.name}`}>
            {index === 0 ? null : <OperationsDashedRule />}
            <View style={styles.ledgerRow} testID={`money-balance-${index}`}>
              <Text style={styles.rowLabel}>{account.name}</Text>
              <Text style={styles.rowValue}>{money(account.cents)}</Text>
            </View>
          </Fragment>
        ))}
      </OperationsSurface>

      {/* TEK KAPANIŞ CÜMLESİ (v3:23) — bu ekranın ne OLMADIĞINI söylüyor: hiçbir şey yazmaz, kasa
          kapatmaz, bakiye düzeltmez. v3 bunu tek dipnotta topluyor; ilk geçişte üç ayrı bloğun
          altına dağılmıştı ve her biri kendi bölümünün kuralını tekrar ediyordu. */}
      <Text style={styles.footnote} testID="money-tracking-footnote">
        {t.track.footnote}
      </Text>
    </OperationsScreenScroll>
  );
}

/** Bekleyen satırın etiketi ("KAPIDA · KART"): yöntem biliniyorsa eklenir, bilinmiyorsa etiket yöntemsiz kalır, uydurulmaz. */
function pendingTag(item: PendingCollection): string {
  const kind = item.kind === 'door' ? t.track.pending.doorTag : t.track.pending.partialTag;
  if (item.method === null) return kind;
  /* Etiketin tamamı büyük harftir; büyütme dilin kuralıyla (`upperIn`, sabit `tr`), çünkü stilin `textTransform`u Android'de cihazın diliyle uygular ve "nakit" "NAKIT" olurdu. */
  const method = upperIn(t.common.method[item.method], 'tr');
  return fillCopy(t.track.pending.tagWithMethod, { kind, method });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  dayEndLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.olive,
  },
  skeleton: {
    paddingTop: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  /* SAYFA KENARI 20 (v3: `padding:0 20px`) — ilk geçiş 22 (`6xl`) yazmıştı; yığın başlığının
     v3 ölçümü de aynı yöne bakıyor (`stack-header.tsx`: kenar 22 → 20). */
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.lg,
  },

  /* ── GÜNÜN PARASI · KOYU KART ─────────────────────────────────────────────── */
  todayCard: {
    /* v3: `padding:18px` — kitin `lg`si (14/16) tasarımın 18'ini vermiyor ve bu kart sayfanın en
       büyük bloğu; dolgu `none` alınıp burada ölçülen değer yazılıyor. */
    padding: operationsTheme.space['4xl'],
    gap: operationsTheme.space['2xs'],
    marginTop: operationsTheme.space.sm,
  },
  todayHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  todayHeadText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  /* SAYAÇ ROZETİ — koyu bloğun içindeki bir tık açık alan (`ink-inset`, token künyesi bu rolü
     adıyla anıyor) + `sand-150` metin. Yarıçap `badge`: tasarımda 11, ölçekte 12. */
  todayBadge: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['sand-150'],
    backgroundColor: operationsTheme.colors['ink-inset'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.xl,
    overflow: 'hidden',
  },
  eyebrowOnInk: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['on-ink-muted'],
    textTransform: 'uppercase',
  },
  todayTotal: {
    /* v3: `600 30px 'Lora'` — ölçekte `h1-sm`. İlk geçiş `card-title` (24) yazmıştı; koyu kartın
       rakamı ekranın en büyük sayısıdır ve bir kart başlığıyla aynı kademede duramaz. */
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['h1-sm'],
    color: operationsTheme.colors['on-image'],
  },
  todayCells: {
    flexDirection: 'row',
    marginTop: operationsTheme.space.xl,
    paddingTop: operationsTheme.space.xl,
    /* ÜÇ SAYIYI AYIRAN HAT (v3): kartın kendi zemininden bir tık açık, `on-ink-line`. */
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['on-ink-line'],
    gap: operationsTheme.space.lg,
  },
  todayCell: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  todayCellValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors['on-image'],
  },
  todayCellWarn: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors['on-ink-warn'],
  },
  todayCellLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors['on-ink-muted'],
  },
  emptyOnInk: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-muted'],
    paddingTop: operationsTheme.space.md,
  },

  /* ── BÖLÜM BAŞLIKLARI ─────────────────────────────────────────────────────── */
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    marginTop: operationsTheme.space.md,
  },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    textTransform: 'uppercase',
    marginTop: operationsTheme.space.md,
  },

  /* ── KART LİSTESİ ─────────────────────────────────────────────────────────── */
  cardList: {
    gap: operationsTheme.space.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  pendingRight: {
    alignItems: 'flex-end',
    gap: operationsTheme.space['2xs'],
  },
  pendingAmount: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  pendingTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    letterSpacing: emToDp(operationsTheme.text['badge--letter-spacing'], operationsTheme.text['badge-sm']),
    color: operationsTheme.colors.terracotta,
  },
  emptyLine: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.lg,
  },

  /* Kuryenin üstündeki para: tonlu kart, zemin de renklidir, çünkü kenar tek başına kartı nötrlükten çıkarmıyordu. */
  floatCard: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  floatTotal: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.terracotta,
  },

  /* ── HESAP BAKİYELERİ ─────────────────────────────────────────────────────── */
  ledgerCard: {
    paddingHorizontal: operationsTheme.space['3xl'],
    paddingVertical: operationsTheme.space.sm,
  },
  /* Ayraç artık satırın kenarlığı DEĞİL, aradaki `OperationsDashedRule` — gerekçe (RN'in dash
     deseni tasarımınkiyle tutmuyor) o komponentin künyesinde ölçümüyle yazılı. */
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
  },
  rowLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.body,
  },
  rowValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },

  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    /* v3 dipnot grisi `tab-inactive` (#a8a191) — `muted` bir kademe koyu ve dipnotu bloğun
       kendisiyle aynı sesle konuşturuyordu (token künyesi: "ekranın söylediği şeyi değil, o şeyin
       kuralını yazan satır"). */
    color: operationsTheme.colors['tab-inactive'],
    marginTop: operationsTheme.space.xs,
  },
});
