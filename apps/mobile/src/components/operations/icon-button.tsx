import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon-paths';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  İKON DÜĞMESİ — operasyon mobil v3'ün EN ÇOK TEKRAR EDEN kontrolü.

  ── ÖLÇÜM (30.08) ───────────────────────────────────────────────────────────
  Tasarımdaki 243 tıklanır öğe imzalarına ayrıldığında en kalabalık küme bu: **26 kez**
  `38×38 · border-radius:13 · background:#e7e2d2`. Kodda karşılığı yoktu — ekranlar bu kutuyu
  tek tek çiziyordu (34 yerde `size.iconButton` elle yazılmış). Yığın başlığının geri düğmesi de
  aynı kutudur; o yüzden `BackButton`ın `operations` varyantı BURAYA taşındı ve oradan silindi —
  aynı kutunun iki tarifi, bir gün ikiye ayrılacak demektir (CLAUDE §1).

  ── ÖLÇÜNÜN TOPLANDIĞI YER (bilinçli sadeleştirme) ──────────────────────────
  Tasarım iki ölçü kullanıyor: 38 (yığın başlığı, 26 kullanım) ve 40 (hub'ın zil/kimlik ikilisi).
  Kit TEK durakta topluyor: `size.iconButton` (40). Sebep dokunma hedefi — 40, 44 dp eşiğine
  `compact` payıyla ulaşan ölçüdür ve 2 dp'lik fark hizayı değil yalnız kutunun boyunu oynatır.
  Yarıçap da `badge`e (12) çekildi (tasarım 13–14, Δ1–2).

  ── NİÇİN OPERASYON KLASÖRÜNDE ──────────────────────────────────────────────
  Zemin `neutral-bg` YALNIZ operasyon temasında var; paylaşılan kit Unistyles'ın tema
  birleşiminden onu okuyamaz (gerekçe `theme/unistyles.ts` künyesinde, tek yerde). Kutu bu yüzden
  `operationsTheme` sabitini okur — kaçamak değil, temanın kendi sınırı.
*/

interface OperationsIconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Ekran okuyucu adı — ZORUNLU: ikonun kendisi sessizdir, ad düğmenin üstünde durur. */
  accessibilityLabel: string;
  /**
   * · `neutral` (varsayılan) — kum kutucuk; sayfadan ayrı bir yüzey.
   * · `plain` — zeminsiz; ikon doğrudan sayfanın üstünde durur (çekmece kapatma, satır içi eylem).
   */
  tone?: 'neutral' | 'plain';
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function OperationsIconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'neutral',
  disabled = false,
  accessibilityHint,
  testID,
}: OperationsIconButtonProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      /* Zeminli kutu KÜÇÜLÜR (tasarımın `style-active="transform:scale(.94)"`i), zeminsiz ikon
         ZEMİN KAZANIR — küçülen bir çıplak ikon, hizası kaymış gibi okunuyor. */
      feedback={tone === 'neutral' ? 'scale-small' : 'tint'}
      compact
      style={[styles.base, tone === 'neutral' ? styles.neutral : null]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Icon
        name={icon}
        size={operationsTheme.text['icon-sm']}
        color={disabled ? operationsTheme.colors['disabled-text'] : operationsTheme.colors.ink}
        bold
      />
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  base: {
    width: operationsTheme.size.iconButton,
    height: operationsTheme.size.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.badge,
  },
  neutral: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
});
