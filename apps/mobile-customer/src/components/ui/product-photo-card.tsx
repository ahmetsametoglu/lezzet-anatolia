import type { CatalogImage } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { Tag } from './tag';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';

/*
  Katalog ızgarasının kare kartı: ad fotoğrafın içinde, fotoğrafsız kartta baş harf yerine kum zemin, fiyat çipi kartın dışına taşar;
  vitrin rayının daire kartı (`ProductCircleCard`) ayrı komponenttir, çünkü iki düzeni tek gövdeye sığdırmak her prop'u biçime göre
  şartlı okuturdu. Solma yalnız fotoğrafa ve gradyanına uygulanır, rozet, künye ve yer şeridi tam opak kalır ki solmanın sebebini
  söyleyen cümle okunsun.
*/

interface ProductPhotoCardProps {
  /** Ürün adı — i18n gerektirmez, veriden gelir. */
  name: string;
  /**
   * Biçimlenmiş fiyat ("12,90 €"); verilmezse çip hiç çizilmez, çünkü `priceCents: null` ürünün bu kanalda satışa kapalı olduğunu
   * söyler. Yer tutucu ("—", "0,00 €") yazmak web'den ayrışır ve ürünü bilinmiyor ya da bedava gösterirdi.
   */
  priceLabel?: string;
  onPress: () => void;
  /** Ürün görseli; kartın kare kutusuna yeten CDN türevini `FrameImage` kutuyu ölçerek seçer. */
  image?: CatalogImage | null;
  soldOut?: boolean;
  /** "Tükendi" etiketi — tükendiyse ZORUNLU (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "İndirim" etiketi; verilirse indirim rozeti çıkar. */
  discountLabel?: string;
  /**
   * Yer şeridinin cümlesi ("Bu adrese gelmiyor" / "Bölgenizde şu an yok"), ortak kurucudan (`cardPlaceNoteOf`). "Kargoyla gelir"
   * buraya gelmez, çünkü rota dışında neredeyse her kartta tekrar ederdi; o cümle listenin başındaki bantta tek kez durur.
   */
  placeNote?: string;
  /**
   * Ürün bu adrese hiç gitmiyorken fotoğrafı tükendiyle aynı değerde soldurur, çünkü müşteri için ikisi de bugün alınamayan bir ürün.
   * Kart yine açılır: detay sayfası "neden"i ve "haber ver"i taşır, kartı kapatmak müşterinin tek çıkışını alırdı.
   */
  dimmed?: boolean;
  /** Miktar satırı ("4 adet" · "750 ml · 5 L"), `cardQuantityOf`tan; verilmezse satır çizilmez. */
  quantityLabel?: string;
  /** Ekran okuyucu adı; verilmezse ad, miktar, fiyat ve varsa durum ile kurulur. */
  accessibilityLabel?: string;
  testID?: string;
}

export function ProductPhotoCard({
  name,
  priceLabel,
  onPress,
  image,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  placeNote,
  dimmed = false,
  quantityLabel,
  accessibilityLabel,
  testID,
}: ProductPhotoCardProps) {
  const { theme } = useUnistyles();
  const locale = useAppLocale();

  /* Durum rozeti tek yuvadadır ve tükendi indirimin önüne geçer, çünkü tükenmiş üründe indirim alınabilir bir şey söylemez. Yer
     şeridi varken indirim çizilmez (tasarım): bu adrese gelmeyen üründe indirim, alınamayacak bir şeyin vaadidir. */
  const statusLabel = soldOut ? soldOutLabel : placeNote !== undefined ? undefined : discountLabel;
  /* Yer notu tükendide basılmaz: hiçbir yerde olmayan ürün için "bu adrese gelmez" cevapsız bir soruya cevaptır. Sözleşme bunu
     zaten garanti ediyor; kapı yine de burada ki kartın ön koşulu çağıranın hatırlamasına kalmasın. */
  const note = soldOut ? undefined : placeNote;
  /* Solma iki sebepten gelir ve ikisi de aynı katmana uygulanır: tükendi (evrensel) ya da bu adrese gitmiyor (yere bağlı). */
  const faded = soldOut || dimmed;

  /* Erişilebilir ad görenle aynı bilgiyi taşır (ad, miktar, fiyat, durum rozeti, yer notu): `accessibilityLabel` verilince RN çocuk metinleri
     okumaz, eklenmeyen rozet ekran okuyucuda kaybolur. Rozet `accessibilityState`e çevrilmez, çünkü RN'de "tükendi" yok ve en
     yakını (`disabled`) açılabilen kart için yalan olurdu. */
  const composedLabel = [name, quantityLabel, priceLabel, statusLabel, note].filter((part) => part !== undefined).join(' · ');

  return (
    <PressableSurface
      onPress={onPress}
      /* Şablonun basılı ölçeği .96, kitin en yakın kademesi .97: tek kart için kitin geri bildirim sözlüğü büyütülmedi. */
      feedback="scale"
      style={styles.card}
      accessibilityLabel={accessibilityLabel ?? composedLabel}
      testID={testID}
    >
      {/* Solan grup yalnız fotoğraf ve gradyanıdır; katman `inset:0` olduğu için bilgi öğeleri kartla aynı koordinatlarda kalır. */}
      <View style={[styles.photoLayer, faded ? styles.fadedPhoto : undefined]}>
        {image == null || image.url === null ? null : <FrameImage image={image} style={styles.image} />}
        <LinearGradient
          {...theme.gradient.photoBottom}
          style={styles.scrim}
          pointerEvents="none"
          testID={testID === undefined ? undefined : `${testID}-scrim`}
        />
      </View>
      {/* Sol üst köşe durum rozetinin (tükendi/indirim) tek yuvasıdır; yer notu künyenin üstündeki şeritte durur. */}
      {statusLabel === undefined ? null : (
        <View style={[styles.statusBadge, soldOut ? styles.soldOutBadge : styles.discountBadge]}>
          {/* Büyük harf dilin kuralıyla (`upperIn`) kurulur, `textTransform`a bırakılmaz: Android o dönüşümü cihazın diliyle yapar. */}
          <Text style={[styles.statusLabel, soldOut ? styles.soldOutText : styles.discountText]}>
            {upperIn(statusLabel, locale)}
          </Text>
        </View>
      )}
      <View style={styles.caption}>
        {/* Yer şeridi künyenin üstünde durur: tepede olsaydı kartın sağ üst köşesinden taşan fiyat çipi şeridin sağ ucuna binerdi. */}
        {note === undefined ? null : (
          <View style={styles.noteBand}>
            <Icon name="delivery-off" size={theme.size.badgeIcon} color={theme.colors.terracotta} />
            <Text style={styles.noteLabel} numberOfLines={1} testID={testID === undefined ? undefined : `${testID}-place-note`}>
              {upperIn(note, locale)}
            </Text>
          </View>
        )}
        {/* İki satır kırpması şablonda yok ama kare kartta ZORUNLU: ad fotoğrafın üstünde
            yukarı doğru büyüyor, kırpılmazsa uzun bir ad kartın fotoğrafını yutar. */}
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {quantityLabel === undefined ? null : (
          <Text style={styles.quantity} numberOfLines={1}>
            {quantityLabel}
          </Text>
        )}
      </View>
      {/* Fiyat çipi fotoğraf katmanının kardeşidir, çünkü kırpılan katmanın içinde kartın dışına taşan kısmı kesilirdi; fiyatı olmayan
          üründe çip çizilmez. */}
      {priceLabel === undefined ? null : (
        <View style={styles.priceBadge}>
          {/* Şerit varken çip griye döner (tasarım): terracotta "al" diyen bir vurgudur, gelmeyen üründe yanıltır. */}
          <Tag label={priceLabel} tone={note === undefined ? 'terracotta' : 'blocked'} rotate={4} shadow />
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
  /* Solma değeri tükendiyle paylaşılır (`soldOutOpacity`), çünkü müşteri için iki sebebin sonucu aynı; ad bu yüzden sebebi değil
     fotoğrafı anlatır. */
  fadedPhoto: {
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
  /* Şablonun tek rozet köşesi (10/10); konum rozetin kendisinde, çünkü yuvada tek rozet var. */
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
  /* Tükendi örtüsü kendi durağında: `.72` fotoğrafı soldurur, gradyanın ucundaki `.82` metni okunur kılar; ikisi ayrı iş. */
  soldOutBadge: { backgroundColor: theme.colors['scrim-72'] },
  // Şablon %94 opak krem; rozet zeminleri krem-cam ailesinden olmadığı için opak `sand-50`.
  discountBadge: { backgroundColor: theme.colors['sand-50'] },
  statusLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    // Rozet ailesinin küçük boyu: fotoğraf üstündeki durum etiketi 10 px.
    fontSize: theme.text['badge-sm'],
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
    // Sıkı başlık satır aralığı — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text.body * theme.text['h1--line-height'],
    /* Fotoğraf üstü ad `on-image` rolündedir, altyazıyla (`on-image-soft`) aynı aileden okunur. */
    color: theme.colors['on-image'],
  },
  quantity: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    // Şablon 10,5; ölçekte o durak yok. `micro` (11,5) alındı: `eyebrow` (10) sayıca daha yakın
    // ama üstbaşlık kademesidir — cümle biçimli bir alt satır onun ağırlığı/aralığıyla döner.
    fontSize: theme.text.micro,
    // Fotoğraf üstü altyazı rolü.
    color: theme.colors['on-image-soft'],
  },
  /**
   * Yer şeridi fotoğrafın üst kenarında solmayan katmandır, çünkü müşteri kartın neden soluk olduğunu ancak bu satırdan okur. Zemin
   * opak krem ki yazı fotoğrafın her karesinde okunsun; dolgu ve köşe durum rozetinin duraklarında, ikisi aynı rozet ailesinden.
   */
  noteBand: {
    alignSelf: 'flex-start',
    marginBottom: theme.space['2xs'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['sand-50'],
  },
  /* Kademe durum rozetiyle aynı (`badge-sm`): şerit bir cümle değil işaret, kartın köşe rozetleri ailesinden. */
  noteLabel: {
    flexShrink: 1,
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
    color: theme.colors.terracotta,
  },
  /* Fiyat çipi kartın SAĞ ÜST köşesinden taşar (şablon: `top:-8px;right:-5px`). Yatay ofset
     ölçekte ara değer, yukarı yuvarlandı (5 → 6). */
  priceBadge: {
    position: 'absolute',
    top: -theme.space.md,
    right: -theme.space.sm,
  },
}));
