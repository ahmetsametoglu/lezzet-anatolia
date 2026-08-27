import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CirclePhoto } from '@/components/ui/circle-photo';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { emToDp } from '@/theme/parse';

/*
  KOLEKSİYON BANDI (v3:105) — vitrinin kenardan kenara uzanan renkli şeridi. Üç şey birden yapar:
  koleksiyonun adını söyler, kaç çeşit olduğunu söyler ve katalogda o süzgeci açar.

  ŞERİT SIRAYLA ÜÇ TON: zeytin → kum → terracotta. Ton `index`ten türer, veriden DEĞİL — bir
  koleksiyonun rengi onun özelliği değil, listedeki YERİdir (şablonun `BS[i%3]` kalıbı).

  YÖN DE SIRAYLA DEĞİŞİR: tek sıradaki bantta metin solda/daire sağda, çift sırada tersi. Daire
  banttan yukarı ve aşağı TAŞAR ve yatayda şeridin dışına sarkar — kırpılMAZ, tasarımın imzası bu.

  RENK EŞLEŞMESİ ±: şablonun ara tonları (`#dfe7cb`, `#f6d9c4`) palette birebir yok; her bantta
  üstbaşlık ile sayaç AYNI tona bağlandı (şablonda ikisi bir tık ayrışıyor). Fark okunurluğu
  değiştirmiyor, palete uydurma renk eklemekten iyi.
*/

interface CollectionBandProps {
  name: string;
  /** Adın altındaki cümle; `null` = yazılmamış → satır çizilmez (yedek metin uydurulmaz — şema künyesi). */
  subtitle: string | null;
  /** "12 çeşit ›" — cümle cihazda kurulur, sayı veriden. */
  countLabel: string;
  /**
   * KESİTİN İNDİRİM ROZETİ ("−%15" / "−3,00 €") — verilirse sayaç satırının başında hap çıkar.
   *
   * Kampanya bir ÜRÜNÜN değil bir KESİTİN özelliğidir (motor kapsamı: kategori | koleksiyon), o
   * yüzden rozetin yeri burasıdır — 23.08'de ürün kartlarına konmuştu ve sepete bir kez inen
   * indirimi ürün başına vaat gibi gösteriyordu (kullanıcı bildirimi 27.08).
   *
   * Eşikli kampanya buraya GELMEZ: koşulu rozete sığmaz, o yüzden `countLabel` içinde tam
   * cümlesiyle kalır. Ölçüt kitte (`scopeBadgeOf`), bant yalnız sonucu çizer.
   */
  discountLabel?: string;
  /** Listedeki sıra — ton ve yön bundan türer. */
  index: number;
  photoUri: string | null;
  onPress: () => void;
  testID?: string;
  /**
   * Daire ÜST KATMANDA çizilecekse bant kendi dairesini çizmez (v3: daire z-index'le TÜM
   * bantların üstündedir ve komşu banda taşar; RN'de kardeş sırası z-sırası olduğundan bunu
   * ancak vitrindeki üst katman verebilir — kullanıcı bulgusu 08.08).
   */
  photoInOverlay?: boolean;
}

/** Şablonun `BS` dizisi: üç ton, sırayla. */
const TONES = ['olive', 'sand', 'terracotta'] as const;

export function CollectionBand({
  name,
  subtitle,
  countLabel,
  discountLabel,
  index,
  photoUri,
  onPress,
  testID,
  photoInOverlay = false,
}: CollectionBandProps) {
  const { theme } = useUnistyles();
  /* Koleksiyon adı SUNUCUDAN müşterinin dilinde geliyor; büyütmesi de o dilin kuralıyla yapılmalı
     (MB-71). Bant `locale` prop'u almıyor ve almamalı — çağıranların hepsi aynı tek kaynağı
     okuyor (`useAppLocale`), prop'a çevirmek o kaynağı ikinci bir yoldan taşımak olurdu. */
  const locale = useAppLocale();
  const tone = TONES[index % TONES.length] as (typeof TONES)[number];
  const mirrored = index % 2 === 1;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      style={[styles.band, styles[tone]]}
      accessibilityLabel={`${name} · ${countLabel}`}
      testID={testID}
    >
      <View style={[styles.text, mirrored ? styles.textMirrored : styles.textNormal]}>
        <Text
          style={[styles.eyebrow, styles[`${tone}Accent`], mirrored ? styles.alignEnd : undefined]}
          numberOfLines={1}
        >
          {upperIn(name, locale)}
        </Text>
        {/*
          SATIR SINIRI, YÜKSEKLİK SERBESTLİĞİ DEĞİL (MB-25, 14.08 — kullanıcı bulgusu 11.08).
          Ölçülen arıza: dört satırlık bir başlıkta *"23 çeşit ›"* satırının yalnız üst yarısı
          görünüyor, altını sonraki bant boyuyordu. Bant kırpmıyor (`overflow: 'visible'`), taşan
          metin komşu bandın ALTINDA kalıyor — kardeş sırası z-sırası olduğu için.

          Bandın boyu SERBEST BIRAKILAMAZ: üst katman dairesi bantları `index * collectionBand`
          ile konumlandırıyor (aşağıdaki `CollectionPhotoOverlay`), yani yükseklik bir ölçü değil
          bir SÖZLEŞME — değişse daireler kayardı.

          Sınır ölçüden geliyor, gözden değil. Bütçe 132 dp; en zorlu hâl "Büyük" yazı boyutu
          (×1,15): göz üstü ~15 + sayaç ~17 + iki boşluk 4 = 36, başlığa kalan 96. Başlık satırı
          20 × 1,15 × 1,15 ≈ 26,5 dp → üç satır 79 (sığar), dört satır 106 (TAŞAR — ölçülen hâl).
          İki satırda durduruyoruz: üçüncü satır aritmetik olarak sığsa da payı sıfıra indiriyor
          ve daha büyük erişilebilirlik ölçeklerinde ilk taşan o olurdu. Göz üstü de tek satır —
          o bir koleksiyon ADI, sarması beklenmiyor ama sarsa aynı bütçeden yiyecekti.
        */}
        {subtitle === null ? null : (
          <Text
            style={[styles.title, styles[`${tone}Title`], mirrored ? styles.alignEnd : undefined]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
        {/* Sayaç satırı rozeti de taşır: rozet AYRI BİR SATIR OLAMAZ — bandın yüksekliği bir ölçü
            değil bir sözleşmedir (yukarıdaki künye), üçüncü satır daireleri kaydırırdı. Hap tek
            satırlık sayaçtan yalnız birkaç dp yüksek ve o pay bütçede var. */}
        <View style={[styles.countRow, mirrored ? styles.countRowMirrored : undefined]}>
          {discountLabel === undefined ? null : (
            <View style={[styles.badge, styles[`${tone}Badge`]]}>
              <Text style={[styles.badgeText, styles[`${tone}BadgeText`]]}>{discountLabel}</Text>
            </View>
          )}
          <Text style={[styles.count, styles[`${tone}Accent`]]}>{countLabel}</Text>
        </View>
      </View>
      {photoInOverlay ? null : (
      <View style={[styles.photo, mirrored ? styles.photoMirrored : styles.photoNormal]} pointerEvents="none">
        <CirclePhoto
          size={customerMetrics.collectionPhoto}
          initial={name.slice(0, 1)}
          // Şablon burada devasa bir harf çiziyor (`64px`); ölçekte en büyük mobil durak `h1-sm`.
          initialFontSize={theme.text['h1-sm']}
          initialStyle={styles.initial}
          photoUri={photoUri}
          style={styles.photoSurface}
        />
      </View>
      )}
    </PressableSurface>
  );
}

/**
 * Üst katman dairesi — vitrindeki bant YIĞINININ üstüne, bant sırasına göre konumlanır.
 * Bandın kendi dairesiyle AYNI ölçü/dönüş/yön kuralları (tek kaynak: bu dosya) — iki yerde
 * çizim kuralı yaşamasın diye band'la yan yana burada durur.
 */
export function CollectionPhotoOverlay({ name, index, photoUri }: Pick<CollectionBandProps, 'name' | 'index' | 'photoUri'>) {
  const { theme } = useUnistyles();
  const mirrored = index % 2 === 1;
  return (
    <View
      style={[
        styles.photo,
        mirrored ? styles.photoMirrored : styles.photoNormal,
        { top: index * customerMetrics.collectionBand + (customerMetrics.collectionBand - customerMetrics.collectionPhoto) / 2 },
      ]}
      pointerEvents="none"
    >
      <CirclePhoto
        size={customerMetrics.collectionPhoto}
        initial={name.slice(0, 1)}
        initialFontSize={theme.text['h1-sm']}
        initialStyle={styles.initial}
        photoUri={photoUri}
        style={styles.photoSurface}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  band: {
    height: customerMetrics.collectionBand,
    justifyContent: 'center',
    // Daire yatayda dışarı sarkıyor; bandın kendisi kırpmaz (şablon: `left/right:-34px`).
    overflow: 'visible',
  },
  olive: { backgroundColor: theme.colors.olive },
  sand: { backgroundColor: theme.colors['sand-150'] },
  terracotta: { backgroundColor: theme.colors.terracotta },

  text: {
    // Metin bloğu bandın YARISINDAN dar (şablon: `max-width:56%`) — daireye yer bırakır.
    maxWidth: '56%',
    gap: theme.space['2xs'],
  },
  textNormal: { marginLeft: theme.space['6xl'] },
  textMirrored: { marginLeft: 'auto', marginRight: theme.space['6xl'] },
  alignEnd: { textAlign: 'right' },

  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
  },
  title: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    lineHeight: theme.text['h2-sm'] * theme.text['h1--line-height'],
  },
  count: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
  },
  /* Rozet + sayaç TEK satırda; aynalanmış bantta sıra da aynalanır ki hap dış kenarda kalsın. */
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  countRowMirrored: {
    flexDirection: 'row-reverse',
  },
  /* Hap ürün kartının durum rozetiyle AYNI ölçüde (`statusBadge`): aynı uygulamada iki farklı
     rozet iriliği, ikisini de tesadüf gibi gösterirdi. Ayrışan tek şey RENK — bandın tonu. */
  badge: {
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.badge,
  },
  badgeText: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
  },
  /* Üç ton, üç kontrast çifti: hap her bantta zeminden ayrılmak zorunda. Krem hap `sand-150`
     bandın üstünde kaybolurdu, o yüzden orada tam ters çift (terracotta zemin + krem yazı). */
  oliveBadge: { backgroundColor: theme.colors['sand-50'] },
  oliveBadgeText: { color: theme.colors.olive },
  sandBadge: { backgroundColor: theme.colors.terracotta },
  sandBadgeText: { color: theme.colors['sand-50'] },
  terracottaBadge: { backgroundColor: theme.colors['sand-50'] },
  terracottaBadgeText: { color: theme.colors.terracotta },
  oliveAccent: { color: theme.colors['olive-light'] },
  oliveTitle: { color: theme.colors['sand-50'] },
  sandAccent: { color: theme.colors.terracotta },
  sandTitle: { color: theme.colors.ink },
  terracottaAccent: { color: theme.colors['terracotta-line'] },
  terracottaTitle: { color: theme.colors.card },

  photo: {
    position: 'absolute',
    // Daire dikeyde ortalanır ve iki uçtan taşar (148 > 132).
    top: (customerMetrics.collectionBand - customerMetrics.collectionPhoto) / 2,
  },
  /* Yatay taşma: şablonda 34 px. Ölçekte tam karşılığı yok; daire yarıçapının bir kısmı olarak
     değil, boşluk ölçeğinin en büyük durağıyla (30) verildi — 4 dp fark bandın dışında kalıyor. */
  photoNormal: { right: -theme.space['8xl'], transform: [{ rotate: '5deg' }] },
  photoMirrored: { left: -theme.space['8xl'], transform: [{ rotate: '-6deg' }] },
  photoSurface: {
    // Fotoğrafsız daire bandın kendi renginin bir tık koyusu olur (şablon: `rgba(21,23,15,.1)`).
    backgroundColor: theme.colors['scrim-soft'],
  },
  initial: {
    color: theme.colors['on-image-soft'],
  },
}));
