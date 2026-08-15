import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from './circle-photo';
import { PressableSurface } from './pressable-surface';
import type { StockMarkView } from './stock-mark';
import { Tag } from './tag';

/*
  YUVARLAK ÜRÜN KARTI — vitrin rayı ve "bunları da sevebilirsiniz" rayı. İki boyut: 146 (vitrin,
  `lg`) · 96 (benzerler, `sm`).

  IZGARANIN 138'LİK KADEMESİ (`md`) EMEKLİ EDİLDİ — kullanıcı kararı 07.08: katalog ızgarası
  daireden KARE karta geçti (`ProductPhotoCard`), o kademenin tek tüketicisi oydu. Kullanılmayan
  bir boyutu "ileride lazım olur" diye tutmak, kartın kaç biçimi olduğu sorusunu kodun içinde
  cevapsız bırakırdı; ara kademe gerçekten geri gelirse ölçüsüyle birlikte yeniden açılır.
  Varsayılan bu yüzden `lg`: geriye kalan iki kullanımın baskını vitrindir.

  FİYAT ÇİPİ ZORUNLUDUR: tasarımda fiyatsız bir ürün dairesi YOK — fiyat dairenin sağ alt
  köşesine taşan eğik bir rozettir (Tag) ve kartın kimliğidir. Zorunlu prop olması bilinçli;
  isteğe bağlı olsaydı bir gün fiyatsız bir kart doğardı.

  TÜKENDİ: daire `opacity .45` ile solar ve üstüne rozet biner (tasarımın kendi çözümü) —
  ürün gizlenmez, "yok" bilgisi de bir bilgidir. Tükendi/indirim rozetlerinin METNİ prop'tan
  gelir (i18n üstte).
*/

interface ProductCircleCardProps {
  /** Ürün adı — i18n gerektirmez, veriden gelir. */
  name: string;
  /**
   * Biçimlenmiş fiyat ("12,90 €" ya da çok boyluda "12,90 €'dan") — türetme çağıranın işi
   * (`customer-kit/price-label`).
   * **VERİLMEZSE ÇİP HİÇ ÇİZİLMEZ** — kare kartın (`ProductPhotoCard`) aynı kararı. Fiyatı
   * bilinmeyen ürün VERİDE var (`priceCents: null`) ve zorunlu olduğu sürece çağıranlar `?? 0`
   * yazıp müşteriye **"0,00 €"** gösteriyordu; ölçülemeyen değer sıfır değildir (`CLAUDE §1`).
   */
  priceLabel?: string;
  onPress: () => void;
  /** `lg` vitrin rayı (146) · `sm` benzer ürünler rayı (96). */
  size?: 'sm' | 'lg';
  photoUri?: string | null;
  /** Fotoğraf yoksa dairede görünecek baş harf. */
  initial?: string;
  soldOut?: boolean;
  /** "Tükendi" etiketi — tükendiyse ZORUNLU (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "İndirim" etiketi; verilirse indirim rozeti çıkar. */
  discountLabel?: string;
  /**
   * YER işareti (21.20) — kare katalog kartıyla AYNI komponent, aynı cümle, aynı ton
   * (`StockMark`). Vitrin ve katalog aynı ürüne bakan iki ekran; işaret birinde çizilip ötekinde
   * çizilmezse müşteri iki ekranda iki farklı gerçek okur.
   *
   * Yeri fotoğrafın KÖŞESİ değil, adın ALTI: daire kartın kimliği ad ve fiyat çipiyle kuruluyor
   * ve dairenin üstüne binen üçüncü bir rozet fotoğrafı yutardı. Web de aynı yeri seçiyor —
   * işaret künyenin altında, satın alma kararından önce (`storefront-cards.tsx`).
   */
  stockMark?: StockMarkView | null;
  /** Bu adrese hiç gitmeyen ürün — daire tükendiyle aynı değerde solar (gerekçe: kare kart künyesi). */
  dimmed?: boolean;
  /** "3 seçenek" gibi çeşit satırı. */
  optionsLabel?: string;
  /** Ekran okuyucu adı; verilmezse ad + fiyattan kurulur. */
  accessibilityLabel?: string;
  testID?: string;
}

export function ProductCircleCard({
  name,
  priceLabel,
  onPress,
  size = 'lg',
  photoUri,
  initial,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  stockMark,
  dimmed = false,
  optionsLabel,
  accessibilityLabel,
  testID,
}: ProductCircleCardProps) {
  const { theme } = useUnistyles();
  const diameter = { sm: theme.size.circleSm, lg: theme.size.circleLg }[size];
  const initialFontSize = { sm: theme.text['h2-sm'], lg: theme.text['h1-sm'] }[size];
  // Tükendide yer işareti basılmaz (gerekçe: kare kart künyesi — cevabı olmayan soru sorulmaz).
  const mark = soldOut ? null : (stockMark ?? null);
  const faded = soldOut || dimmed;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.card}
      // Yer işareti erişilebilir ada da girer: gören ve duyan müşteri aynı bilgiyi almalı.
      accessibilityLabel={accessibilityLabel ?? [name, priceLabel, mark?.label].filter((part) => part !== undefined).join(' · ')}
      testID={testID}
    >
      <View style={[styles.photoFrame, { width: diameter, height: diameter }]}>
        <CirclePhoto
          size={diameter}
          initial={initial ?? name.slice(0, 1)}
          initialFontSize={initialFontSize}
          photoUri={photoUri}
          style={faded ? styles.soldOutPhoto : undefined}
        />
        {/* Durum rozeti TEK yuvadadır: tasarımda tükendi ve indirim aynı köşede duruyor ve bir
            ürün ikisini birden taşıyamaz — tükendiyse indirim bilgisi anlamsızdır. */}
        {soldOut && soldOutLabel !== undefined ? (
          <View style={styles.statusBadge}>
            <Tag label={soldOutLabel} tone="ink" rotate={-4} />
          </View>
        ) : !soldOut && discountLabel !== undefined ? (
          <View style={styles.statusBadge}>
            <Tag label={discountLabel} tone="cream" rotate={-7} shadow />
          </View>
        ) : null}
        {/* YER İŞARETİ DAİRENİN İÇİNDE (kullanıcı kararı 10.08) — kartın ALTINDA değil.
            Önce `StockMark` olarak ada ve fiyata eklenen üçüncü bir satırdı; yatay şeritte
            kartların boyu ona göre uzuyor ve rota dışı müşteride şeridin tamamı metne dönüyordu.
            Yazı artık solmuş görselin üstünde, kendi filigranıyla: solma sebebi ile sebebin
            AÇIKLAMASI aynı yerde duruyor. Kabuk YOK (kataloğun aynı kararı: "her şey rozet
            içindeymiş gibi görünüyor") — okunurluğu filigran veriyor.
            `pointerEvents="none"`: örtü dokunuşu yutmaz, kart yine açılır. */}
        {mark === null ? null : (
          <View
            style={[styles.markVeil, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}
            pointerEvents="none"
            testID={testID === undefined ? undefined : `${testID}-stock-mark`}
          >
            <Text style={styles.markLabel} numberOfLines={3}>
              {mark.label}
            </Text>
          </View>
        )}
        {priceLabel === undefined ? null : (
          <View style={styles.priceBadge}>
            <Tag label={priceLabel} rotate={4} shadow />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {optionsLabel === undefined ? null : <Text style={styles.options}>{optionsLabel}</Text>}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  photoFrame: {
    position: 'relative',
  },
  soldOutPhoto: {
    opacity: theme.soldOutOpacity,
  },
  /**
   * Yer işaretinin FİLİGRANI — dairenin tamamını örten yarı saydam katman.
   *
   * Solma tek başına SESSİZ bir işarettir: müşteri kartın neden soluk olduğunu bilemez. Filigran
   * hem sebebi yazacak zemini verir hem de "bu kart farklı" demeyi görselin kendisine bırakmaz.
   * Örtü fotoğrafın ÜSTÜNDE ayrı bir kardeş: solma fotoğrafa uygulanıyor (`soldOutPhoto`) ve yazı
   * onunla birlikte solsaydı, tam da okunması gereken cümle okunaksızlaşırdı — kataloğun aynı
   * dersi (kullanıcı bildirimi 10.08).
   */
  markVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
    backgroundColor: theme.colors.scrim,
  },
  markLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    // Daire dar: kademe `badge-sm`, satır yüksekliği ölçünün kendi durağından (`space.xl`) —
    // token sözlüğünde bu kademenin ayrı bir satır yüksekliği yok, uydurulmuş bir sayı yazılmadı.
    fontSize: theme.text['badge-sm'],
    lineHeight: theme.space.xl,
    color: theme.colors.cream,
    textAlign: 'center',
  },
  // Fiyat çipi dairenin SAĞ ALT köşesinden taşar (tasarım: `bottom:-2px;right:-2px`).
  priceBadge: {
    position: 'absolute',
    right: -theme.space['2xs'],
    bottom: -theme.space['2xs'],
  },
  statusBadge: {
    position: 'absolute',
    left: 0,
    top: theme.space.lg,
  },
  name: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['body-sm'],
    // Sıkı başlık satır aralığı — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text['body-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  options: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
