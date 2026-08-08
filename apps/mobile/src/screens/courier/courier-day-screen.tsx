import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { NotificationBell } from '@/components/operations/notification-bell';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayLabel, money, shortName, turkishUpper } from './courier-format';
import { useCourierDay } from './use-courier-day.hook';

/*
  K1 · GÜNÜN ROTASI (v2:33-94) — kurye bölümünün kökü.

  ── BÖLÜM KÖKÜ ARTIK KENDİ GÖVDESİNİ ÇİZİYOR ────────────────────────────────
  Kabuk dilimi (21.9) dört bölümü tek `OperationsSectionScreen`den çiziyordu ve künyesinde
  "ayrıştıkları yer GÖVDEDİR" diyordu. Kurye gövdesi geldiği için bu ekran o ortak iskeletin
  BAŞLIĞINI kullanıyor (`OperationsSectionHeader` + zil, birebir aynı) ama gövdesini kendi
  yazıyor. Depo/Yönetim/Para hâlâ ortak ekranda.

  ── ÜSTBAŞLIĞIN KUYRUĞU ARTIK VERİ ──────────────────────────────────────────
  v2:38 "KURYE · 8 AĞUSTOS · MUSA K." diyor. Gün UÇTAN gelir (`date` cevabın zorunlu alanı —
  istemci kendi hesaplamaz), ad kapıdan (`/me`, oturum bağlamı). Gün henüz okunmadıysa parça
  YAZILMAZ: uydurma bir tarih, kuryenin hangi günü gördüğü sorusunu yanlış cevaplardı.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi.** v2'nin demo sözlüğünde üç veri hâli var (dolu/boş/hata) ve
     "yükleniyor" yok — çünkü şablon veriyi yerel dizeden okuyor, ağ yok. Gerçek ekranda o hâl VAR
     ve boş listeyle göstermek "bugün rota yok" demek olurdu.
  2. **"Eşitlenmeyi bekliyor" rozeti ve "eşitleme reddi" kartı ÇİZİLMEDİ** (v2:69-74, 83). İkisi de
     ÇEVRİMDIŞI KUYRUĞUN göstergeleridir ve kuyruk bu dilimde yok (21.13 hattı). Fixture'la
     doldurmak, olmayan bir makinenin ekranını çizmek olurdu; yerine dürüst davranış kondu —
     bağlantı yokken işaret gönderilemez ve teslimat ekranı bunu hata olarak söyler.
  3. **"±" (kısmi) durak dairesi hiç doğmaz** (v2:852). Sözleşmenin durak sonucu dörtlü:
     `pending · delivered · unreachable · refused` — "kısmi" ayrı bir sonuç DEĞİL, teslim edilmiş
     bir durağın kalan borcudur. O bilgi satırın alt metninde yazılıyor.
  4. **"Yola çıktım"ın sonucu için bir bildirim satırı eklendi** (v2'de yok — şablonun düğmesi yalnız
     yerel bir bayrak çeviriyor, ağa çıkmıyor). Gerçek kapı KISMİ başarı döndürebiliyor ("3 yola
     çıktı, 1 hazırlanmayı bekliyor") ve o cümlenin yazılacak bir yeri olmadan cevap yutulurdu.
     Yapışkan alana, CTA'nın ÜSTÜNE kondu: kurye listenin neresinde olursa olsun görür.
*/

const t = courierCopy;
const shell = operationsCopy;

/** Durak dairesinin dört hâli — v2:851-855'in renk üçlüleri, token karşılıklarıyla. */
type CircleTone = 'delivered' | 'issue' | 'next' | 'idle';

export function CourierDayScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  const unread = useOperationsNotifications().length;

  const stops = day.stops;
  const doneCount = stops.filter((stop) => stop.outcome === 'delivered').length;
  const issueCount = stops.filter((stop) => stop.outcome === 'unreachable' || stop.outcome === 'refused').length;
  const openCount = stops.length - doneCount - issueCount;
  const doorStops = stops.filter((stop) => stop.outcome === 'pending' && stop.payment.dueAmountCents !== null);
  const doorTotal = doorStops.reduce((total, stop) => total + (stop.payment.dueAmountCents ?? 0), 0);
  /** Sıradaki durak — v2:848: ilk sonuçlanmamış durak, koyu daireyle işaretlenir. */
  const nextOrderId = stops.find((stop) => stop.outcome === 'pending')?.orderId ?? null;

  /** Başlatma havadayken düğme kendi hâlini söyler — basılamaz olduğu ayrıca `disabled`la duyulur. */
  const ctaStartLabel = day.starting ? t.day.starting : t.day.startCta;

  const eyebrow = [t.day.eyebrow, day.date === null ? null : dayLabel(day.date), turkishUpper(shortName(userName))]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  const header = (
    <OperationsSectionHeader
      section="courier"
      eyebrow={eyebrow}
      title={t.day.title}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={
            unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })
          }
          count={unread}
          testID="operations-bell"
        />
      }
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.day.loading} label={t.day.loading} testID="courier-day-loading" />
        </View>
      </View>
    );
  }

  if (day.status === 'error') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.day.error.title}
            description={t.day.error.body}
            retry={{ label: t.day.error.retry, onPress: day.reload }}
            testID="courier-day-error"
          />
        </View>
      </View>
    );
  }

  if (stops.length === 0) {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.day.empty.title}
            description={t.day.empty.body}
            testID="courier-day-empty"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="operations-section-courier">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="courier-day-list">
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>
            {doneCount}
            <Text style={styles.progressTotal}>{`/${stops.length}`}</Text>
          </Text>
          <View style={styles.progressTrack} testID="courier-day-progress">
            <View style={[styles.progressFill, { width: `${Math.round((doneCount / stops.length) * 100)}%` }]} />
          </View>
          {/* Ölçülemeyen değer SIFIR DEĞİLDİR: taslak düştüyse "bilinmiyor" yazılır (CLAUDE §1). */}
          <Text style={styles.pocket}>
            {day.collectedCents === null
              ? t.day.pocketUnknown
              : fillCopy(t.day.pocket, { amount: money(day.collectedCents) })}
          </Text>
        </View>

        {doorStops.length === 0 ? null : (
          <Text style={styles.doorLeft} testID="courier-day-door-left">
            {fillCopy(t.day.doorLeft, { n: String(doorStops.length), amount: money(doorTotal) })}
          </Text>
        )}

        {day.started ? null : (
          <View style={styles.startHint} testID="courier-day-start-hint">
            <Text style={styles.startHintText}>{t.day.startHint}</Text>
          </View>
        )}

        {stops.map((stop, index) => (
          <StopRow
            key={stop.orderId}
            stop={stop}
            order={index + 1}
            tone={circleTone(stop, stop.orderId === nextOrderId, day.started)}
            started={day.started}
            onPress={() => router.navigate({ pathname: '/delivery/[orderId]', params: { orderId: stop.orderId } })}
          />
        ))}
      </ScrollView>

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (v2:89). */}
      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {day.startNotice === null ? null : (
          <View style={styles.startNoticeBlock}>
            <Text
              style={[styles.startNotice, styles[`startNotice_${day.startNotice.tone}`]]}
              accessibilityRole="alert"
              testID="courier-day-start-notice"
            >
              {day.startNotice.text}
            </Text>
            {/* Gün başladıktan sonra birincil düğme "Günü kapat"a döner; hazırlığı geciken durak
                için İKİNCİ bir başlatma yolu olmasaydı o durak uygulamadan yola çıkarılamazdı. */}
            {day.startNotice.canRetry ? (
              <TextAction
                label={t.day.start.retry}
                onPress={day.start}
                disabled={day.starting}
                testID="courier-day-start-retry"
              />
            ) : null}
          </View>
        )}
        <PressableSurface
          onPress={day.started ? () => router.navigate('/day-close') : day.start}
          disabled={day.starting}
          feedback="shadow"
          style={[styles.cta, day.started ? styles.ctaClose : styles.ctaStart]}
          accessibilityLabel={day.started ? t.day.close : ctaStartLabel}
          testID="courier-day-cta"
        >
          <Text style={[styles.ctaLabel, day.started ? styles.ctaLabelClose : styles.ctaLabelStart]}>
            {day.started ? t.day.close : ctaStartLabel}
          </Text>
          {day.started && openCount > 0 ? (
            <Text style={styles.ctaBadge}>{fillCopy(t.day.openBadge, { n: String(openCount) })}</Text>
          ) : null}
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

/** v2:851-855 — sonuç dairesinin tonu. "Sıradaki" yalnız YOLA ÇIKILMIŞSA koyulur. */
function circleTone(stop: CourierStopContract, isNext: boolean, started: boolean): CircleTone {
  if (stop.outcome === 'delivered') return 'delivered';
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') return 'issue';
  return isNext && started ? 'next' : 'idle';
}

/** Durağın alt satırı (v2:856-861) — sonuç ne söylüyorsa o; iç durum adı ekrana sızmaz. */
function stopSubtitle(stop: CourierStopContract): { text: string; tone: 'muted' | 'error' | 'terracotta' } {
  const channel = t.channel[stop.channel];
  if (stop.outcome === 'delivered') {
    const due = stop.payment.dueAmountCents;
    return due === null
      ? { text: `${stop.customerName} · ${t.day.stop.delivered}`, tone: 'muted' }
      : {
          text: `${stop.customerName} · ${t.day.stop.delivered} · ${fillCopy(t.day.stop.deliveredDebt, { amount: money(due) })}`,
          tone: 'terracotta',
        };
  }
  if (stop.outcome === 'unreachable') return { text: `${stop.customerName} · ${t.day.stop.unreachable}`, tone: 'error' };
  if (stop.outcome === 'refused') return { text: `${stop.customerName} · ${t.day.stop.refused}`, tone: 'error' };

  const parts = [stop.customerName, channel, fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
  if (stop.attempts > 0) parts.push(fillCopy(t.day.stop.attempt, { n: String(stop.attempts + 1) }));
  if (stop.payment.dueAmountCents === null) parts.push(t.day.stop.noDebt);
  return { text: parts.join(' · '), tone: 'muted' };
}

interface StopRowProps {
  stop: CourierStopContract;
  /** Rota sırası (1'den) — daire boş hâlde bu sayıyı taşır. */
  order: number;
  tone: CircleTone;
  started: boolean;
  onPress: () => void;
}

function StopRow({ stop, order, tone, started, onPress }: StopRowProps) {
  const subtitle = stopSubtitle(stop);
  const address = stop.address ?? t.day.stop.noAddress;
  const due = stop.payment.dueAmountCents;
  const method = stop.payment.expectedMethod;
  const badge =
    stop.outcome === 'pending' && due !== null
      ? method === null
        ? fillCopy(t.day.stop.door, { amount: money(due) })
        : fillCopy(t.day.stop.doorWithMethod, { amount: money(due), method: turkishUpper(t.method[method]) })
      : null;

  return (
    <PressableSurface
      onPress={onPress}
      /* KAPI SIRASI: yola çıkılmadan durak açılmaz (v2:867 `if (!S.basladi) return`). Engel
         `disabled` ile veriliyor, sessiz bir `return` ile değil — ekran okuyucu da kapalı olduğunu
         duysun ve dokunuş görünürde işe yaramamış gibi durmasın. */
      disabled={!started}
      feedback="scale"
      style={[styles.stopRow, stop.outcome === 'delivered' ? styles.stopDone : started ? undefined : styles.stopLocked]}
      accessibilityLabel={fillCopy(t.day.stop.openLabel, { address, sub: subtitle.text })}
      accessibilityHint={started ? undefined : t.day.stop.lockedHint}
      testID={`courier-stop-${stop.orderId}`}
    >
      <View style={[styles.circle, styles[`circle_${tone}`]]}>
        <Text style={[styles.circleText, styles[`circleText_${tone}`]]}>{tone === 'delivered' ? '✓' : order}</Text>
      </View>
      <View style={styles.stopBody}>
        <Text style={[styles.stopAddress, stop.outcome === 'delivered' ? styles.stopAddressDone : undefined]}>
          {address}
        </Text>
        <Text style={[styles.stopSub, styles[`stopSub_${subtitle.tone}`]]}>{subtitle.text}</Text>
        {badge === null ? null : (
          <Text style={styles.stopBadge} testID={`courier-stop-door-${stop.orderId}`}>
            {badge}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    // Yapışkan CTA listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın (52 + nefes).
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingTop: operationsTheme.space.md,
  },
  progressCount: {
    // v2: `800 20px` — Karla'nın 800'ü YÜKLENMİYOR (fonts.ts üç ağırlık taşır) ve sahte kalın
    // Android'de çirkin durur; en yakın gerçek kesit 700.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    fontWeight: 700,
    color: operationsTheme.colors.ink,
  },
  progressTotal: {
    fontFamily: operationsTheme.font.body[400],
    fontWeight: 400,
    color: operationsTheme.colors.muted,
  },
  progressTrack: {
    flex: 1,
    height: operationsTheme.space.sm,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.olive,
  },
  pocket: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.muted,
  },
  doorLeft: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.terracotta,
    paddingTop: operationsTheme.space.sm,
  },
  startHint: {
    marginTop: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  startHintText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    fontWeight: operationsTheme.text['button--font-weight'],
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  /** v2:864 — teslim edilen durak soluk, yola çıkılmamış liste de bir tık soluk. */
  stopDone: { opacity: 0.55 },
  stopLocked: { opacity: 0.75 },
  circle: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.pill,
    borderWidth: operationsTheme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle_delivered: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-bg'],
  },
  circle_issue: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-bg'],
  },
  circle_next: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  circle_idle: {
    backgroundColor: 'transparent',
    borderColor: operationsTheme.colors['sand-500'],
  },
  circleText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    fontWeight: operationsTheme.text['control--font-weight'],
  },
  circleText_delivered: { color: operationsTheme.colors['olive-dark'] },
  circleText_issue: { color: operationsTheme.colors.error },
  circleText_next: { color: operationsTheme.colors['on-image'] },
  circleText_idle: { color: operationsTheme.colors.muted },
  stopBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  stopAddress: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.ink,
  },
  stopAddressDone: {
    color: operationsTheme.colors.muted,
    textDecorationLine: 'line-through',
  },
  stopSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
  },
  stopSub_muted: { color: operationsTheme.colors.muted },
  stopSub_error: { color: operationsTheme.colors.error },
  stopSub_terracotta: { color: operationsTheme.colors.terracotta },
  stopBadge: {
    alignSelf: 'flex-start',
    marginTop: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
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
  startNoticeBlock: {
    alignItems: 'flex-start',
    gap: operationsTheme.space.xs,
    marginBottom: operationsTheme.space.md,
  },
  startNotice: {
    alignSelf: 'stretch',
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    fontWeight: operationsTheme.text['button--font-weight'],
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  startNotice_ok: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  startNotice_warn: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  startNotice_error: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
  },
  ctaStart: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  /** Koyu CTA'nın gölgesi mürekkep OLAMAZ (görünmez) — kum gölge (`hard-on-ink`). */
  ctaClose: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  ctaLabelStart: { color: operationsTheme.colors.card },
  ctaLabelClose: { color: operationsTheme.colors['on-image'] },
  ctaBadge: {
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['ink-inset'],
    color: operationsTheme.colors['sand-150'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
});
