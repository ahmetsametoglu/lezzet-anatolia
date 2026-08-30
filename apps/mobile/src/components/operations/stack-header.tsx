import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { OperationsIconButton } from './icon-button';

/*
  YIĞIN BAŞLIĞI — bölüm kökünün ÜSTÜNE açılan her ekranın tepesi: geri düğmesi + Lora başlık +
  künye satırı. v2'de bildirimler (784), kurye teslimat (100), para gün sonu (761) ve depo/yönetim
  alt ekranlarının hepsi aynı üçlüyü çiziyor.

  BÖLÜM KÖKÜ BAŞLIĞINDAN (`OperationsSectionHeader`) AYRI: orada üstbaşlık BÖLÜMÜN KİMLİĞİDİR
  (renkli, büyük harf, .18em) ve altındaki Lora 24'tür; burada künye satırı EKRANIN DURUMUDUR
  (gri, cümle biçimli) ve başlık Lora 20'dir — yani kademeler ve anlamlar farklı. Tek
  komponentte birleştirmek, "bu ekran nerede duruyor" ile "bu ekran neyi gösteriyor" sorularını
  aynı kutuya koymak olurdu.

  MÜŞTERİ KİTİNDEKİ `AppBar` de kullanılMADI: o krem cam + bulanıklık + alt çizgi taşıyan YAPIŞKAN
  bir çubuktur (kaydırma alanının dışında durur); operasyonun başlığı zeminle aynı renkte,
  çizgisiz ve sayfayla birlikte kayan sıradan bir satırdır.

  Üst güvenli alan başlığın içinde — gerekçe `section-header.tsx`te, aynı karar.

  ── v3 ÖLÇÜMÜ (30.08): BAŞLIK BİR KADEME BÜYÜDÜ, KÜNYE İNCELDİ ─────────────
  Şablonda bu üçlü 25 ekranda BİREBİR aynı: `gap:12px;padding:18px 20px 12px`, 38×38 geri
  düğmesi, `600 20px 'Lora'` başlık (23/25 ekran), `400 11.5px 'Karla'` künye (23/25).
  v2'den üç fark ölçüldü ve üçü de aynı yöne bakıyor — başlık ekranın konusu, künye onun dipnotu:
    · başlık 17 → 20 (`screen-title` → `h2-sm`)
    · künye 700/10,5 → 400/11,5 (`meta` demeti → `micro`): kalın-küçükten ince-büyüğe. Kalın
      künye başlıkla yarışıyordu; v3 onu bir NOT hâline getirmiş.
    · sayfa kenarı 22 → 20 (`6xl` → `5xl`), üst nefes 12 → 18 (`xl` → `4xl`)
  `meta` (10,5) token'ı BURADAN düştü ama yerinde kalıyor: sekme çubuğunun etiketi hâlâ o durak.
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
      {/* Geri düğmesi operasyonun KUM KUTUCUĞUDUR ve o kutu artık kitte tek yerde
          (`OperationsIconButton`) — müşteri kitindeki `BackButton`ın `operations` varyantı aynı
          kutuyu ikinci kez tarif ediyordu ve o varyant söküldü. Yan kazanç: paylaşılan kit artık
          `operationsTheme`i hiç okumuyor. */}
      <OperationsIconButton
        icon="arrow-left"
        onPress={onBack}
        accessibilityLabel={backLabel}
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
    gap: operationsTheme.space.xl,
    paddingTop: rt.insets.top + operationsTheme.space['4xl'],
    paddingBottom: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  titles: {
    flexShrink: 1,
  },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  /** v3: `400 11.5px 'Karla'` — kalın değil İNCE; başlıkla yarışmayan bir dipnot. */
  subtitle: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
}));
