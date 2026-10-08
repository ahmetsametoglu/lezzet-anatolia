import { formatPrice, packageContentsLine, packageNoteOf, packageThumbsOf } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { HomePackage } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { usePurchasePlace } from '@/screens/customer-kit/purchase-place';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { useSelectedPickupWarehouse } from '@/screens/customer-kit/delivery-address-store';
import { PhotoSurface } from '@/screens/customer-kit/photo-surface';
import { PlaceNoticeBand } from '@/screens/customer-kit/place-notice-band';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
// Metin ortak pakette, çünkü web'in telefon paket listesi aynı sözlüğü okur.
import messages from '@lezzet/i18n/customer/packages';
import { PackagesListSkeleton } from './packages-list-skeleton';
import { usePackagesList } from './use-packages-list.hook';

/*
  Paketler sekmesi yayındaki paketlerin tamamını listeler; vitrindeki şerit yalnız işaretli paketleri taşır. Kart katalogdaki ürün
  kartının dilini konuşur: gidemeyeceğimiz paketin yalnız fotoğrafı solar, yer notu künyenin son satırında düz yazıdır ve "kargoyla
  gelir" karta yazılmaz, çünkü listenin başındaki bant onu bir kez söyler.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Yığında en çok bu kadar halka; fazlası "+N". */
const STACK_MAX = 3;

interface PackagesListScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function PackagesListScreen({ locale: forcedLocale }: PackagesListScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* Yer katalog ve vitrinle aynı kaynaktan (`usePurchasePlace`): kod sunucuya gider, depo orada çözülür ve kartın `soldOut`/`route`
     alanları ona göre dolar. */
  const { postalCode, country } = usePurchasePlace();
  const pickupWarehouseId = useSelectedPickupWarehouse();
  const list = usePackagesList(locale, postalCode, pickupWarehouseId, country);
  /* İkinci çözüm YALNIZ "rota içinde miyim" sorusunu cevaplar (depo kimliği istemciye hiç
     verilmez): cümlenin GEÇİCİ mi KALICI mı olduğunu ve bandın çizilip çizilmeyeceğini belirler. */
  const place = usePlaceResolution(postalCode ?? '', country);
  /* BANT: kataloğunkiyle aynı koşul (çözülmüş + rota dışı) ve aynı komponent. Bu sekmeye alt
     çubuktan DOĞRUDAN gelinebiliyor — katalogdan geçmeyen müşteri, adresinin gerçeğini hiç
     okumadan bir paket listesine bakardı. */
  const noticePlace = place?.kind === 'resolved' && !place.place.inRoute ? place.place : null;

  /* Sayfa başlığı HER DALDA durur (siparişler ekranının kuralı): yüklenirken, hata anında ve boş
     listede de kullanıcı hangi sayfada olduğunu görür. */
  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{upperIn(t.eyebrow, locale)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      <Text style={styles.body}>{t.body}</Text>
    </View>
  );

  const card = (pack: HomePackage) => {
    /* Paketin kendi gerçeği → ürün sözlüğü → cümle. Üç adım da paylaşılan kapıdan geçer; bu ekran
       hiçbirini kendi içinde hesaplamaz. */
    const stockMark = stockMarkOf(packageStockStatus(pack), place, locale);
    /* "Kargoyla gelir" (`info`) KARTA BASILMAZ — cümlesi bandın işi (başlık §3). Kartta kalan not,
       gönderemediğimiz (`blocked`) ya da bölgede olmayan (`pending`) paketinkidir. */
    const placeNote = stockMark === null || stockMark.tone === 'info' ? undefined : stockMark.label;
    /* Yer notu TÜKENDİDE basılmaz: paket hiçbir yerde yokken "bu adrese gelmez" demek, cevabı
       olmayan bir soruya cevap vermek olurdu (`packageStockStatus` zaten `out_of_stock` döner ve
       `stockMarkOf` o hâlde susar — bu satır kartın kendi ön koşulu). */
    const note = pack.soldOut ? undefined : placeNote;
    /* SOLMA iki sebepten: tükendi (evrensel) ya da bu adrese gitmiyor (yere bağlı). `pending`
       ("bölgenizde şu an yok") SOLMAZ — paket gelebilir, yalnız bugün değil. */
    const faded = pack.soldOut || stockMark?.tone === 'blocked';
    const footNote = packageNoteOf(pack, stockMark?.tone ?? null, t.note, locale);
    const thumbs = packageThumbsOf(pack.items, STACK_MAX);
    return (
      <PressableSurface
        key={pack.slug}
        onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
        feedback="scale"
        style={styles.card}
        /* Ekran okuyucu gören müşteriyle AYNI bilgiyi almalı: durum ve yer notu ada eklenir. */
        accessibilityLabel={[t.open.replace('{name}', pack.name), pack.soldOut ? t.card.soldOut : undefined, note, footNote]
          .filter((part) => part !== undefined && part !== '')
          .join(' · ')}
        testID={`packages-card-${pack.slug}`}
      >
        {/* Yalnız fotoğraf solar; skrim ve ad solmaz, yoksa solan kartta ad okunmazdı. */}
        <View style={styles.photo}>
          <PhotoSurface image={pack.image} initial={pack.name.slice(0, 1)} scrim faded={faded} style={styles.photoFill} />
          {/* Durum rozeti SOL ÜSTTE — kitin kendi ayrımı (sol üst durum, sağ üst fiyat). */}
          {pack.soldOut ? (
            <View style={styles.soldOutBadge}>
              <Text style={styles.soldOutLabel}>{t.card.soldOut}</Text>
            </View>
          ) : null}
          {/* Fiyat rozeti sağ üstte; vitrin şeridinde sol altta durur, ikisi ayrı karttır. */}
          <View style={styles.priceBadge}>
            <Tag label={formatPrice(pack.priceCents, locale)} rotate={3} shadow />
          </View>
          <View style={styles.caption}>
            <Text style={styles.name}>{pack.name}</Text>
          </View>
        </View>
        {/* Künye ve yer notu fotoğrafta değil gövdede, çünkü fotoğraf üstünde, özellikle solan kartta okunmuyorlardı. */}
        <View style={styles.cardBody}>
          <View style={styles.head}>
            <Text style={styles.meta}>{t.meta.replace('{n}', String(pack.itemCount))}</Text>
            {note === undefined ? null : (
              <Text style={styles.placeNote} testID={`packages-place-note-${pack.slug}`}>
                {note}
              </Text>
            )}
          </View>
          {pack.description === '' ? null : (
            <Text style={styles.description} numberOfLines={2}>
              {pack.description}
            </Text>
          )}
          {thumbs.shown.length === 0 ? null : (
            <View style={styles.contents} testID={`packages-contents-${pack.slug}`}>
              <View style={styles.thumbs}>
                {thumbs.shown.map((item, index) => (
                  <AvatarThumb
                    key={`${item.name}-${index}`}
                    initial={item.name.slice(0, 1)}
                    accessibilityLabel={item.name}
                    photoUri={item.thumbUrl}
                    size="sm"
                    stacked
                  />
                ))}
                {thumbs.more > 0 ? <Text style={styles.more}>{`+${thumbs.more}`}</Text> : null}
              </View>
              <Text style={styles.contentsLine}>{packageContentsLine(pack.items, t.item)}</Text>
            </View>
          )}
          <View style={styles.foot}>
            {footNote === '' ? null : <Text style={styles.footNote}>{footNote}</Text>}
            <Text style={styles.cta}>{t.cta}</Text>
          </View>
        </View>
      </PressableSurface>
    );
  };

  /* İlk yükte kartların yerini iskelet tutar; başlık yukarıdaki kuralla gerçek kalır. */
  if (list.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          {header}
          <PackagesListSkeleton testID="packages-loading" />
        </View>
      </View>
    );
  }

  if (list.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>{header}</View>
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={list.retry} testID="packages-retry" />}
          testID="packages-error"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} {...pullRefreshColors(theme.colors.olive)} />
        }
        testID="packages-scroll"
      >
        {header}
        {/* Bant başlığın ALTINDA, kartların üstünde (kataloğun yerleşimi): adresin gerçeği bir kez
            okunur, sonra kaydırılıp geçilir. Yalnız çözülmüş VE rota dışı yerde çizilir. */}
        {noticePlace === null ? null : (
          <PlaceNoticeBand
            country={noticePlace.country}
            postalCode={noticePlace.postalCode}
            /* Şehir de hapta yazılır; `null` olabilir ve bant o hâlde yalnız kodu basar. */
            placeName={noticePlace.placeName}
            source="app-packages"
            testID="packages-place-notice"
          />
        )}
        {/* Boş hâl kesikli çerçeveli kutudur; kitin boş durumu o kutunun içinde durur. */}
        {list.packages.length === 0 ? (
          <View style={styles.emptyBox}>
            {/* `fill={false}`, çünkü ortalama kutuyu ekran boyuna şişirirdi. */}
            <EmptyState
              fill={false}
              title={t.empty.title}
              description={t.empty.body}
              action={
                <PrimaryButton
                  label={t.empty.cta}
                  shape="pill"
                  onPress={() => router.push('/catalog')}
                  testID="packages-browse"
                />
              }
              testID="packages-empty"
            />
          </View>
        ) : (
          list.packages.map(card)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
    // Başlıkla ilk kart arasına ayrı durak açılmaz, çünkü başlığın kendi alt nefesi var.
    gap: theme.space['3xl'],
  },
  header: {
    gap: theme.space.xs,
    // Güvenli alanın hemen altına yapışmasın diye üst nefes (siparişler ekranının aynı ölçüsü).
    paddingTop: theme.space['3xl'],
    paddingBottom: theme.space.xs,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    // Satır aralığı oranı da token'dan gelir, ham çarpan yazılmaz.
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },

  /* ── Kart ───────────────────────────────────────────────────────────────── */
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-200'],
    // Tasarımdaki 24 yerine `card` kademesi, çünkü beşinci bir yarıçap durağı açmak seti bozardı.
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    // Tasarımın kendi gölgesi yerine `soft`, çünkü token seti bu rolde tek durak taşır.
    boxShadow: theme.shadow.soft,
  },
  /* Fotoğraf BLOĞU: yüzeyin kendisi değil, onu ve üstündeki bilgi katmanını taşıyan kutu.
     Ölçü burada durur ki solan yüzey ile solmayan rozetler aynı koordinat sistemini paylaşsın. */
  photo: { height: customerMetrics.packageListPhotoHeight },
  photoFill: { position: 'absolute', inset: 0 },
  /* Durum rozeti — kare kartın tükendi rozetiyle aynı geometri ve aynı örtü tonu; köşe kitin
     kendi durum yuvası (sol üst). */
  soldOutBadge: {
    position: 'absolute',
    top: theme.space.xl,
    left: theme.space.xl,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['scrim-72'],
  },
  soldOutLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['badge-sm']),
    textTransform: 'uppercase',
    color: theme.colors['sand-50'],
  },
  priceBadge: {
    position: 'absolute',
    top: theme.space.xl,
    right: theme.space.xl,
  },
  caption: {
    position: 'absolute',
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    bottom: theme.space['2xl'],
  },
  name: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    lineHeight: theme.text['card-title'] * theme.text['h1--line-height'],
    color: theme.colors['on-image'],
  },
  meta: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // Tasarımın .16em'i yerine kitin .18em'i, çünkü fark ekranda ölçülemez.
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-dark'],
  },
  /* Yer notu vurgu tonuyla yazılır, çünkü taşıdığı şey künye değil uyarıdır. */
  placeNote: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.terracotta,
  },
  cardBody: {
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.lg,
  },
  head: { gap: theme.space.xs },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  contents: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  /* İlk halkanın negatif payını telafi eder, yığın soldan hizalı başlar (sipariş kartının yığını). */
  thumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.space.lg,
  },
  more: {
    marginLeft: theme.space.md,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors.body,
  },
  contentsLine: {
    flexShrink: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-200'],
    paddingTop: theme.space.lg,
  },
  footNote: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.body,
  },
  cta: {
    marginLeft: 'auto',
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },

  /** Kesikli çerçeveli boş kutu; içindeki blok kitin `EmptyState`i. */
  emptyBox: {
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
    borderRadius: theme.radius.card,
  },
}));
