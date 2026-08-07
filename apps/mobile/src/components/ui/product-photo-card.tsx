import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';
import { Tag } from './tag';
import { emToDp } from '../../theme/parse';

/*
  KARE ÜRÜN KARTI — KATALOG IZGARASI (v3 `catProds`, iki sütun). Kullanıcı kararı 07.08: katalog
  kartı DAİRE değil KAREdir; daire yalnız vitrin rayında (146) ve "bunları da sevebilirsiniz"
  rayında (96) kalır (`ProductCircleCard`). İki kart bilerek AYRI komponenttir: daire "fotoğraf +
  altında ad", kare "fotoğrafın İÇİNDE ad" — aynı gövdeye iki düzen sığdırmak, her prop'u
  "hangi biçimde geçerli" diye şartlı okumak demekti.

  YAPI (şablon: `design/project/Mobil - Musteri v3.dc.html` §catProds):
    kart (kare, `aspect-ratio:1`)
      └ fotoğraf katmanı (inset 0 · yarıçap `card` · overflow hidden · tükendide soluk)
          ├ fotoğraf (yoksa kum zemin — baş harf YOK, ad zaten fotoğrafın üstünde duruyor)
          ├ alt gradyan (yazının okunması için)
          ├ durum rozeti (sol üst)
          └ ad + çeşit satırı (sol alt)
      └ fiyat çipi — kartın DIŞINA taşar (sağ üst), o yüzden fotoğraf katmanının kardeşidir:
        kırpılan katmanın içinde olsaydı taşan kısmı kesilirdi.

  `CirclePhoto` BİLEREK KULLANILMADI: onun taşıdığı ortak davranış "fotoğraf yoksa baş harfe düş";
  bu kartta baş harf yoktur (şablon `placeholder=" "`), fotoğrafsız kart yalnız kum zemindir.
  Ortak olmayan bir davranış için ortak komponent zorlamak, `CirclePhoto`ya kare/harfsiz iki şart
  eklerdi.

  SOLMA ŞABLONUN YERİNE KOYDUĞU YERDE: `opacity` fotoğraf KATMANINDADIR (şablonda da öyle), yani
  tükendiğinde ad ve rozet de fotoğrafla birlikte solar. Fotoğrafa tek başına uygulamak tasarımdan
  sapma olurdu.

  TOKEN'I OLMAYAN DEĞERLER en yakın token'a bağlandı; her biri kendi satırında gerekçesiyle
  işaretli ve envantere raporlandı — ham değer sıfır.
*/

interface ProductPhotoCardProps {
  /** Ürün adı — i18n gerektirmez, veriden gelir. */
  name: string;
  /**
   * Biçimlenmiş fiyat ("12,90 €") — biçimleme çağıranın işi (sözleşme ham cent taşır).
   *
   * VERİLMEZSE ÇİP HİÇ ÇİZİLMEZ. Tasarımda fiyatsız kart yok ama VERİDE var: `priceCents: null`
   * "bu kanalda fiyatı yok → ürün satışa kapalı" demektir (`StorefrontProduct` sözleşmesi) ve web
   * o durumda fiyat öğesini hiç render etmiyor (`components/customer/ui/price.tsx` — `cents ===
   * null` → `null`). Uydurma bir yer tutucu ("—", "0,00 €") yazmak iki yüzeyi ayırır ve ikisi de
   * yanlış şey söyler: biri "bilinmiyor", öteki "bedava".
   */
  priceLabel?: string;
  onPress: () => void;
  photoUri?: string | null;
  soldOut?: boolean;
  /** "Tükendi" etiketi — tükendiyse ZORUNLU (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "İndirim" etiketi; verilirse indirim rozeti çıkar. */
  discountLabel?: string;
  /** "3 seçenek" gibi çeşit satırı. */
  optionsLabel?: string;
  /** Ekran okuyucu adı; verilmezse ad + fiyat (+ varsa durum) ile kurulur. */
  accessibilityLabel?: string;
  testID?: string;
}

export function ProductPhotoCard({
  name,
  priceLabel,
  onPress,
  photoUri,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  optionsLabel,
  accessibilityLabel,
  testID,
}: ProductPhotoCardProps) {
  const { theme } = useUnistyles();

  /* Durum rozeti TEK yuvadadır (şablonda ikisi de sol üst köşede): tükendi indirimin önüne geçer,
     çünkü tükenmiş bir üründe indirim bilgisi alınabilir bir şey söylemez. */
  const statusLabel = soldOut ? soldOutLabel : discountLabel;

  /* ERİŞİLEBİLİR AD ad + fiyat; durum rozeti VARSA ona eklenir. Rozetin `accessibilityState`e
     çevrilmesi denenmedi çünkü RN'in durum sözlüğünde "tükendi" YOK; en yakını (`disabled`) yalan
     olurdu — tükenmiş kart hâlâ açılır, ürün sayfası çeşit ve haber-ver seçeneğini gösterir.
     Rozet metni de sessizce düşürülemez: `accessibilityLabel` verildiği an RN çocuk metinleri
     okumaz, yani rozet ekran okuyucuda tamamen kaybolurdu. */
  const composedLabel = [name, priceLabel, statusLabel].filter((part) => part !== undefined).join(' · ');

  return (
    <PressableSurface
      onPress={onPress}
      /* Şablon basılı durumda `scale(.96)` diyor; kitte en yakın kademe `scale` (.97) —
         .96 için ayrı kademe açmak, tek kart uğruna kitin geri bildirim sözlüğünü büyütürdü.
         Fark (.01) raporlandı. */
      feedback="scale"
      style={styles.card}
      accessibilityLabel={accessibilityLabel ?? composedLabel}
      testID={testID}
    >
      <View style={[styles.photoLayer, soldOut ? styles.soldOutLayer : undefined]}>
        {photoUri === undefined || photoUri === null ? null : (
          <Image source={{ uri: photoUri }} style={styles.image} accessibilityIgnoresInvertColors />
        )}
        <LinearGradient
          {...theme.gradient.photoBottom}
          style={styles.scrim}
          pointerEvents="none"
          testID={testID === undefined ? undefined : `${testID}-scrim`}
        />
        {statusLabel === undefined ? null : (
          <View style={[styles.statusBadge, soldOut ? styles.soldOutBadge : styles.discountBadge]}>
            <Text style={[styles.statusLabel, soldOut ? styles.soldOutText : styles.discountText]}>{statusLabel}</Text>
          </View>
        )}
        <View style={styles.caption}>
          {/* İki satır kırpması şablonda yok ama kare kartta ZORUNLU: ad fotoğrafın üstünde
              yukarı doğru büyüyor, kırpılmazsa uzun bir ad kartın fotoğrafını yutar. */}
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {optionsLabel === undefined ? null : (
            <Text style={styles.options} numberOfLines={1}>
              {optionsLabel}
            </Text>
          )}
        </View>
      </View>
      {/* Fiyat çipi `Tag` ile BİREBİR örtüşür: terracotta zemin · beyaz metin · rozet kademesi
          (12,5/700 · .06em) · yarıçap `badge` · gölge `shadow.badge` · +4°. Token Kararlari #16
          ile gölge farkı da kapandı — kitte artık şablonun kendi değeri (`0 3px 8px …/.22`) var.
          Fiyatı olmayan üründe çip HİÇ ÇİZİLMEZ (bkz. prop künyesi). */}
      {priceLabel === undefined ? null : (
        <View style={styles.priceBadge}>
          <Tag label={priceLabel} rotate={4} shadow />
        </View>
      )}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Genişlik ÇAĞIRANDAN gelir (ızgara sütunu); kare oranı karttan. */
  card: {
    position: 'relative',
    aspectRatio: 1,
  },
  photoLayer: {
    position: 'absolute',
    inset: 0,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors['sand-300'],
  },
  soldOutLayer: {
    opacity: theme.soldOutOpacity,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    inset: 0,
  },
  statusBadge: {
    position: 'absolute',
    top: theme.space.lg,
    left: theme.space.lg,
    paddingVertical: theme.space.xs,
    // Şablon 9 px yatay dolgu ve 9 px yarıçap veriyor; ikisi de ölçek/set arasında kalıyor.
    // Ara değer YUKARI yuvarlanır (kitteki emsal: fiyat çipinin 11 → 12 dolgusu).
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
  },
  /* Tükendi örtüsü KENDİ durağında (Token Kararlari #18): `.72`nin işi fotoğrafı SOLDURMAK,
     `.82`nin işi (gradyanın ucu) metni okunur kılmak — ikisi ayrı iş, ayrı durak. */
  soldOutBadge: { backgroundColor: theme.colors['scrim-72'] },
  // Şablon %94 opak krem; rozet zeminleri krem-cam ailesine DAHİL DEĞİL (#17) — opak `sand-50`.
  discountBadge: { backgroundColor: theme.colors['sand-50'] },
  statusLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    // Rozet ailesinin KÜÇÜK boyu (#16): fotoğraf üstündeki durum etiketi 10 px.
    fontSize: theme.text['badge-sm'],
    fontWeight: theme.text['badge--font-weight'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
    // Şablonda rozet metni büyük harf; büyütmeyi komponent yapar ki i18n dizgesi bağırmasın.
    textTransform: 'uppercase',
  },
  soldOutText: { color: theme.colors['sand-50'] },
  discountText: { color: theme.colors.terracotta },
  caption: {
    position: 'absolute',
    left: theme.space.xl,
    right: theme.space.xl,
    bottom: theme.space.lg,
    gap: theme.space['2xs'],
  },
  name: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text.body,
    fontWeight: theme.text['card-title-sm--font-weight'],
    // Sıkı başlık satır aralığı — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text.body * theme.text['h1--line-height'],
    /* ROL TOKEN'I (Token Kararlari #14): fotoğraf üstü ad `on-image`tır. Daha önce şablonun
       #faf6ec'i `cream` ile birebir tuttuğu için değer eşleşmesi seçilmişti; karar tasarımı
       `on-image`e (#f5f1e6) ÇEKTİ ve `on-image-bright` açılmadı — yani rol ile değer artık aynı
       şeyi söylüyor ve altyazıyla (`on-image-soft`) aynı aileden okunuyor. */
    color: theme.colors['on-image'],
  },
  options: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    // Şablon 10,5; ölçekte o durak yok. `micro` (11,5) alındı: `eyebrow` (10) sayıca daha yakın
    // ama üstbaşlık kademesidir — cümle biçimli bir alt satır onun ağırlığı/aralığıyla döner.
    fontSize: theme.text.micro,
    fontWeight: theme.text['field-label--font-weight'],
    // Fotoğraf üstü ALTYAZI rolü; değeri #d5d0c2 (Token Kararlari #15 — rol ile değer örtüştü).
    color: theme.colors['on-image-soft'],
  },
  /* Fiyat çipi kartın SAĞ ÜST köşesinden taşar (şablon: `top:-8px;right:-5px`). Yatay ofset
     ölçekte ara değer, yukarı yuvarlandı (5 → 6). */
  priceBadge: {
    position: 'absolute',
    top: -theme.space.md,
    right: -theme.space.sm,
  },
}));
