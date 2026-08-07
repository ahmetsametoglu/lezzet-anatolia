import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { LoadingState } from '@/components/ui/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

/*
  KATALOG İSKELETİ — ilk yükte ızgaranın yerini tutar.

  ⚠ ŞABLONDAN BİLİNÇLİ SAPMA (kullanıcı kararı 07.08): v3'ün iskeleti (satır 202-205) hâlâ 138'lik
  DAİRE + altında iki çubuk çiziyor, çünkü katalog kartı daireyken öyle çizilmişti. Kart artık KARE
  ve adı fotoğrafın İÇİNDE (`ProductPhotoCard`) — daire iskelet, yerini tuttuğu şeye benzemiyor ve
  yükleme bitince ekran biçim değiştiriyor gibi görünürdü. İskelet burada kare kartın kendisidir:
  ad ve fiyat için ayrı çubuk YOK (ikisi de kartın içinde).

  Şablonun iskeletinin güncellenmesi TASARIM işidir ve envanterde kayıtlı
  (`docs/uygulama/03-tasarim-envanteri.md §3d` — "Katalog İSKELETİ bayat").

  Dört kart + altında dönen halka: şablonun kendi kurgusu (2×2 ızgara + "Yükleniyor…" satırı).
  a11y'de yalnız halka konuşur — `Skeleton` kendini ekran okuyucudan gizler.
*/

interface CatalogSkeletonProps {
  /** "Yükleniyor…" — ekran okuyucunun duyduğu ve halkanın yanında yazan metin. */
  loadingLabel: string;
  testID?: string;
}

/** Şablonun 2×2 iskelet ızgarası — sayı da tasarımdan (dört kart). */
const PLACEHOLDER_CARDS = [0, 1, 2, 3];

export function CatalogSkeleton({ loadingLabel, testID }: CatalogSkeletonProps) {
  const { theme, rt } = useUnistyles();

  /* Kare kartın kenarı SÜTUNDAN gelir; `Skeleton` sayısal ölçü ister (yerini tuttuğu şeyin
     ölçüsünü ekran bilir, kit bilmez). Hesap ızgaranın kendi ölçüleriyle: ekran genişliği eksi
     iki yan boşluk, eksi sütun arası, bölü iki. */
  const cardSize = (rt.screen.width - theme.space['5xl'] * 2 - theme.space['2xl']) / 2;

  return (
    <View style={styles.grid} testID={testID}>
      <View style={styles.row}>
        {PLACEHOLDER_CARDS.slice(0, 2).map((index) => (
          <Skeleton key={index} width={cardSize} height={cardSize} radius="card" />
        ))}
      </View>
      <View style={styles.row}>
        {PLACEHOLDER_CARDS.slice(2).map((index) => (
          <Skeleton key={index} width={cardSize} height={cardSize} radius="card" />
        ))}
      </View>
      <LoadingState size="sm" label={loadingLabel} accessibilityLabel={loadingLabel} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    // Şablon: `padding:20px 22px 10px` + satır arası 22. 20 ölçekte ara değer, yukarı yuvarlandı.
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['5xl'],
    gap: theme.space['5xl'],
  },
  row: {
    flexDirection: 'row',
    gap: theme.space['2xl'],
  },
}));
