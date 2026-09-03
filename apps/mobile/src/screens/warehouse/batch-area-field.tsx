import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsSurface } from '@/components/operations/surface';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';

/*
  PARTİNİN YERİ — kendi bölümü, adet alanıyla aynı boyda (kullanıcı kararı 03.09).

  ── NEDEN KARTTAN ÇIKTI ─────────────────────────────────────────────────────
  İlk hâlde yer, bağlam kartının içinde küçük bir rozet + "değiştir →" bağlantısıydı. Kullanıcı:
  *"bu yeri çok hoş yapmamışım, aşağıda yeterince boş alan var — büyük bir seçim kısmı koy, adet
  input'unun ölçüleriyle uyumlu olsun."* Kart konunun KİMLİĞİDİR (ad · parti no · tarih · iki
  sayı); yer ise sayımda DEĞİŞTİRİLEBİLİR bir alan — yani adet gibi bir girdi. Girdiler ekranın
  gövdesinde, kendi başlığıyla ve aynı ölçüyle durur (`RAFTA SAYDIĞIN ADET` → `PARTİNİN YERİ`).

  ── İKİ HÂL, TEK BİLEŞEN ────────────────────────────────────────────────────
  · SAYIM: dokunulur, çekmece açar (`onPress`) — depocu partiyi başka dolapta bulduysa düzeltir.
  · DÜŞÜM: salt okunur — buradaki iş malın eksilmesi, yerinin düzeltilmesi değil (kullanıcı:
    *"düşümde yer değiştirmesi mantıklı değil ama görünür olması lazım"*). Aynı kutu, ok yok,
    dokunma yok; depocu doğru partinin önünde olduğunu yine buradan anlıyor.

  Boy `controlLg`: sayacın büyük boyuyla (`OperationsStepperGroup size="lg"`) bire bir — iki
  girdi alt alta aynı hizada okunur.
*/

const t = warehouseCopy;

interface BatchAreaFieldProps {
  /** Partinin kayıtlı alanı; `null` = rafı belirsiz (kabulde alan seçmek zorunlu değil). */
  areaName: string | null;
  /** Verilirse alan DOKUNULUR ve çekmece açar; verilmezse salt okunur (düşüm). */
  onPress?: () => void;
  testID: string;
}

export function BatchAreaField({ areaName, onPress, testID }: BatchAreaFieldProps) {
  const label = areaName ?? t.adjustment.picker.noArea;
  const body = (
    <View style={styles.inner}>
      <Text style={[styles.value, areaName === null ? styles.valueEmpty : null]} testID={`${testID}-value`}>
        {label}
      </Text>
      {onPress === undefined ? null : (
        <Icon name="arrow-right" size={operationsTheme.size.stripIcon} color={operationsTheme.colors['olive-dark']} />
      )}
    </View>
  );

  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.heading}>{t.adjustment.area.fieldHeading}</Text>
      <OperationsSurface tone="panel" padding="lg">
        {onPress === undefined ? (
          <View style={[styles.field, styles.fieldReadOnly]}>{body}</View>
        ) : (
          <PressableSurface
            onPress={onPress}
            feedback="scale"
            style={styles.field}
            accessibilityLabel={label}
            accessibilityHint={t.adjustment.area.fieldHint}
            testID={`${testID}-open`}
          >
            {body}
          </PressableSurface>
        )}
      </OperationsSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: operationsTheme.space.md,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** Sayacın büyük boyuyla aynı kutu: `controlLg` yükseklik, aynı çerçeve ve köşe. */
  field: {
    height: operationsTheme.size.controlLg,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  /** Salt okunur hâl KUM çerçeveli: dokunulacak bir şey olmadığını çerçeve söyler. */
  fieldReadOnly: {
    borderColor: operationsTheme.colors['sand-300'],
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
  },
  value: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  valueEmpty: {
    color: operationsTheme.colors.muted,
  },
});
