import { Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { PressableSurface } from './pressable-surface';

/*
  BİRİNCİL DÜĞME — v3'te ~22 (müşteri) + ~23 (operasyon) kullanım. İki biçim:
  · `block`  — tam genişlik, 52 dp, kontrol yarıçapı; basılıda `translate(2,2)` (gölgeliyse)
  · `pill`   — içerik genişliği, hap yarıçapı, gölgesiz; basılıda `scale(.97)`
  Ayrım Token Kararlari #8'in kendisidir: gölgeli yüzey kayar, gölgesiz yüzey küçülür.

  ENGELLİ durum tasarımın kendi çözümü: dolgu `disabled-fill`, metin `disabled-text`, gölge YOK
  — gölgesiz bir yüzey "basılabilir" görünmez, engelliliğin görsel karşılığı da budur.

  ── NİÇİN TEK DÜĞME, İKİ YÜZEY (ölçüldü 30.08) ──────────────────────────────
  Müşteri ve operasyon tasarımları ayrı çizildi ama AYNI dilde: aynı yazı çifti (Karla + Lora),
  aynı zeytin (#5f7a2c), aynı `1.5px` çerçeve dilbilgisi, aynı 52 dp düğme boyu. Renk katmanında
  da ölçüldü — 51 ortak durağın yalnız 2'sinin değeri farklı. Yani ikinci bir düğme komponenti
  açmak, aynı şeyi ikinci kez yazmak olurdu (CLAUDE §1). Fark DİL değil TON ve YÜKSELTİDİR, ikisi
  de burada prop.
*/

/**
 * DOLGU TONU — rol seçilir, renk değil.
 *
 * · `olive` (varsayılan) — akışı İLERLETEN eylem. Müşteri yüzeyinin tek tonu; operasyonda
 *   okutma/başlatma düğmeleri ("Kutuyu okut", "Seferi başlat").
 * · `ink` — KARARLI ama nötr eylem: operasyonda "Tekrar dene", "Para bölümüne geç",
 *   "Seferi kapat". Tasarımda 11 kez geçiyor ve zeytinden ayrı bir şey söylüyor: bu düğme
 *   akışı ilerletmiyor, bir kararı uyguluyor.
 */
type ButtonTone = 'olive' | 'ink';

/**
 * YÜZEYİN YÜKSELTİSİ — hangi evrende olduğunun görsel karşılığı.
 *
 * · `shadow` (varsayılan) — müşteri evreninin imzası: `3px 3px 0` sert gölge, basılıda kayar.
 * · `flat`   — operasyon mobil v3: **sert gölge yok** (ölçüldü — v2'de 3 kullanım, v3'te sıfır),
 *   basılıda küçülür. Varsayılan yapılmadı: 35 müşteri ekranı bugün gölgeli ve öyle kalmalı.
 *
 * Yapışkan çubuktaki okutma CTA'sının zeytin ışıması burada YOK — o ışıma düğmenin değil
 * ÇUBUĞUN işidir (`OperationsStickyBar`), çünkü anlamı "bu düğme sayfanın üstünde yüzüyor".
 */
type ButtonElevation = 'shadow' | 'flat';

interface PrimaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  shape?: 'block' | 'pill';
  tone?: ButtonTone;
  elevation?: ButtonElevation;
  /** Etiketin SOLUNDA çizilen ikon; okutma düğmelerinde tasarımın kendi öğesi. */
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  shape = 'block',
  tone = 'olive',
  elevation = 'shadow',
  icon,
  disabled = false,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const { theme } = useUnistyles();
  const isBlock = shape === 'block';
  /* Gölge YALNIZ blok biçimde ve yalnız etkin düğmede; `flat` onu tümden kaldırır. Basılı geri
     bildirim gölgeyi İZLER: gölgesiz bir yüzeyin `translate(2,2)` ile kayması, altında kaymayı
     açıklayan bir şey olmadığı için titreme gibi okunur. */
  const lifted = isBlock && !disabled && elevation === 'shadow';

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback={lifted ? 'shadow' : 'scale'}
      compact={!isBlock}
      style={[
        styles.base,
        isBlock ? styles.block : styles.pill,
        disabled ? styles.disabled : styles[tone],
        lifted ? styles.shadow : undefined,
      ]}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          size={theme.text['icon-sm']}
          color={disabled ? theme.colors['disabled-text'] : theme.colors.card}
          bold
        />
      )}
      <Text style={[styles.label, disabled ? styles.disabledLabel : styles.enabledLabel]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    /* İkonlu düğmenin ikon–metin aralığı (tasarım: `gap:10`). İkonsuz düğmede görünmez, o yüzden
       koşulsuz yazılıyor — tek çocuklu bir satırda boşluğun karşılığı yoktur. */
    gap: theme.space.lg,
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
    /* Yatay dolgu, blok düğme GENİŞLİĞİNİ EBEVEYNDEN alsa da yazılır (kullanıcı bulgusu 09.08):
       ortalanmış bir kapsayıcının içinde (boş durum kartı) düğme içeriğine büzülüyor ve etiket
       kenara yapışıyordu. Dolgu tam-genişlik hâlde görünmez, büzülen hâlde kurtarır. */
    paddingHorizontal: theme.space['7xl'],
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['7xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  olive: {
    backgroundColor: theme.colors.olive,
  },
  /* Mürekkep dolgu operasyonun "kararı uygula" tonu. Gölge burada zaten anlamsızdı: mürekkep
     gölge mürekkep düğmenin altında görünmez — v3 de bu düğmelerin hiçbirine gölge çizmiyor. */
  ink: {
    backgroundColor: theme.colors.ink,
  },
  disabled: {
    backgroundColor: theme.colors['disabled-fill'],
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
  },
  // Zeytin dolgunun üstündeki metin paletin saf beyazıdır; ayrı bir "zeytin-üstü" token'ı yok
  // (envantere önerildi — bugün `card` ile aynı değer).
  enabledLabel: { color: theme.colors.card },
  disabledLabel: { color: theme.colors['disabled-text'] },
}));
