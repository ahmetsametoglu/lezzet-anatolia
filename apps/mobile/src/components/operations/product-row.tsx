import type { ReactNode } from 'react';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import { OperationsProductThumb } from './product-thumb';

/*
  ÜRÜN SATIRI — kare + ad/boy + alt satırlar + sağ blok (v3:03, üç kullanım).

  ── NE PAYLAŞILIYOR, NE PAYLAŞILMIYOR ───────────────────────────────────────
  Tasarımın üç satırı (kapanan kutunun içeriği · açık kutunun içeriği · kontrol listesi) DIŞ
  görünüşte ayrı: biri üst çizgili bir liste satırı, biri renkli zeminli, biri kenarlıklı kart.
  Ortak olan İÇ DİZİLİM: solda kare, ortada ad + altına düşen bilgiler, sağda sayı.

  Bu yüzden komponent yalnız o dizilimi kuruyor; **kabuk (zemin, çerçeve, yarıçap, dolgu) çağıranın
  işi** ve `style` ile geliyor — `PressableSurface`in aynı ayrımı. Bir `variant` prop'u konsaydı
  üç görsel kimlik tek dosyaya gömülürdü ve dördüncü kullanım geldiğinde ya dördüncü bir varyant ya
  da bir sapma doğardı ("improvise etme" kuralının tam tersi).

  ── AD VE BOY: İKİ ALAN, İKİ BİRLEŞME KİPİ ──────────────────────────────────
  Tek dizge olarak geçirilseydi çağıran onu kendi birleştirir ve kip farkı kaybolurdu; iki alan
  olarak alınıyor ve birleşimi BURADA yapılıyor (`titleMode` künyesi). İlk turda "tasarım üçünde
  de boyu soluk yazıyor" diye yazılmıştı — **ölçüm bunu çürüttü**: kontrol listesi ikisini tek
  ağırlıkta ve "·" ile birleştiriyor (`{{tk.ad}} · {{tk.boy}}`), kutu satırları ise soluk ve
  boşlukla. İkisi ayrı rol.

  ── SATIR BAŞLIĞI HEP MÜREKKEP (tasarımdan bilinçli sapma) ──────────────────
  Kapanan kutunun satırında ad soluk (`#6d7261`), ötekilerde mürekkep. Üçte ikinin kuralı alındı:
  aynı ürün adı iki blokta iki farklı ağırlıkta okunursa depocu onu iki ayrı şey sanır. Kapanan
  kutunun "salt okunur" olduğu zaten bloğun kendi başlığında yazıyor, ürün adının solmasıyla değil.
*/

interface OperationsProductRowProps {
  /** Ürün adı — başlığın kalın yarısı, monogram da buradan türer. */
  name: string;
  /** Boy etiketi ("90 g"); boşsa yazılmaz — boş bir ince yarım, olmayan bir ayrımı gösterirdi. */
  variantLabel?: string | null;
  /**
   * Başlığın iki yarımı NASIL birleşir — ölçüldü (31.08, v3:03):
   *
   * · `name-first` (varsayılan) — **ad kalın, boy soluk, aralarında boşluk.** Kutu satırlarının
   *   hâli: orada ne konduğu zaten belli, boy yalnız hangi boy olduğunu hatırlatır (ikincil).
   * · `full-name` — **ad · boy, tek ağırlık, "·" ayracıyla.** Kontrol listesinin hâli: depocu
   *   rafta ürünü BU İKİSİYLE tanıyor ("Mangolu Artisan Kek · 90 g") ve boyu soluklaştırmak,
   *   aramanın yarısını silik gösterirdi.
   *
   * Ayrım `size`a bağlanmadı: ölçüde değil ROLDE — aynı boyda bir satır bir gün öteki kipi
   * isteyebilir ve o gün "md ise nokta koy" kuralı sessiz bir tuzağa dönerdi.
   */
  titleMode?: 'name-first' | 'full-name';
  photoUri?: string | null;
  /** `sm` kutu içeriği (kare 30, başlık 12) · `md` kontrol listesi (kare 44, başlık 13). */
  size?: 'sm' | 'md';
  /** Karenin zemini — `olive` yalnız açık kutunun içinde. */
  tone?: 'neutral' | 'olive';
  /** Başlığın altına düşen satırlar (raf, "bu kutuda 2", rozet). */
  meta?: ReactNode;
  /** Sağ blok — sayaç, oran, kaldır düğmesi. */
  right?: ReactNode;
  /**
   * Satır dokunulabilir mi. Verilmezse satır bir KAYITTIR (kapanan kutu içeriği) ve dokunulmaz —
   * dokunulabilir görünüp hiçbir şey yapmayan satır, arızalı bir satırdır.
   */
  onPress?: () => void;
  /** Dokunulabilir satırda ekran okuyucu adı. */
  accessibilityLabel?: string;
  /** Kabuk: zemin, çerçeve, yarıçap, dolgu — çağıranın işi. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function OperationsProductRow({
  name,
  variantLabel,
  photoUri,
  size = 'sm',
  tone = 'neutral',
  titleMode = 'name-first',
  meta,
  right,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: OperationsProductRowProps) {
  const body = (
    <>
      <OperationsProductThumb name={name} photoUri={photoUri} size={size} tone={tone} />
      <View style={styles.center}>
        <Text style={size === 'sm' ? styles.title_sm : styles.title_md}>
          {name}
          {variantLabel ? (
            titleMode === 'full-name' ? (
              ` · ${variantLabel}`
            ) : (
              <Text style={styles.variant}> {variantLabel}</Text>
            )
          ) : null}
        </Text>
        {meta}
      </View>
      {right}
    </>
  );

  if (onPress === undefined) {
    return (
      <View style={[styles.row, style]} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <PressableSurface
      onPress={onPress}
      /* Tasarımın `style-active="transform:scale(.99)"`i — büyük yüzeyin durağı; `scale-small`
         (.9) bir kart genişliğinde sıçrama gibi okunur. */
      feedback="scale"
      style={[styles.row, style]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {body}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  /*
    Kare ile metin arası: tasarım 9/10/11 diyor — tek durakta (`lg`, 10) toplandı; üç değer
    arasındaki 1 dp fark ekranda ayırt edilemez ama üç ayrı sabit olarak yaşardı.

    ASGARİ YÜKSEKLİK YOK, bilerek: tasarımın 38/42/64'ü satırları eşitlemek için var ve o eşitliği
    burada KARENİN KENDİSİ kuruyor (30 ya da 44) + çağıranın dolgusu. Ayrıca yazılsaydı iki kaynak
    olurdu ve dolgusunu değiştiren çağıran, sebebini göremediği bir boşlukla kalırdı.
  */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  center: {
    /* `minWidth: 0` YOK — RN'de flex çocuğu varsayılan olarak küçülebilir (web'in `min-width:auto`
       tuzağı burada yok); tasarımdaki `min-width:0` web'e özgü bir düzeltmedir. */
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  title_sm: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  title_md: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  variant: {
    fontFamily: operationsTheme.font.body[400],
    color: operationsTheme.colors.muted,
  },
});
