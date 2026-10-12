import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { OperationsIconButton } from './icon-button';

/*
  Bölüm kökünün üstüne açılan ekranların başlığı: geri düğmesi, Lora başlık ve ekranın durumunu söyleyen künye satırı. Bölüm kökü
  başlığından ayrıdır, çünkü orada üstbaşlık bölümün kimliğidir, burada künye ekranın dipnotudur.
*/

interface OperationsStackHeaderProps {
  /** Lora başlık ("Bildirimler") — i18n üstte çözülür. */
  title: string;
  /** Başlığın altındaki künye ("yalnız Kurye — rol süzmesi"); yoksa çizilmez. */
  subtitle?: string;
  onBack: () => void;
  /** Geri düğmesinin ekran okuyucu adı. */
  backLabel: string;
  /** Başlık satırının sağ yuvası: ekranın konusuna ait tek işaret (durağın kanal rozeti gibi), kaydırırken de görünür kalır. */
  right?: ReactNode;
  /**
   * Geri düğmesi ile başlık arasındaki yuva (yazışmada karşı tarafın avatarı). Sağ yuvadan ayrıdır, çünkü buradaki işaret başlığın
   * kimliğinin parçasıdır, sağdaki ise ekranın konusunun niteliği.
   */
  leading?: ReactNode;
  /** Verilirse künye bu kadar satırda kesilir; künyesi veriyle uzayan ekranda başlığın boyu sabit kalır. */
  subtitleLines?: number;
  testID?: string;
}

export function OperationsStackHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  right,
  leading,
  subtitleLines,
  testID,
}: OperationsStackHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      <OperationsIconButton
        icon="arrow-left"
        onPress={onBack}
        accessibilityLabel={backLabel}
        testID={testID === undefined ? undefined : `${testID}-back`}
      />
      {leading === undefined ? null : <View style={styles.leading}>{leading}</View>}
      <View style={styles.titles}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        )}
      </View>
      {right === undefined ? null : <View style={styles.right}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create((_theme, rt) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingTop: rt.insets.top + operationsTheme.space['4xl'],
    paddingBottom: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  titles: {
    flexShrink: 1,
    /* Sağ yuva varken başlık artan alanı alır; koşulsuz `flex: 1` yuvasız başlıkta geri düğmesiyle arasındaki boşluğu açardı. */
    flexGrow: 1,
  },
  right: { flexShrink: 0 },
  leading: { flexShrink: 0 },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  /** Künye ince yazılır ki başlıkla yarışmasın. */
  subtitle: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
}));
