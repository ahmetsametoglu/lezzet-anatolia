import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { HomePackage } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@/components/ui/pull-refresh';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { packageStockStatus, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { PhotoSurface } from '@/screens/customer-kit/photo-surface';
import { PlaceNoticeBand } from '@/screens/customer-kit/place-notice-band';
import { emToDp } from '@/theme/parse';
import messages from './messages.json';
import { PackagesListSkeleton } from './packages-list-skeleton';
import { usePackagesList } from './use-packages-list.hook';

/*
  PAKETLER (v3 `vPkgs`) — üçüncü sekmenin ekranı: hazır paketlerin tam listesi. Vitrindeki
  şeritten farkı SÜZGEÇ: orada yalnız işaretli paketler var, burada yayındakilerin tamamı
  (karar uçta — `PackageListSchema` künyesi).

  ── TASARIMIN KARTINDAN BUGÜN ÇİZİLEBİLEN ───────────────────────────────────
  v3'ün kartı fotoğraf bölgesinin ALTINDA beyaz bir gövde taşıyor: kısa açıklama · içerik çipleri
  (paketin kalem adları) · soğuk zincir notu · "Paketi incele ›". İlk ikisi hâlâ sözleşmede YOK ve
  çizilmediler: uydurulacak bir açıklama ya da hayalî bir çip listesi, boş bırakmaktan kötüdür
  (CLAUDE §0 — kanıtsız bilgi basma). Eksik alanlar terfi ihtiyacı olarak raporlandı.

  ── "TÜKENDİ" ROZETİ VE YER NOTU ARTIK VAR (10.08) ──────────────────────────
  Bu künye 10.08'e kadar şöyle diyordu: *"'Tükendi — yakında yeniden' rozeti de yok: paket
  sözleşmesi stok TAŞIMIYOR."* Taşıyor artık (`HomePackageSchema` → `soldOut` · `route`) ve sayfa
  yere kör olmaktan çıktı: rota dışındaki müşteri, o adrese hiç gidemeyecek paketi normal bir kart
  olarak görüyordu. Kart kataloğun ürün kartıyla AYNI dili konuşur (kullanıcı kararı 10.08):
    1. Gidemeyeceğimiz kartın yalnız FOTOĞRAFI solar; rozet ve künye tam opak kalır — yoksa
       solmanın sebebini açıklayan cümle tam da gerektiği anda okunaksızlaşır.
    2. "Bu adrese gönderemiyoruz" ROZET İÇİNDE DEĞİL, künyenin son satırında düz yazı; okunurluk
       alt gradyandan gelir ("her şey rozet içindeymiş gibi görünüyor, hoş olmuyor"). Rengi 11.08'de
       kremden VURGU tonuna geçti (`terracotta`) — gerekçe stil künyesinde.
    3. "Kargoyla gelir" işareti KARTA YAZILMAZ — rota dışında kartların çoğu onu taşırdı ve bilgi
       olmaktan çıkardı; cümlenin genel hâli listenin başındaki bantta.
  Cümleyi kuran yer ekran değil `stockMarkOf` (`lib/places/place-view.ts`); paketin kendi gerçeği
  (`soldOut` + `route`) o sözlüğe `packageStockStatus` ile çevrilir. İkinci bir cümle sözlüğü YOK.

  FOTOĞRAF BÖLGESİ KİTİN YÜZEYİNDEN (`PhotoSurface`): "foto varsa foto, yoksa baş harf" + skrim
  tek kopya durur. `PhotoTile` kullanılMADI çünkü o BASILABİLİR bir karttır ve burada basılabilir
  olan kartın TAMAMIDIR (fotoğraf + beyaz gövde) — iç içe iki basılabilir yüzey doğardı.

  YÜKLEME: iskelet gelecek yerleşimin AYNISI (fotoğraf bloğu + gövde satırı) ve "yükleniyor"
  halkasıyla AYNI ANDA çizilmez (kullanıcı bulgusu 09.08). Aşağı çekerek yenileme ise ekranı
  iskelete DÜŞÜRMEZ: satırlar yerinde kalır, hareketin kendi göstergesi yeter.
*/

type Messages = LocalizedCopy<typeof messages>;

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
  /* YER: kaynak katalog ve vitrinle AYNI (cihazdaki onboarding kaydı) — kod sunucuya gider, depo
     orada çözülür ve kartın `soldOut`/`route` alanları ona göre dolar. Snapshot kök kapı yüzünden
     `undefined` olamaz; yine de `?.` ile okunur (kataloğun aynı gerekçesi). */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const list = usePackagesList(locale, postalCode);
  /* İkinci çözüm YALNIZ "rota içinde miyim" sorusunu cevaplar (depo kimliği istemciye hiç
     verilmez): cümlenin GEÇİCİ mi KALICI mı olduğunu ve bandın çizilip çizilmeyeceğini belirler. */
  const place = usePlaceResolution(postalCode ?? '');
  /* BANT: kataloğunkiyle aynı koşul (çözülmüş + rota dışı) ve aynı komponent. Bu sekmeye alt
     çubuktan DOĞRUDAN gelinebiliyor — katalogdan geçmeyen müşteri, adresinin gerçeğini hiç
     okumadan bir paket listesine bakardı. */
  const noticePlace = place?.kind === 'resolved' && !place.place.inRoute ? place.place : null;

  /* Sayfa başlığı HER DALDA durur (siparişler ekranının kuralı): yüklenirken, hata anında ve boş
     listede de kullanıcı hangi sayfada olduğunu görür. */
  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
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
    return (
      <PressableSurface
        key={pack.slug}
        onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
        feedback="scale"
        style={styles.card}
        /* Ekran okuyucu gören müşteriyle AYNI bilgiyi almalı: durum ve yer notu ada eklenir. */
        accessibilityLabel={[t.open.replace('{name}', pack.name), pack.soldOut ? t.card.soldOut : undefined, note]
          .filter((part) => part !== undefined)
          .join(' · ')}
        testID={`packages-card-${pack.slug}`}
      >
        {/* SOLAN GRUP yalnız fotoğraf ve gradyanı; rozet/künye onun KARDEŞİ ve tam opak
            (`ProductPhotoCard`ın 10.08 düzeltmesi birebir). Konumlar değişmedi: yüzey zaten
            bloğun tamamını kaplıyor. */}
        <View style={styles.photo}>
          <PhotoSurface
            photoUri={pack.image.url}
            initial={pack.name.slice(0, 1)}
            scrim
            style={[styles.photoFill, faded ? styles.fadedPhoto : undefined]}
          />
          {/* Durum rozeti SOL ÜSTTE — kitin kendi ayrımı (sol üst durum, sağ üst fiyat). */}
          {pack.soldOut ? (
            <View style={styles.soldOutBadge}>
              <Text style={styles.soldOutLabel}>{t.card.soldOut}</Text>
            </View>
          ) : null}
          {/* Fiyat rozeti SAĞ ÜSTTE (v3:878) — vitrin şeridinde sol altta; ikisi ayrı kart. */}
          <View style={styles.priceBadge}>
            <Tag label={formatPrice(pack.priceCents, locale)} rotate={3} shadow />
          </View>
          <View style={styles.caption}>
            <Text style={styles.name}>{pack.name}</Text>
            <Text style={styles.meta}>{t.meta.replace('{n}', String(pack.itemCount))}</Text>
            {/* YER NOTU zeminsiz, künyenin son satırı — gradyanın en koyu yerinde. İki satıra
                kadar sarar: cümle üç dilde farklı uzunlukta. */}
            {note === undefined ? null : (
              <Text style={styles.placeNote} numberOfLines={2} testID={`packages-place-note-${pack.slug}`}>
                {note}
              </Text>
            )}
          </View>
        </View>
        {/* Gövde bugün YALNIZ eylemi taşıyor; tasarımın kesikli ayracı da onunla birlikte gelecek —
            ayıracak bir şey yokken çizilen bir ayraç, olmayan bir içeriğin sözünü verirdi. */}
        <View style={styles.cardBody}>
          <Text style={styles.cta}>{t.cta}</Text>
        </View>
      </PressableSurface>
    );
  };

  /* İLK YÜK: başlık GERÇEK kalır (yukarıdaki kural), kartların yerini skeleton tutar. Blok
     ekrandan `packages-list-skeleton`a taşındı — gövde satırı burada daire çapı ve yazı boyuyla
     çiziliyordu, ikisi de o rol için ölçülmemiş değerlerdi (o dosyanın künyesi). */
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
            /* Şehir de hapta yazılır (kullanıcı isteği 11.08); `null` olabilir, bant o hâlde
               yalnız kodu basar. Katalogla AYNI çağrı — iki liste tek bandı besliyor. */
            placeName={noticePlace.placeName}
            source="app-packages"
            testID="packages-place-notice"
          />
        )}
        {/* Boş hâl KESİKLİ ÇERÇEVELİ kutu (v3:866) — kitin boş durumu o kutunun içinde durur. */}
        {list.packages.length === 0 ? (
          <View style={styles.emptyBox}>
            <EmptyState
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
    // v3:872 kartlar arası 16; başlıkla ilk kart arasındaki 12 farkı ölçekte ayrı bir durak
    // gerektirmiyor — başlığın kendi alt nefesi zaten var.
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
    // v3:862 satır aralığı 1.15 — oran da token (`h1--line-height`), ham çarpan yazılmadı.
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
    // v3 köşeyi 24 çiziyor; resmî yarıçap seti (Token Kararlari #7) kartı `card` (20) kademesine
    // bağlıyor — beşinci bir durak açmak seti bozardı (`BottomSheet`in aynı hükmü).
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    // v3 gölgesi `0 4px 18px rgba(58,65,71,.07)`; token seti bu rolde tek durak taşıyor (`soft`).
    boxShadow: theme.shadow.soft,
  },
  /* Fotoğraf BLOĞU: yüzeyin kendisi değil, onu ve üstündeki bilgi katmanını taşıyan kutu.
     Ölçü burada durur ki solan yüzey ile solmayan rozetler aynı koordinat sistemini paylaşsın. */
  photo: { height: customerMetrics.packageListPhotoHeight },
  photoFill: { position: 'absolute', inset: 0 },
  /* Solma durağı kare ürün kartıyla AYNI (`soldOutOpacity`): iki kart aynı şeyi söylemeli. */
  fadedPhoto: { opacity: theme.soldOutOpacity },
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
    gap: theme.space['2xs'],
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
    // v3:882 .16em; kitin üstbaşlık aralığı .18em — fark ekranda ölçülemez, token kazanır.
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-light'],
  },
  /* YER NOTU — künye ailesinin içinde, kare ürün kartıyla AYNI karar: zemin/kenarlık YOK
     (okunurluk gradyandan gelir).

     RENK VURGU TONU (kullanıcı kararı 11.08): `on-image` krem, adın ve altyazının rengiydi — not
     onların arasında ÜÇÜNCÜ bir künye satırı gibi okunuyordu, oysa taşıdığı şey künye değil bir
     UYARI. Vurgu ailesi (`terracotta`) markanın kendi aksanı ve bu sayfada zaten konuşuyor
     (üstbaşlık, fiyat çipi) — yeni bir görsel dil üretilmedi.
     Okunurluk bakımından da krem'den güvenli: kart gönderilemez hâlde SOLUYOR (`fadedPhoto`) ve
     solan şey fotoğrafla birlikte onun karartma gradyanıdır — açık bir fotoğrafın üstünde krem
     yazı zemine karışıyordu (kare kartın 10.08 künyesindeki `on-image` ↔ `sand-50` ölçümü).
     Terracotta orta tonlu: hem açılmış hem koyu kalmış zeminde ayrışıyor. */
  placeNote: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.terracotta,
  },
  cardBody: {
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    alignItems: 'flex-end',
  },
  cta: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },

  /** v3:866 — kesikli çerçeveli boş kutu; içindeki blok kitin `EmptyState`i. */
  emptyBox: {
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
    borderRadius: theme.radius.card,
  },
}));
