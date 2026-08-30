import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { upperIn } from '@/lib/i18n/locale';
import { captionOf } from '@/lib/operations/caption';
import { money } from '@/lib/operations/money';
import { todayLabel } from '@/lib/operations/stamp';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsIdentity, useOperationsWorkplace } from '@/screens/operations/sections-context';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { MoneyOverview, PendingCollection } from '@lezzet/types';
import { moneyCopy } from './copy';
import { useMoneyOverview } from './use-money.hook';

/*
  PARA KÖKÜ · TAHSİLAT İZLEME (v3:23) — bölümün kökü ve SALT OKUMA.

  ── HİÇBİR YAZMA AKSİYONU ÇİZİLMEZ ──────────────────────────────────────────
  Tasarımın altın kuralı ekranın son satırında yazılı: *"'bakiye düzeltme' diye bir kavram yok."*
  Para bu yüzeyde DÜZELTİLMEZ, yalnız izlenir; kayıt masaüstünde ve muhasebe kurallarıyla doğar.
  Bu yüzden ekranda tek bir eylem var ve o da gezinme: "gün sonu →".

  ── v3 ANATOMİSİ (30.08 — ikinci tur) ───────────────────────────────────────
  İlk geçiş METNİ taşıdı, YERLEŞİMİ taşımadı; kullanıcı cihazda gördü ve tur tekrarlandı. Beş
  yapısal fark ölçülüp kapatıldı:
    · Günün parası KOYU kart (`ink`) — açık panel değil. Ekranın ilk sorusu ("bugün ne girdi")
      sayfanın öteki kutularıyla aynı sesle konuşamaz; koyu blok onu bir başlık yapıyor.
    · Bekleyen tahsilatlar KART, kesikli liste satırı değil — her satır kendi kutusu (v3 gap 8).
    · Kuryenin üstündeki para UYARI tonlu (`warning-line` kenar + terracotta tutar): o para
      henüz kasada değil, nötr bir kart onu "gelmiş" gibi gösteriyordu.
    · Hesap bakiyeleri TEK kartın içinde, kesikli ayraçlarla — çıplak satırlar sayfaya dağılıyordu.
    · Dipnot TEK ve `tab-inactive` — dört ayrı not vardı, üçü tasarımda hiç yok.

  ── ZİL YOK, METİN EYLEMİ VAR — VE YERİ DEĞİŞTİ ─────────────────────────────
  v3 "gün sonu →"yu başlığın sağ yuvasından alıp **BEKLEYEN TAHSİLATLAR başlığının yanına**
  koyuyor: eylem, götürdüğü listenin yanında duruyor. Başlığın sağ yuvasında yalnız kimlik kaldı
  (oturum çıkışı — kabuğun kuralı, tasarımın her ekranda tekrarlamadığı ortak öğe).

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  `/money/overview` okunur; boş liste de, yüklenememe de gerçek hâller ve ikisi de çizili.
  Bekleyen küme GÜNÜN ödenmemiş siparişleridir (sözleşme künyesi) — tüm zamanların dökümü
  masaüstü muhasebenin işi.

  ── HESAP SATIRLARI ADIYLA ──────────────────────────────────────────────────
  v2 iki sabit satır çiziyordu (Kasa · Banka); defterde hesap SAYISI işletme kurulumudur (Kasa,
  Revolut, Crédit Mutuel, Stripe…). Satır adı SUNUCUDAN gelir — iki ada indirmek, iki hesabı tek
  satırda toplamak ya da birini gizlemek olurdu.
*/

const t = moneyCopy;
const shell = operationsCopy;

export function MoneyTrackingScreen() {
  const { state, retry } = useMoneyOverview();
  const identity = useOperationsIdentity();
  const workplace = useOperationsWorkplace();

  return (
    <View style={styles.screen} testID="operations-section-money">
      <OperationsSectionHeader
        section="money"
        eyebrow={shell.sections.money.eyebrow}
        title={shell.sections.money.title}
        /* KİM · HANGİ GÜN · NEREDE (v3:23) — para ekranı bir günün fotoğrafıdır; hangi güne
           baktığı yazılmazsa "bugün gerçekleşen" cümlesi hangi günü anlattığını söylemez.
           TESİSİN ADI ARTIK GELİYOR (30.08, `/operations/scope`) ama **kuyruk şartlı**: satır
           personelin BAĞLAMINI söyler ("nerede çalışıyorsun"), sayıların süzgecini değil — para
           okumaları depo boyutu taşımaz (`money.ts` künyesi: *defter işletmenin*). Kapsamı iki
           tesisli bir muhasebecide (seed'in `muhasebe` hâli) ad gelmez ve satır kuyruksuz kalır;
           tesislerden birini yazmak, ekranın kendi künyesinde yalan söylemesi olurdu (CLAUDE §1). */
        context={captionOf(identity.name, todayLabel(), workplace)}
        identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      />

      {state.status === 'loading' ? (
        /* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz ve söndüğü an
           sayfa zıplar. Ölçüler ekranın kendi bloklarının: koyu günün kartı 146, bekleyen tahsilat
           kartı 60 (iki metin satırı + `md` dolgu). */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[146, 60, 60]}
            label={t.common.loading}
            testID="money-tracking-loading"
          />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: retry }}
            testID="money-tracking-error"
          />
        </View>
      ) : (
        <OverviewBody overview={state.data} />
      )}
    </View>
  );
}

interface OverviewBodyProps {
  overview: MoneyOverview;
}

function OverviewBody({ overview }: OverviewBodyProps) {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.body} testID="money-tracking-body">
      {/* GÜNÜN PARASI EN ÜSTTE VE KOYU (v3:23) — muhasebenin ilk sorusu "bugün ne girdi". Toplam
          kırılımdan TÜRETİLİR: ayrı bir toplam alanı, bir gün kırılımla ayrışabilecek ikinci bir
          gerçek olurdu. Tasarımın rozeti ("14 tahsilat") ÇİZİLMEDİ — `todayByMethod` yöntem
          başına yalnız TUTAR taşıyor, adet sözleşmede yok (uyuşmazlık 16). */}
      <OperationsSurface tone="ink" padding="none" style={styles.todayCard} testID="money-today-card">
        {/* ROZET TUTARIN YANINDA (v3:23) — "14 tahsilat". Adet tutardan TÜREMEZ: aynı toplam iki
            tahsilattan da kırktan da gelebilir ve muhasebecinin "gün yoğun muydu" sorusunun cevabı
            adettedir. Sözleşmeye 30.08'de eklendi (`todayCount`), önce yalnız tutar taşınıyordu. */}
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
      {/* PARA KİMDE (v3:23) — kart SEFER BAŞINA: "Marc Lemoine · SF-26-YRNWV9". Önce tek toplam
          yazılıyordu ve muhasebecinin asıl sorusu cevapsız kalıyordu; "186,00 € kuryelerde" ile
          "186,00 € Marc'ta" aynı cümle değil. Sözleşmeye 30.08'de eklendi (`CourierFloatRow`).
          UYARI TONU: kenar `warning-line`, tutar terracotta — bu para kuryenin cebinde ve sefer
          kapanışına dek kasada değil; nötr bir kartta "gelmiş" gibi okunuyordu. */}
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
    </ScrollView>
  );
}

/**
 * Bekleyen satırın ETİKETİ (v3:23) — "KAPIDA · KART". Yöntem biliniyorsa eklenir, bilinmiyorsa
 * (henüz seçilmemiş kapıda ödeme) etiket yöntemsiz kalır — uydurulmaz.
 *
 * v2'de bu bir CÜMLEYDİ ("Kapıda 60,00 € · kart") ve tutarı içine alıyordu; tutar artık ayrı ve
 * büyük yazılıyor, etiket yalnız onun künyesi.
 */
function pendingTag(item: PendingCollection): string {
  const kind = item.kind === 'door' ? t.track.pending.doorTag : t.track.pending.partialTag;
  if (item.method === null) return kind;
  /* ETİKETİN TAMAMI BÜYÜK HARF (v3:23 — görsel ajanı ölçtü 30.08): tasarım "KAPIDA · KART" diyor,
     kod "KAPIDA · nakit" yazıyordu; tek satırda iki ayrı büyüklük etiketi ikiye bölüyordu.
     Büyütme DİLİN kuralıyla (`upperIn`, sabit `tr`) — stilin `textTransform`u Android'de CİHAZIN
     diliyle uygular ve "nakit" Fransızca arayüzde "NAKIT" olurdu (gerekçe `section-header.tsx`). */
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

  /* ── KURYENİN ÜSTÜNDEKİ PARA ──────────────────────────────────────────────── */
  /* TONLU KART: ZEMİN DE RENKLİ (kullanıcı bulgusu 30.08 — "cihazda göremiyorum"). Kenar tek
     başına yetmedi; `warning-bg` çok açık bir şeftali ve kartı nötr olmaktan çıkaran şey o.
     Token künyesi niçin eşiğin altında olmasına rağmen açıldığını yazıyor (kanal dengesi). */
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
