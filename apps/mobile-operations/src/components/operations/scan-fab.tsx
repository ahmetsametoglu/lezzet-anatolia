import { Text, View } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import type { IconName } from '@lezzet/design-tokens/icons';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Yüzen okutma düğmesi: okutma her ekranda aynı yerde, elin altında durur; akıştaki düğme liste kaydıkça kaybolur. Konum bileşenin
  kendisindedir ve alt güvenli alandan türer, çağıran yalnız ne okutulduğunu ve altında ne kadarlık çubuk olduğunu söyler.
*/

/**
 * Dairenin alt kenarı: alt güvenli alanın üstünde sabit nefes, yapışkan çubuk varsa onun kadar yukarıda. Güvenli alan
 * `UnistylesRuntime`dan okunur, çünkü `useSafeAreaInsets` bir sağlayıcı ister ve ekran testleri onu kurmaz.
 */
function fabBottom(lift: number): number {
  return UnistylesRuntime.insets.bottom + operationsTheme.space['8xl'] + lift;
}

/**
 * Kayan listenin sonunda bırakılacak boşluk: son satır dairenin üstüne çıkabilsin, yoksa satırın sağındaki düğme dairenin altında
 * kalır ve basılamaz. `lift` dairenin aldığıyla aynıdır.
 */
export function scanFabRoom(lift = 0): number {
  return fabBottom(lift) + operationsTheme.size.fab + operationsTheme.space.xl;
}

interface OperationsScanFabProps {
  /** Dairenin içindeki çizim: okutmada `scan`, başka bir eylemde onun ikonu. */
  icon: IconName;
  onPress: () => void;
  /** Ekran okuyucu adı zorunludur, çünkü daire metinsizdir. */
  accessibilityLabel: string;
  /** `scan` (zeytin) okutmadır; `action` (mürekkep) okutmadan önce yapılması gereken iştir (kutu aç, sefer kur). */
  tone?: 'scan' | 'action';
  /** Kapalı daire gizlenmez, söner: kaybolan düğme "burada okutma yok" der, sönük düğme "şimdi olmaz". */
  disabled?: boolean;
  /** Ekranın dibindeki yapışkan çubuğun boyu (dp); daire onun üstüne kalkar, yoksa çubuğun yazısını örter. */
  lift?: number;
  /** Metin gelince daire hapa döner: okutacak şey kalmayınca düğme kaybolmaz, işi değişir (yükleme ekranında "bitir"). */
  label?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function OperationsScanFab({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'scan',
  disabled = false,
  lift = 0,
  label,
  accessibilityHint,
  testID,
}: OperationsScanFabProps) {
  /*
    Konum dış kapta, görünüş düğmede: `PressableSurface`ın `style`ı iç yüzeye gider ve mutlak konum oraya verilirse dış `Pressable`
    0×0 ölçülür, dokunacak alan kalmaz. `box-none` kabın altındaki listeyi yutmaması içindir; dokunuşu yalnız daire alır.
  */
  return (
    <View style={[styles.anchor, { bottom: fabBottom(lift) }]} pointerEvents="box-none">
      <PressableSurface
        onPress={onPress}
        disabled={disabled}
        feedback="scale-small"
        style={[
          styles.fab,
          label === undefined ? styles.fab_round : styles.fab_wide,
          disabled ? styles.fab_disabled : tone === 'scan' ? styles.fab_scan : styles.fab_action,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        <Icon
          name={icon}
          size={operationsTheme.size.fabIcon}
          /* Koyu ve zeytin dolguda da krem (`on-image`); sönük daire zaten soluk, ikinci bir soldurma ikonu okunmaz yapardı. */
          color={operationsTheme.colors['on-image']}
          bold
        />
        {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Ekranın köşesine çakılan şeffaf kap; `bottom` çizimde güvenli alandan verilir. */
  anchor: {
    position: 'absolute',
    right: operationsTheme.space['5xl'],
  },
  fab: {
    height: operationsTheme.size.fab,
    /* Yarıçap boyun yarısıdır, çünkü istenen köşe değil dairenin kendisi; hap da dairenin iki yana uzamış hâlidir. */
    borderRadius: operationsTheme.size.fab / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
    boxShadow: operationsTheme.shadow.fab,
  },
  /** Metinsiz hâl: en = boy, yani tam daire. */
  fab_round: { width: operationsTheme.size.fab },
  /** Metinli hâl: genişlik içeriğe göre, dolgu dairenin yarıçapına yakın durur ki hap dengeli olsun. */
  fab_wide: { paddingHorizontal: operationsTheme.space['5xl'] },
  label: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  fab_scan: {
    backgroundColor: operationsTheme.colors.olive,
  },
  fab_action: {
    backgroundColor: operationsTheme.colors.ink,
  },
  fab_disabled: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
    /* Gölge "üstte ve basılabilir" der; basılamayan dairede bu cümle yanlış olurdu. */
    boxShadow: 'none',
  },
});
