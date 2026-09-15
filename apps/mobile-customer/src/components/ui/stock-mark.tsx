import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  YER İŞARETİ (21.20) — "bu ürün BANA nasıl gelir" sorusunun kart üstündeki tek cevabı.

  NEDEN AYRI KOMPONENT: aynı işaret iki ayrı kartta çiziliyor — katalog ızgarasının KARE kartı
  (`ProductPhotoCard`, fotoğrafın köşesinde) ve vitrin rayının DAİRE kartı (`ProductCircleCard`,
  adın altında). İki kartın rozet geometrisi farklı ama TAŞIDIĞI BİLGİ aynı; renk çiftini iki
  dosyaya yazmak, bir gün birinin ötekinden ayrılması demekti (CLAUDE §1). Web'de de tek komponent
  var (`components/customer/delivery/stock-mark.tsx`) ve gerekçesi aynı.

  METİN GELİR, HESAPLANMAZ: hangi cümlenin yazılacağına `lib/places/place-view.ts` karar verir
  (`stockMarkOf`), çünkü kararın kaynağı `@lezzet/helper`taki `elsewhereReasonOf`tur ve o kural
  web ile ortaktır. Bu dosya yalnız çizer.

  TÜKENDİ BURADA YOK: o yere bağlı değil evrensel bir hâldir ve kartın kendi durum rozetidir
  (`soldOutLabel`). İki eksen — "var mı" ve "bana gelir mi" — iki ayrı yerden konuşur.

  ── ŞABLONDAN SAPMA (bilinçli) ──────────────────────────────────────────────
  v3'te katalog kartının yer işareti YOK (rota dışı müşteri o tasarımda hiç kurgulanmamış). Yeni
  bir görsel dil ÜRETİLMEDİ: hem renk çiftleri hem rozet geometrisi şablonun kendi öğelerinden
  alındı — renkler ürün detayının kargo künyesinden ve sepetin "teslim edilemez" satırından
  (tonların künyesi `place-view.ts`), yerleşim ise kartın MEVCUT durum rozeti yuvasından.

  BÜYÜK HARFE ÇEVRİLMEZ — kartın komşu rozetinin (TÜKENDİ · İNDİRİM) aksine. O ikisi tek KELİME;
  bu bir CÜMLE ("Bu adrese gönderemiyoruz") ve büyük harf hem bağırır hem satır genişliğini
  şişirir. Kademe (10) ve harf aralığı komşusuyla aynı kalır ki köşe tek bir aileden okunsun.
*/

/**
 * İşaretin üç tonu — üçü de tasarımın KENDİ renk çiftleri, yeni bir görsel dil değil.
 *
 *   `info`    — ürün gelecek, yolu farklı. `olive-bg` + `olive-dark`: v3'ün kargo künyesi rozeti
 *               (`pd.noShip` — #eef2e2 zemin, #4a6121 metin).
 *   `pending` — bekleme: bugün yok, gelecek. `closed-bg` + `closed`, "kapanmış/bekleyen" ailesi.
 *               Yaprak tonuna KATILMADI: "şu an yok" iyi haber değil ve olumlu bir rozet rengiyle
 *               söylenirse müşteri onu satın alınabilirlik sanır.
 *   `blocked` — kapı kapalı: bu adrese gitmiyor. `error-bg` + `error`: v3'ün "teslim edilemez"
 *               sepet satırının çifti (#f4e3e0 zemin, #a44a3f metin).
 *
 * Ton adları KİTİN sözlüğüdür, alan diline (`shipping`/`elsewhere`) bağlanmaz: hangi stok hâlinin
 * hangi tonu taşıdığına `lib/places/place-view.ts` karar verir.
 */
export type StockMarkTone = 'info' | 'pending' | 'blocked';

/** Çizilecek işaretin tamamı — cümle + ton. `null` = işaret yok (iyi haber sessizdir). */
export interface StockMarkView {
  label: string;
  tone: StockMarkTone;
}

interface StockMarkProps extends StockMarkView {
  /** Fotoğrafın köşesinde (kare kart) küçük kademe; varsayılan hâli kart altındaki satır içindir. */
  compact?: boolean;
  testID?: string;
}

export function StockMark({ label, tone, compact = false, testID }: StockMarkProps) {
  return (
    <View style={[styles.badge, compact ? styles.compact : styles.regular, styles[tone]]} testID={testID}>
      {/* İki satır tavanı: kartın fotoğrafını yutan bir rozet, bilgi vermek yerine ürünü gizler. */}
      <Text style={[styles.label, compact ? styles.compactLabel : styles.regularLabel, styles[`${tone}Label`]]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.badge,
  },
  /* Kare kartın MEVCUT durum rozetiyle birebir aynı geometri (dolgu + yarıçap): köşede iki rozet
     alt alta duruyor ve farklı ölçüde olsalardı ikisi ayrı ailelerden gelmiş gibi okunurdu. */
  compact: {
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
  },
  /* Kart ALTINDAKİ hâl: daire kartın kendi ekseni ortadır (ad ve çeşit satırı da ortalı), o yüzden
     rozet `flex-start` yaslamasını burada ortaya çevirir. */
  regular: {
    alignSelf: 'center',
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.md,
  },
  label: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
  },
  compactLabel: {
    fontSize: theme.text['badge-sm'],
  },
  regularLabel: {
    // Daire kartın altındaki çeşit satırıyla aynı kademe (`helper`): işaret o satırın komşusudur,
    // kendi başına bir başlık değil.
    fontSize: theme.text.helper,
    textAlign: 'center',
  },
  info: { backgroundColor: theme.colors['olive-bg'] },
  infoLabel: { color: theme.colors['olive-dark'] },
  pending: { backgroundColor: theme.colors['closed-bg'] },
  pendingLabel: { color: theme.colors.closed },
  blocked: { backgroundColor: theme.colors['error-bg'] },
  blockedLabel: { color: theme.colors.error },
}));
