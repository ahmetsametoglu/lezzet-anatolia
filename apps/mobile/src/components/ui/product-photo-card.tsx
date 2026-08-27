import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';
import { Tag } from './tag';
import { useAppLocale } from '../../lib/i18n/app-locale';
import { upperIn } from '../../lib/i18n/locale';
import { emToDp } from '../../theme/parse';

/*
  KARE ÜRÜN KARTI — KATALOG IZGARASI (v3 `catProds`, iki sütun). Kullanıcı kararı 07.08: katalog
  kartı DAİRE değil KAREdir; daire yalnız vitrin rayında (146) ve "bunları da sevebilirsiniz"
  rayında (96) kalır (`ProductCircleCard`). İki kart bilerek AYRI komponenttir: daire "fotoğraf +
  altında ad", kare "fotoğrafın İÇİNDE ad" — aynı gövdeye iki düzen sığdırmak, her prop'u
  "hangi biçimde geçerli" diye şartlı okumak demekti.

  YAPI (şablon: `design/project/Mobil - Musteri v3.dc.html` §catProds):
    kart (kare, `aspect-ratio:1`)
      └ fotoğraf katmanı (inset 0 · yarıçap `card` · overflow hidden · SOLAN GRUP)
          ├ fotoğraf (yoksa kum zemin — baş harf YOK, ad zaten fotoğrafın üstünde duruyor)
          └ alt gradyan (yazının okunması için)
      └ durum rozeti (sol üst, tükendi/indirim) — SOLMAZ
      └ künye (sol alt): ad + çeşit satırı + YER NOTU — SOLMAZ
      └ fiyat çipi — kartın DIŞINA taşar (sağ üst), o yüzden fotoğraf katmanının kardeşidir:
        kırpılan katmanın içinde olsaydı taşan kısmı kesilirdi.

  `CirclePhoto` BİLEREK KULLANILMADI: onun taşıdığı ortak davranış "fotoğraf yoksa baş harfe düş";
  bu kartta baş harf yoktur (şablon `placeholder=" "`), fotoğrafsız kart yalnız kum zemindir.
  Ortak olmayan bir davranış için ortak komponent zorlamak, `CirclePhoto`ya kare/harfsiz iki şart
  eklerdi.

  SOLMA FOTOĞRAFA UYGULANIR, BİLGİYE DEĞİL (kullanıcı bulgusu 10.08 — arıza düzeltmesi). `opacity`
  şablonda da fotoğraf KATMANINDADIR ve bizde de öyle kaldı; arıza şablonun kararı değil, bizim
  yapı kurgumuzun yan etkisiydi: rozet yığınını ve alt künyeyi o katmanın İÇİNE koymuştuk, yani
  solmanın SEBEBİNİ açıklayan cümle ("Bu adrese gönderemiyoruz") tam da gerektiği anda okunaksız
  hâle geliyordu. Rozet ve künye artık fotoğraf katmanının KARDEŞİ (fiyat çipiyle aynı hizada) ve
  tam opaklıkta duruyor; konumları birebir aynı çünkü katman zaten `inset:0` ile kartın kutusunu
  kaplıyordu. Kırpılmaya da ihtiyaçları yok — ikisi de kart sınırının içinde duruyor.

  GRADYAN SOLAN GRUPTA KALIR: fotoğrafla birlikte solmasaydı, soluk bir fotoğrafın üstünde tam opak
  bir koyu leke bırakırdı. Aynı tercih künyenin okunurluğunu da ARTIRIYOR: eskiden cümle de %45'e
  düşüyordu ve fotoğrafsız kartta krem yazı kum zemine karışıyordu (`on-image` #f5f1e6 ile
  `sand-50` #faf6ec neredeyse aynı) — şimdi yazı tam, altındaki gradyan yarı yoğunlukta.

  TÜKENDİ ve "bu adrese gitmiyor" AYNI düzeltmeyi alır: ikisi de aynı `faded` kapısından geçiyor,
  ayrı davranmaları için bir sebep yok — biri fotoğrafı soldurup bilgiyi bırakıyorsa öteki de.
  Emsal kitin içinde: daire kart (`ProductCircleCard`) solmayı zaten yalnız fotoğrafa uyguluyor,
  ad ve rozetleri tam opak bırakıyor. İki kart artık aynı şeyi söylüyor.

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
  /**
   * YER NOTU (21.20 · kullanıcı kararı 10.08) — "bu ürün BANA nasıl gelir" sorusunun cevabı, ama
   * yalnız SÖYLENECEK bir şey varken: "Bu adrese gönderemiyoruz" / "Bölgenizde şu an yok".
   * Cümleyi çağıran kurmaz, `stockMarkOf` kurar (`lib/places/place-view.ts`); kart yalnız çizer.
   *
   * **ROZET DEĞİL, YAZI** (kullanıcı kararı 10.08): `StockMark` kabuğu (zemin · kenarlık · dolgu)
   * bu kartta KULLANILMAZ — "her şey rozet içindeymiş gibi görünüyordu". Metin doğrudan alt
   * gradyanın üstüne yazılır; okunurluk gradyandan gelir, ayrıca zemin EKLENMEZ. Bu yüzden notun
   * yeri de değişti: rozet yığını sol ÜST köşedeydi, gradyan ise ALTTA — zeminsiz bir yazı üst
   * köşede fotoğrafın üstünde okunmazdı. Not artık künyenin son satırı.
   *
   * "Kargoyla gelir" hâli BURAYA HİÇ GELMEZ (aynı karar): rota dışı müşterinin kartlarının
   * neredeyse tamamı onu taşıyordu, yani bilgi olmaktan çıkıp gürültü oluyordu. Gönderemediğimizi
   * zaten solmayla ayırıyoruz; geri kalanın kargoyla geleceğini listenin başındaki bant söylüyor.
   */
  placeNote?: string;
  /**
   * Kartı SOLDUR — ürün bu adrese hiç gitmiyorken (`elsewhere` + rota dışı). Tükendiyle aynı
   * solma değeri kullanılır çünkü müşteri açısından sonuç aynı: bu kart bugün bir satın alma
   * değil, bir bilgi.
   *
   * **Kart yine BASILABİLİR kalır** (bilinçli): tasarımın "aksiyonsuz" hükmü satın alma yolunu
   * kapatır, ürünü de kapatmaz. Detay sayfası bu hâlde "neden" ve "haber ver"i taşıyor; kartı
   * ölü bir dikdörtgene çevirmek müşterinin tek çıkışını almak olurdu (yer bir SÖZ, bir filtre
   * değil — `apps/web/lib/delivery/place-types.ts`).
   */
  dimmed?: boolean;
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
  placeNote,
  dimmed = false,
  optionsLabel,
  accessibilityLabel,
  testID,
}: ProductPhotoCardProps) {
  const { theme } = useUnistyles();
  const locale = useAppLocale();

  /* Durum rozeti TEK yuvadadır (şablonda ikisi de sol üst köşede): tükendi indirimin önüne geçer,
     çünkü tükenmiş bir üründe indirim bilgisi alınabilir bir şey söylemez. */
  const statusLabel = soldOut ? soldOutLabel : discountLabel;
  /* Yer notu TÜKENDİDE basılmaz: ürün hiçbir yerde yokken "bu adrese gelmez" demek, cevabı
     olmayan bir soruya cevap vermek olurdu. Sözleşme bunu zaten garanti ediyor (`soldOut` yalnız
     `out_of_stock` hâlinde, `stockMarkOf` da o hâlde `null` dönüyor) — ikinci kapı yine de burada,
     çünkü kartın kendi ön koşulunu bilmesi iki çağıranın (katalog · vitrin) onu unutmasından
     güvenlidir. */
  const note = soldOut ? undefined : placeNote;
  /* Solma İKİ sebepten gelebilir ve ikisi de aynı katmana uygulanır (şablonda `opacity` fotoğraf
     katmanındadır): tükendi (evrensel) ya da bu adrese gitmiyor (yere bağlı). */
  const faded = soldOut || dimmed;

  /* ERİŞİLEBİLİR AD ad + fiyat; durum rozeti VARSA ona eklenir. Rozetin `accessibilityState`e
     çevrilmesi denenmedi çünkü RN'in durum sözlüğünde "tükendi" YOK; en yakını (`disabled`) yalan
     olurdu — tükenmiş kart hâlâ açılır, ürün sayfası çeşit ve haber-ver seçeneğini gösterir.
     Rozet metni de sessizce düşürülemez: `accessibilityLabel` verildiği an RN çocuk metinleri
     okumaz, yani rozet ekran okuyucuda tamamen kaybolurdu. Yer notu da aynı sebeple eklenir:
     "bu adrese gönderemiyoruz" gören müşteri ile duyan müşteri aynı bilgiyi almalı. */
  const composedLabel = [name, priceLabel, statusLabel, note].filter((part) => part !== undefined).join(' · ');

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
      {/* SOLAN GRUP — yalnız fotoğraf ve onun gradyanı. Katman `inset:0` olduğu için kartın
          kutusuyla aynı; altındaki bilgi öğeleri de bu yüzden aynı koordinatlarda kalıyor. */}
      <View style={[styles.photoLayer, faded ? styles.fadedPhoto : undefined]}>
        {photoUri === undefined || photoUri === null ? null : (
          <Image source={{ uri: photoUri }} style={styles.image} accessibilityIgnoresInvertColors />
        )}
        <LinearGradient
          {...theme.gradient.photoBottom}
          style={styles.scrim}
          pointerEvents="none"
          testID={testID === undefined ? undefined : `${testID}-scrim`}
        />
      </View>
      {/* Sol üst köşe: durum rozeti (tükendi/indirim) — şablonun TEK rozet yuvası. Yer notu artık
          buraya girmiyor (künye §ROZET DEĞİL), yani yuva yeniden tekildir. */}
      {statusLabel === undefined ? null : (
        <View style={[styles.statusBadge, soldOut ? styles.soldOutBadge : styles.discountBadge]}>
          {/* Büyük harf dilin kuralıyla (`upperIn`), stilin `textTransform`una bırakılmaz — o
              dönüşümü Android native CİHAZIN diliyle yapıyor (ölçüldü 28.08, `cart-line-row`). */}
          <Text style={[styles.statusLabel, soldOut ? styles.soldOutText : styles.discountText]}>
            {upperIn(statusLabel, locale)}
          </Text>
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
      {/* YER NOTU KARTIN ORTASINDA (kullanıcı kararı 10.08, üçüncü tur) — künyenin içinde DEĞİL.
          Künyeye konduğunda ürünün başlığının yerini alıyordu: iki satırlık bir cümle adın hemen
          altına binince kartın kimliği (ad + fiyat) ikinci plana düşüyordu.
          Artık kartın TAMAMINI örten filigranın üstünde, ortalanmış ve künye kademesinden BÜYÜK:
          bu bir dipnot değil, kartın o müşteri için verdiği cevabın kendisi.
          `pointerEvents="none"`: örtü dokunuşu yutmaz — kart yine ürün detayına açılır. */}
      {note === undefined ? null : (
        <View style={styles.noteVeil} pointerEvents="none">
          <Text style={styles.placeNote} numberOfLines={3} testID={testID === undefined ? undefined : `${testID}-place-note`}>
            {note}
          </Text>
        </View>
      )}
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
  /* Solma DURAĞI tükendiden gelir (`soldOutOpacity`) ama artık iki sebebi var; adı bu yüzden
     "solan fotoğraf". Değer paylaşılır çünkü müşteri açısından sonuç aynı. */
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
  /* Şablonun tek rozet köşesi (10/10). Yığın kalktı: tek rozet kaldığı için ayrı bir konum
     sarmalayıcısına gerek yok — konum rozetin kendisinde. */
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
    // Fotoğraf üstü ALTYAZI rolü; değeri #d5d0c2 (Token Kararlari #15 — rol ile değer örtüştü).
    color: theme.colors['on-image-soft'],
  },
  /**
   * YER NOTUNUN FİLİGRANI — kartın tamamını örten yarı saydam katman (daire kartın ikizi).
   *
   * Solma tek başına SESSİZ bir işarettir: müşteri kartın neden soluk olduğunu bilemez. Filigran
   * hem cümleyi taşıyacak zemini verir hem de sebebi görselin kendisine bıraktırmaz. Örtü fotoğraf
   * katmanının KARDEŞİ, çocuğu değil — solma fotoğrafa uygulanıyor ve yazı onunla birlikte
   * solsaydı, tam da okunması gereken cümle okunaksızlaşırdı (kullanıcı bildirimi 10.08).
   */
  noteVeil: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.scrim,
  },
  /* Kademe künyeden BÜYÜK (`micro` → `body`, adın kademesi): cümle bir dipnot değil, kartın o
     müşteri için verdiği cevap. Zemin/kenarlık YOK — okunurluğu filigran veriyor. */
  placeNote: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
    color: theme.colors['on-image'],
    textAlign: 'center',
  },
  /* Fiyat çipi kartın SAĞ ÜST köşesinden taşar (şablon: `top:-8px;right:-5px`). Yatay ofset
     ölçekte ara değer, yukarı yuvarlandı (5 → 6). */
  priceBadge: {
    position: 'absolute',
    top: -theme.space.md,
    right: -theme.space.sm,
  },
}));
