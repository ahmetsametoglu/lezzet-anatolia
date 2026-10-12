import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierStopContract } from '@lezzet/types';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from '../copy';
import { money, turkishUpper } from '../courier-format';
import { Chevron } from './day-gate-row';
import { stopSubtitle, stopTag, type CircleTone } from './day-stop-model';

const t = courierCopy;

interface StopRowProps {
  stop: CourierStopContract;
  /** Rota sırası sunucunun hesabıdır, listenin indeksi değil; `null` = sıra bilinmiyor ve numara uydurulmaz. */
  order: number | null;
  tone: CircleTone;
  started: boolean;
  /** Listenin son durağı mı — zaman çizgisi burada biter. */
  last: boolean;
  onPress: () => void;
}

/** Durak satırı: dairesi zaman çizgisinde, gövdesi kendi kartında; kartın zemini sonucu taşır ki kurye kalanları renkten tarasın. */
export function StopRow({ stop, order, tone, started, last, onPress }: StopRowProps) {
  const subtitle = stopSubtitle(stop);
  const tag = stopTag(stop);
  // Yön oku yalnız açık durakta: ok "burada yapılacak iş var" der, sonuçlanmış ya da iptal edilmiş durakta öyle bir iş yok.
  const open = stop.outcome === 'pending' && !stop.cancelled;
  const address = stop.address ?? t.day.stop.noAddress;
  const due = stop.payment.dueAmountCents;
  const method = stop.payment.expectedMethod;
  // İptal edilmiş durakta para konuşulmaz: kurye oraya gitmiyor, rozet onu para toplamaya çağırırdı.
  const badge =
    !stop.cancelled && stop.outcome === 'pending' && due !== null
      ? method === null
        ? fillCopy(t.day.stop.door, { amount: money(due) })
        : fillCopy(t.day.stop.doorWithMethod, { amount: money(due), method: turkishUpper(t.method[method]) })
      : null;

  return (
    <PressableSurface
      onPress={onPress}
      // Yola çıkılmadan durak açılmaz; engel `disabled` ile verilir ki ekran okuyucu da kapalı olduğunu duysun.
      disabled={!started}
      feedback="scale"
      style={[styles.stopRow, started ? undefined : styles.stopLocked]}
      accessibilityLabel={fillCopy(t.day.stop.openLabel, { address, sub: subtitle.text })}
      accessibilityHint={started ? undefined : t.day.stop.lockedHint}
      testID={`courier-stop-${stop.orderId}`}
    >
      <View style={styles.rail}>
        <View style={[styles.circle, styles[`circle_${tone}`]]}>
          <Text style={[styles.circleText, styles[`circleText_${tone}`]]}>
            {/* Sıra bilinmiyorsa nötr bir işaret konur; uydurma numara olmayan bir sırayı iddia ederdi. */}
            {tone === 'delivered' ? '✓' : tone === 'partial' ? '½' : tone === 'issue' ? '!' : (order ?? '·')}
          </Text>
        </View>
        {/* Çizgi "bu bir sıradır" der: son durakta bağlanacak bir sonraki yok, sıra hesaplanamadıysa da cümle yalan olurdu. */}
        {last || order === null ? null : <View style={styles.railLine} />}
      </View>
      <View style={[styles.stopBody, styles.stopCard, styles[`stopCard_${tone}`]]}>
        {tone === 'next' ? <Text style={styles.stopNextLabel}>{t.day.stop.nextLabel}</Text> : null}
        {tag === null ? null : (
          <Text style={[styles.stopTag, styles[`stopTag_${tone}`]]} testID={`courier-stop-tag-${stop.orderId}`}>
            {tag}
          </Text>
        )}
        {/* İptal edilmiş durağın adresi çizilir: kutusu araçta olduğu için satır durur ama gidilecek bir yer değildir. */}
        <Text
          style={[
            styles.stopAddress,
            stop.outcome === 'delivered' ? styles.stopAddressDone : undefined,
            stop.cancelled ? styles.stopAddressCancelled : undefined,
          ]}
        >
          {address}
        </Text>
        <Text style={[styles.stopSub, styles[`stopSub_${subtitle.tone}`]]}>{subtitle.text}</Text>
        {badge === null && !open ? null : (
          <View style={styles.stopFoot}>
            {badge === null ? null : (
              <Text style={styles.stopBadge} testID={`courier-stop-door-${stop.orderId}`}>
                {badge}
              </Text>
            )}
            {open ? <Chevron /> : null}
          </View>
        )}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  /* Satır gerilir ki zaman çizgisi kartın boyunca uzasın; satırlar arası aralık listenin `gap`inden gelir. */
  stopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: operationsTheme.space.lg,
  },
  /* Kilitli durak soluk durur: yola çıkılmadan açılamadığını dokunmadan da göstermeli. */
  stopLocked: { opacity: 0.75 },
  /** Daire + zaman çizgisi sütunu — genişliği daireden, uzunluğu karttan gelir. */
  rail: {
    alignItems: 'center',
    gap: operationsTheme.space['2xs'],
  },
  railLine: {
    flex: 1,
    width: operationsTheme.border.ring,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  circle: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.pill,
    borderWidth: operationsTheme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Dairelerin dördü dolu, yalnız bekleyen nötr: bitmiş ve takılı durak listeyi tararken ilk okunan işarettir. */
  circle_delivered: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  circle_issue: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  circle_partial: {
    backgroundColor: operationsTheme.colors['warning-line'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  circle_next: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  circle_idle: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  circleText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
  },
  circleText_delivered: { color: operationsTheme.colors['on-image'] },
  circleText_issue: { color: operationsTheme.colors['on-image'] },
  circleText_partial: { color: operationsTheme.colors.warehouse },
  circleText_next: { color: operationsTheme.colors['on-image'] },
  circleText_idle: { color: operationsTheme.colors.muted },
  stopBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  stopCard: {
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  /* Kartın dört zemini sonucun rengidir; teslim kartı sayfanın kremindedir, onu yalnız kenarı ayırır. */
  stopCard_delivered: {
    backgroundColor: operationsTheme.colors.cream,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  stopCard_partial: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  stopCard_issue: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
  },
  /* Sıradaki kart beyaz ve kalın zeytin kenarlıdır; listenin tek "şimdi" öğesini gölge değil kenar ayırır. */
  stopCard_next: {
    backgroundColor: operationsTheme.colors.card,
    borderColor: operationsTheme.colors.olive,
    borderWidth: operationsTheme.border.ring,
  },
  stopCard_idle: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  stopNextLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    // Token em cinsinden, RN `letterSpacing` dp bekler; ham değer harf aralığını katlarca açardı.
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.olive,
  },
  /** Sonuç etiketi — "TESLİM EDİLDİ · 14:12"; tonu kartın ailesinden gelir. */
  stopTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
  },
  stopTag_delivered: { color: operationsTheme.colors['olive-dark'] },
  stopTag_partial: { color: operationsTheme.colors.warehouse },
  stopTag_issue: { color: operationsTheme.colors.error },
  stopTag_next: { color: operationsTheme.colors.olive },
  stopTag_idle: { color: operationsTheme.colors.muted },
  stopAddress: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  /* Teslim edilmiş durağın adresi sessizleşir ama çizilmez: çizgi "iptal" der, teslim tamamlanmış bir iştir. */
  stopAddressDone: {
    color: operationsTheme.colors.body,
  },
  /* İptal öteki hâllerin hepsini ezer; yalnız çizgi koyu başlıkta hâlâ "gidilecek yer" gibi okunurdu, renk de söner. */
  stopAddressCancelled: {
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
  /** Kartın alt şeridi — rozet solda, yön oku sağda; ikisi de yoksa şerit hiç çizilmez. */
  stopFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: operationsTheme.space['2xs'],
  },
  stopBadge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
});
