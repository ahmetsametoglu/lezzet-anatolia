import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { upperIn } from '@/lib/i18n/locale';
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

/*
  ÜSTBAŞLIK RENGİ — v3'te DÖRT BÖLÜMDE DE ZEYTİN (ölçüldü 30.08).

  v2'de her bölümün kendi kimlik rengi vardı (kurye zeytin · depo kahve · yönetim mürekkep · para
  terracotta) ve bu bilinçli bir karardı: "üstbaşlık bölümün kimliğidir". v3 o kararı geri aldı —
  şablonun dört üstbaşlığı da `#5f7a2c`, tek istisnasız (`grep` ile doğrulandı: dört bölüm, tek
  renk). Renk artık "hangi bölümdeyim" demiyor; **"operasyondayım"** diyor. Bölümü söyleyen şey
  üstbaşlığın METNİ zaten ("DEPO · STRASBOURG MERKEZ").

  Eşleme yine de bir sözlük olarak DURUYOR, hepsi tek sabite indirgenmedi: bölüm→renk bağı
  tasarımın bir kararıdır ve bir gün yeniden ayrışabilir; sözlüğü söküp tek renk yazmak, o kararın
  nerede verildiğini kaybetmek olurdu.
*/
const EYEBROW_COLOR = {
  courier: operationsTheme.colors.olive,
  warehouse: operationsTheme.colors.olive,
  management: operationsTheme.colors.olive,
  money: operationsTheme.colors.olive,
} as const satisfies Record<OperationsSection, string>;

interface OperationsSectionHeaderProps {
  section: OperationsSection;
  /** Büyük harfli künye satırı ("KURYE · SALT OKUMA") — i18n üstte çözülür. */
  eyebrow: string;
  /** Lora başlık ("Günün Rotası"). */
  title: string;
  /**
   * Başlığın ALTINDAKİ bağlam satırı — v3'le geldi (30.08). Dört bölümde de var ama içeriği
   * BÖLÜMÜN kendi sorusudur: depoda "Deniz Arslan · depo", kuryede "Marc Lemoine · SF-26-YRNWV9",
   * parada "Ayşe Demir · 28 Ağustos · Strasbourg Merkez". Ortak bir "personel adı" alanı
   * OLMAMASININ sebebi bu: satırın taşıdığı şey kim olduğun değil, **hangi bağlamda çalıştığın**.
   * `undefined` = satır hiç doğmaz (v3'te Yönetim böyle).
   */
  context?: string;
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
  context,
  right,
  identity,
  testID,
}: OperationsSectionHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.titles}>
        {/* Büyük harf dilin kuralıyla — ve burada dil SABİT `tr`, çünkü operasyon yüzeyi yalnız
            Türkçedir (CLAUDE §2). Uygulama diline bağlansaydı Fransızca arayüz seçmiş bir personelde
            Türkçe başlıklar yanlış büyürdü ("Sipariş" → "SIPARIŞ"). Stilin `textTransform`u bu işi
            yapamaz: onu Android native CİHAZIN diliyle uyguluyor (müşteri tarafında ölçüldü 28.08,
            `cart-line-row` künyesi). */}
        <Text style={[styles.eyebrow, { color: EYEBROW_COLOR[section] }]}>{upperIn(eyebrow, 'tr')}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {context === undefined ? null : (
          <Text style={styles.context} testID={testID === undefined ? undefined : `${testID}-context`}>
            {context}
          </Text>
        )}
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
  /* Bağlam satırı — v3: Karla 400 · 12px · #8a8270. Ölçeğin 12'si `helper`, gri `muted`. */
  context: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
}));
