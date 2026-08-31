import { Text } from 'react-native';
import { StyleSheet, useUnistyles, type UnistylesThemes } from 'react-native-unistyles';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { PressableSurface } from './pressable-surface';

/*
  İKİNCİL DÜĞME — çerçeveli, dolgusuz. Dört ton:
  · `sand`  — nötr ikinci yol ("Alışverişe dön"): kum çerçeve, mürekkep metin
  · `olive` — olumlu ama ikincil ("Stok haberi ver"): zeytin çerçeve, koyu zeytin metin
  · `terracotta` — YIKICI onay ("Hesabımı sil"): terracotta çerçeve ve metin
  · `error` — OLUMSUZ KAYIT ("Kabul etmedi"): kırmızı çerçeve + açık kırmızı zemin, kırmızı metin.
    Terracotta'dan ayrı ve ayrı olmalı — o bir UYARI tonudur (fırsat, kısmi, dikkat), bu bir RED.
    Tasarım bu düğmeyi tek başına çerçeveyle bırakmıyor, zemine oturtuyor (v3:17): yanındaki nötr
    "Ulaşılamadı" ile aynı ağırlıkta durmasın diye.

  ── ÜÇÜNCÜ TON NEDEN AÇILDI (14.08, cihazda görülerek) ──────────────────────
  Kitte yıkıcı bir onayın karşılığı YOKTU ve hesap silme çekmecesi ilk sürümünde onayı
  `PrimaryButton` ile çizmişti: dolgulu zeytin, yani ekranın EN GÜÇLÜ çağrısı. Cihazda
  bakınca çelişki görüldü — çekmecenin kendi künyesi *"bu bir birincil eylem değil"* diyordu
  ama düğme tam tersini söylüyordu. Web'in aynı diyaloğu bu kararı zaten vermişti
  (`delete-account.tsx`: *"dolgulu kırmızı bir düğme sayfanın en güçlü çağrısı olurdu ve
  müşteriyi silmeye davet ederdi"*) — dolgusuz `outlineTerracotta` kullanıyor.
  Ton EKLENDİ, kopyalanmadı: aynı bileşene üçüncü bir renk çifti: ikinci bir düğme türü
  açmak kitin sözlüğünü sebepsiz büyütürdü (CLAUDE §1).

  Biçim ve basılı davranış birincil düğmeyle AYNI kuraldan (Token Kararlari #8): blok sert
  gölge + `translate(2,2)`, hap gölgesiz + `scale(.97)`.
*/

type SecondaryTone = 'sand' | 'olive' | 'terracotta' | 'error';

interface SecondaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  tone?: SecondaryTone;
  shape?: 'block' | 'pill';
  /**
   * Yüzeyin yükseltisi — `PrimaryButton`la AYNI kural, aynı gerekçe: operasyon mobil v3'te sert
   * gölge yok (ölçüldü: v2'de 3 kullanım, v3'te sıfır). Varsayılan `shadow`, çünkü müşteri
   * yüzeyindeki 11 kullanımın hepsi bugün gölgeli.
   */
  elevation?: 'shadow' | 'flat';
  /** Etiketin SOLUNDA çizilen ikon — okutma düğmelerinde tasarımın kendi öğesi. */
  icon?: IconName;
  /**
   * YAN YANA ESNEYEN satırda payını alır (`flex`). Varsayılan yok: tek başına duran blok düğme
   * genişliğini ebeveynden zaten alıyor.
   *
   * **Niçin eklendi (kurye şeridinin bulgusu 30.08):** kit turunda `SecondaryButton` HİÇ
   * kullanılamamıştı ve sebebi tekti — onu hak eden yerlerin ikisi de iki düğmenin yan yana
   * paylaştığı satır. Esneme dışarıdan sarmalayıcıyla verilemiyor (`PressableSurface` kendi
   * kutusudur) ve düğme daralınca etiket kırpılıyordu; ekranlar bu yüzden düğmeyi elden çiziyordu.
   * `PressableSurface` bu kapıyı zaten taşıyor (`grow`), `PrimaryButton`da da var — eksik olan
   * yalnız buradaki geçişti.
   */
  grow?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function SecondaryButton({
  label,
  onPress,
  tone = 'sand',
  shape = 'block',
  elevation = 'shadow',
  icon,
  grow = false,
  disabled = false,
  accessibilityHint,
  testID,
}: SecondaryButtonProps) {
  const { theme } = useUnistyles();
  const isBlock = shape === 'block';
  const lifted = isBlock && !disabled && elevation === 'shadow';

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback={lifted ? 'shadow' : 'scale'}
      compact={!isBlock}
      grow={grow}
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
          color={disabled ? theme.colors['disabled-text'] : toneInk(theme, tone)}
          bold
        />
      )}
      <Text style={[styles.label, disabled ? styles.disabledLabel : styles[`${tone}Label`]]}>{label}</Text>
    </PressableSurface>
  );
}

/* İkonun rengi ETİKETİN rengidir: çerçeveli düğmede ikon ile metin tek bir işarettir, ikisi
   ayrı renkte olsaydı düğme iki parçaya bölünmüş görünürdü. Stil sayfasında değil burada, çünkü
   `Icon` rengi PROP olarak alıyor (RN'de `currentColor` yok — `icon.tsx` künyesi). */
function toneInk(theme: UnistylesThemes[keyof UnistylesThemes], tone: SecondaryTone): string {
  if (tone === 'olive') return theme.colors['olive-dark'];
  if (tone === 'terracotta') return theme.colors.terracotta;
  if (tone === 'error') return theme.colors.error;
  return theme.colors.ink;
}

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.lg,
    borderWidth: theme.border.base,
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['6xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  sand: { borderColor: theme.colors['sand-400'] },
  sandLabel: { color: theme.colors.ink },
  olive: { borderColor: theme.colors['olive-line'] },
  oliveLabel: { color: theme.colors['olive-dark'] },
  terracotta: { borderColor: theme.colors['terracotta-line'] },
  terracottaLabel: { color: theme.colors.terracotta },
  /* OLUMSUZ İKİNCİL — kuryenin "Kabul etmedi"si (v3:17). Terracotta'dan ayrı: o bir UYARI tonu
     (fırsat, kısmi, dikkat), bu bir RED. Tek tonun taşıdığı zemin de burada: tasarım bu düğmeyi
     çerçeveyle bırakmıyor, açık kırmızı bir zemine oturtuyor (`#fdf6f4` = `error-bg`) — kardeşi
     "Ulaşılamadı"nın yanında nötr durmasın diye. */
  /* DEĞERLER TEMADAN — `error-line` 30.08'de müşteri setine de eklendi (aile künyesi). İlk hâlde
     statik sabitten okunuyordu ve CİHAZDA DÜŞTÜ: Unistyles'ın stil fabrikası modül kapsamındaki
     değişkeni göremiyor (`Property 'operationsTheme' doesn't exist`). Jest ve `tsc` bunu yakalamadı
     — fabrika orada çağrılmıyor; hatayı yalnız cihaz gösterdi. */
  error: {
    borderColor: theme.colors['error-line'],
    backgroundColor: theme.colors['error-bg'],
  },
  errorLabel: { color: theme.colors.error },
  disabled: { borderColor: theme.colors['disabled-line'] },
  disabledLabel: { color: theme.colors['disabled-text'] },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
  },
}));
