import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { operationsTheme } from '@/theme/unistyles';

/*
  YIĞIN BAŞLIĞI — bölüm kökünün ÜSTÜNE açılan her ekranın tepesi: geri düğmesi + Lora başlık +
  künye satırı. v2'de bildirimler (784), kurye teslimat (100), para gün sonu (761) ve depo/yönetim
  alt ekranlarının hepsi aynı üçlüyü çiziyor.

  BÖLÜM KÖKÜ BAŞLIĞINDAN (`OperationsSectionHeader`) AYRI: orada üstbaşlık BÖLÜMÜN KİMLİĞİDİR
  (renkli, büyük harf, .18em) ve altındaki Lora 24'tür; burada künye satırı EKRANIN DURUMUDUR
  (gri, cümle biçimli, 10,5) ve başlık Lora 17'dir — yani kademeler ve anlamlar farklı. Tek
  komponentte birleştirmek, "bu ekran nerede duruyor" ile "bu ekran neyi gösteriyor" sorularını
  aynı kutuya koymak olurdu.

  MÜŞTERİ KİTİNDEKİ `AppBar` de kullanılMADI: o krem cam + bulanıklık + alt çizgi taşıyan YAPIŞKAN
  bir çubuktur (kaydırma alanının dışında durur); operasyon v2'nin başlığı zeminle aynı renkte,
  çizgisiz ve sayfayla birlikte kayan sıradan bir satırdır.

  Üst güvenli alan başlığın içinde — gerekçe `section-header.tsx`te, aynı karar.
*/

interface OperationsStackHeaderProps {
  /** Lora başlık ("Bildirimler") — i18n üstte çözülür. */
  title: string;
  /** Başlığın altındaki künye ("yalnız Kurye — rol süzmesi"); yoksa çizilmez. */
  subtitle?: string;
  onBack: () => void;
  /** Geri düğmesinin ekran okuyucu adı. */
  backLabel: string;
  testID?: string;
}

export function OperationsStackHeader({ title, subtitle, onBack, backLabel, testID }: OperationsStackHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      <BackButton
        onPress={onBack}
        accessibilityLabel={backLabel}
        variant="operations"
        testID={testID === undefined ? undefined : `${testID}-back`}
      />
      <View style={styles.titles}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle === undefined ? null : <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((_theme, rt) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingTop: rt.insets.top + operationsTheme.space.xl,
    paddingBottom: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  titles: {
    flexShrink: 1,
  },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    fontWeight: operationsTheme.text['screen-title--font-weight'],
    color: operationsTheme.colors.ink,
  },
  subtitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    // `meta` (10,5) tam bu satır için açıldı — künye satırı, ince yazı ve sekme etiketi (24 kullanım).
    fontSize: operationsTheme.text.meta,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.muted,
  },
}));
