import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { emToDp } from '@/theme/parse';
import type { OperationsSection } from '@/lib/operations/sections';

/*
  BÖLÜM KÖKÜ BAŞLIĞI — dört bölümün de tepesinde aynı iskelet (v2:36 kurye · 267 depo · 486
  yönetim · 719 para): sol sütunda üstbaşlık + Lora başlık, sağda ekranın kendi eylemi.

  SAĞ YUVA (`right`), sabit bir zil DEĞİL: üç bölüm oraya bildirim düğmesini koyuyor, PARA ise bir
  metin eylemi ("Gün sonu →"). Komponent zili gömseydi Para ekranı ya yanlış düğmeyi taşırdı ya da
  kendi başlığını yeniden yazardı — `AppBar`ın `left`/`right` yuvalarıyla aynı karar.

  ÜSTBAŞLIK RENGİ BÖLÜMÜN KİMLİĞİDİR ve tasarımdan ÖLÇÜLDÜ, türetilmedi: kurye zeytin (#5f7a2c),
  depo kahve (#8a6d3a — `warehouse`, kimlik rengi; `honey` DEĞİL, o "bekliyor" demek), yönetim
  mürekkep (#343b41), para terracotta (#b05c2e). Dördü tek sözlükte durur ki bir bölümün rengi
  ekranın içine dağılmasın.

  ÜST GÜVENLİ ALAN BAŞLIĞIN İÇİNDE (`rt.insets.top`): tasarım tuvali 390×820 sabit bir kutudur ve
  durum çubuğu yoktur; cihazda başlık onun altına girmemeli.
*/

/** Bölümün üstbaşlık rengi — v2'den ölçüldü (kimlik rengi, durum rengi DEĞİL). */
const EYEBROW_COLOR = {
  courier: operationsTheme.colors.olive,
  warehouse: operationsTheme.colors.warehouse,
  management: operationsTheme.colors.ink,
  money: operationsTheme.colors.terracotta,
} as const satisfies Record<OperationsSection, string>;

interface OperationsSectionHeaderProps {
  section: OperationsSection;
  /** Büyük harfli künye satırı ("KURYE · SALT OKUMA") — i18n üstte çözülür. */
  eyebrow: string;
  /** Lora başlık ("Günün Rotası"). */
  title: string;
  /** Sağ yuva: bildirim düğmesi ya da ekrana özel metin eylemi. */
  right?: ReactNode;
  /**
   * Kimlik yuvası (21.97) — kabuğun oturum düğmesi (`OperationsStaffMenu`), `right`in DIŞINDA.
   *
   * Neden ikinci bir yuva ve neden komponente GÖMÜLMEDİ: `right` ekranın bilgisini taşıyor (zil
   * üç bölümde, Para'da "Gün sonu →") ve ikisini tek yuvaya sıkıştırmak, her ekranın kimliği
   * kendi eliyle çizmesi demekti — biri unutulduğu gün o bölümde çıkış yolu olmazdı. Gömmek de
   * doğru değil: bu komponent SAF (bağlam okumaz) ve testi kabuk kurmadan koşuyor; künyesinin
   * `right` için yazdığı gerekçenin aynısı burada da geçerli.
   */
  identity?: ReactNode;
  testID?: string;
}

export function OperationsSectionHeader({
  section,
  eyebrow,
  title,
  right,
  identity,
  testID,
}: OperationsSectionHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.titles}>
        <Text style={[styles.eyebrow, { color: EYEBROW_COLOR[section] }]}>{eyebrow}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {/* İkisi de yoksa satır hiç doğmaz; varsa kimlik EN SAĞDA durur — webin barında da avatar
          en dışta ve "bu benim oturumum" demek, ekranın eyleminden sonra gelir. */}
      {right === undefined && identity === undefined ? null : (
        <View style={styles.rightSlot}>
          {right}
          {identity}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((_theme, rt) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: rt.insets.top + operationsTheme.space['5xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space.sm,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    /* Zil ile kimlik arasındaki nefes: iki 42 dp daire bitişik durursa tek bir kontrol gibi
       okunur. `md` kitin komşu kontrol aralığı. */
    gap: operationsTheme.space.md,
  },
  titles: {
    /* v2: `gap:3px` — ölçekte 3 yok, 2 ve 4 eşit uzaklıkta. Kitin AYNI yerleşimdeki (üstbaşlık +
       başlık sütunu) seçimi `2xs` olduğu için o benimsendi: aynı iskeletin iki yüzeyde farklı
       nefes alması, ölçüden değil yazarından gelen bir fark olurdu (`ui/section-header.tsx`). */
    gap: operationsTheme.space['2xs'],
    flexShrink: 1,
  },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    /* Harf aralığı token'da `em` (yazı boyuna göreli); RN mutlak dp ister — çeviri `parse.ts`te,
       tek yerde. Ham bir dp yazmak, kademe değişince aralığın yerinde kalması demekti. */
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
}));
