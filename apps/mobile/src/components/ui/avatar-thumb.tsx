import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from './circle-photo';

/*
  AVATAR — 7 ekranda: profil, sipariş kalem küçük resmi, checkout özeti, talep yazışması.
  Üç boyut (tasarım aralığı 34–56; kullanılan üç durak 40 · 46 · 56), fotoğraf ⟷ baş harf,
  ve YIĞIN varyantı: sipariş kartındaki küçük resimler üst üste biner, her biri krem halkayla
  ayrılır (tasarım: `margin-left:-10/-12px` + `2.5px` çerçeve).

  İki ton: `sand` (nötr, ürün küçük resmi) ⟷ `olive` (kişi profili — hesap kartındaki baş harf
  zeytin bantta durur).
*/

interface AvatarThumbProps {
  /** Fotoğraf yoksa gösterilen baş harf. */
  initial: string;
  /** Ekran okuyucu adı — kişi/ürün adı; i18n üstte çözülür. */
  accessibilityLabel: string;
  photoUri?: string | null;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'sand' | 'olive';
  /** Yığın varyantı: soldaki komşunun üstüne biner ve krem halka alır. */
  stacked?: boolean;
  testID?: string;
}

export function AvatarThumb({
  initial,
  accessibilityLabel,
  photoUri,
  size = 'md',
  tone = 'sand',
  stacked = false,
  testID,
}: AvatarThumbProps) {
  const { theme } = useUnistyles();
  const diameter = { sm: theme.size.avatarSm, md: theme.size.avatarMd, lg: theme.size.avatarLg }[size];
  const initialFontSize = { sm: theme.text['card-title-sm'], md: theme.text['card-title-sm'], lg: theme.text['h2-sm'] }[size];

  return (
    <CirclePhoto
      size={diameter}
      initial={initial}
      initialFontSize={initialFontSize}
      photoUri={photoUri}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[tone === 'olive' ? styles.olive : undefined, stacked ? styles.stacked : undefined]}
      initialStyle={tone === 'olive' ? styles.oliveInitial : undefined}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  olive: {
    backgroundColor: theme.colors['olive-bg'],
  },
  oliveInitial: {
    color: theme.colors['olive-dark'],
  },
  stacked: {
    marginLeft: -theme.space.lg,
    borderWidth: theme.border.ring,
    borderColor: theme.colors['sand-50'],
  },
}));
