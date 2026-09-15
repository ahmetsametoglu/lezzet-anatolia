import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { CATALOG_SORTS, type CatalogProduct, type CatalogSort } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import type { IconName } from '@lezzet/design-tokens/icons';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { ProductPhotoCard } from '@/components/ui/product-photo-card';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
// Kampanya, fiyat etiketi ve yer notu kurucuları web telefon görünümüyle ortak.
import { campaignValueOf, cardBadgeOf, cardPlaceNoteOf, productPriceLabel } from '@lezzet/helper';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { placeModeOf, shippableChipVisible, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { PlaceNoticeBand } from '@/screens/customer-kit/place-notice-band';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { CatalogSkeleton } from './catalog-skeleton';
import { useCatalog } from './use-catalog.hook';
import messages from '@lezzet/i18n/customer/catalog';

/*
  Katalog: arama, süzgeç, kategori rayı, iki sütun kare kart ızgarası ve keyset sonsuz kaydırma. Süzgeç sayfası yalnız
  sıralamadır, seçim anında uygulanır; "adresime gönderilebilir" süzgeci bölge dışı bandının içinde durur.
*/

/**
 * Sıralama ikonları kitin setinden; iki fiyat satırı para ikonunu paylaşır, yönü etiket söyler. `featured` ikonsuz, çünkü sette
 * "önerilen"i anlatan çizim yok; ikon yuvası yine ayrılır ki etiketler aynı hizadan başlasın.
 */
const SORT_ICONS: Partial<Record<CatalogSort, IconName>> = {
  priceAsc: 'money',
  priceDesc: 'money',
};

type Messages = LocalizedCopy<typeof messages>;

interface CatalogScreenProps {
  /** Vitrin bandından iletilen kategori slug'ı; `null` = istek yok. Yalnız bir seçim iletir ve uygulanınca rotadan silinir. */
  requestedCategory?: string | null;
  /** Vitrin bandından iletilen koleksiyon slug'ı; kategoriyle aynı kurallar. */
  requestedCollection?: string | null;
}

export function CatalogScreen({ requestedCategory = null, requestedCollection = null }: CatalogScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* Katalog vitrinle aynı posta kodunu gönderir, çünkü fiyat, teklif ve stok depoya göre değişir; kaynak cihazdaki onboarding
     kaydı. Kök kapı kayıt okunmadan ağacı çizmez, `?.` yine de kapının kararını bu ekranın varsayımı yapmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const catalog = useCatalog(locale, postalCode);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  /* Yerin çözümü kartın cümlesini ve süzgeç satırını belirler; stok hâli sunucunun cevabından gelir, bu çözüm yalnız "rota
     içinde miyim" sorusunu cevaplar. Aşağı çekme kapsamı da tazeler, çünkü soğuk zincir ürünlerinin gösterilmesi ona bağlı. */
  const placeLookup = usePlaceLookup(postalCode ?? '');
  const place = placeLookup.place;
  const placeMode = placeModeOf(place);
  const chipVisible = shippableChipVisible(placeMode);
  /* Bandın yeri süzgeçle aynı koşuldan (çözülmüş, rota dışı) türer; bant talebi ülke ve posta koduyla kaydettiği için nesne
     burada daraltılır. */
  const noticePlace = place?.kind === 'resolved' && !place.place.inRoute ? place.place : null;

  /* Süzgeç satırı kaybolunca süzgeç de kapanır: görünmeyen bir süzgeç listeyi sessizce daraltırdı. Web aynı korumayı sunucuda
     yapıyor (`shippableFilterApplies`). */
  const { onlyShippable, setOnlyShippable } = catalog;
  useEffect(() => {
    if (!chipVisible && onlyShippable) setOnlyShippable(false);
  }, [chipVisible, onlyShippable, setOnlyShippable]);

  /* Banttan gelen istek etkiyle uygulanır ve uygulanınca rotadan silinir: sekme mount kaldığı için aynı değer ikinci kez
     gelince etki koşmazdı, silmek bir sonraki basışı `null → değer` geçişi yapar. `setParams` yığına sayfa eklemez, geri tuşu
     etkilenmez. */
  const { selectCategory, selectCollection } = catalog;
  useEffect(() => {
    // Bağımlılık bilerek yalnız istek: `selectCategory` her render'da tazelenir ve ona bağlanmak müşterinin seçimini bantla ezerdi.
    if (requestedCategory === null) return;
    selectCategory(requestedCategory);
    router.setParams({ category: undefined });
  }, [requestedCategory]);

  /* Koleksiyon ayrı etkide: bir bandın türü ya kategori ya koleksiyondur, birleşik etki ötekini boşuna yeniden uygulardı. */
  useEffect(() => {
    if (requestedCollection === null) return;
    selectCollection(requestedCollection);
    router.setParams({ collection: undefined });
  }, [requestedCollection]);

  const cart = useCart();
  const fabCount = cartCount(cart);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  /** Sözleşme satırı → kart props'u. Fiyatı olmayan ürünün fiyat çipi çizilmez: yer tutucu tutar "bedava" ya da "bilinmiyor" derdi. */
  const cardOf = (product: CatalogProduct) => {
    /* Kart yer işaretini taşır ki rota dışı müşteri neyin gelmeyeceğini detaya girmeden görsün; cümleyi `stockMarkOf` kurar. */
    const stockMark = stockMarkOf(product.stockStatus, place, locale);
    /* "Kargoyla gelir" karta yazılmaz, her kartta yazan bilgi bilgi olmaktan çıkar; cümlesi listenin başındaki bantta. Kartta
       yalnız gönderemediğimiz ya da bölgede olmayan ürünün notu kalır. */
    const { note: placeNote, dimmed } = cardPlaceNoteOf(stockMark);
    return {
      name: product.name,
      image: product.image,
      priceLabel: productPriceLabel(product.priceCents, locale),
      soldOut: product.soldOut,
      soldOutLabel: t.card.soldOut,
      /* Rozet yalnız fırsat: kapsam kampanyası her karta basılsa sepette bir kez inen indirim ürün başına vaat gibi okunurdu. */
      discountLabel: cardBadgeOf(product, { offer: t.card.offer }),
      placeNote,
      /* Solma yalnız kapalı kapıda: kargoyla ya da stok girince gelebilen ürünü soldurmak müşteriyi olmayan bir kapıdan çevirirdi. */
      dimmed,
      /* Çeşit satırı yalnız çok boylu üründe; sayı sözleşmeden, cümle dile göre cihazda kurulur. "1 seçenek" yazılmaz, olmayan
         bir seçim varmış izlenimi verirdi. */
      optionsLabel: product.variantCount > 1 ? t.card.options.replace('{n}', String(product.variantCount)) : undefined,
    };
  };

  /* Değer parçasını vitrin bandıyla aynı kurucu (`campaignValueOf`) verir, aynı kampanya iki ekranda aynı sayıyla anılır. */
  const campaignValue = catalog.campaign === null ? null : campaignValueOf(catalog.campaign, t.campaign, locale);
  const campaignNote =
    campaignValue === null || catalog.campaign === null
      ? null
      : catalog.campaign.label === null
        ? t.campaign.anon.replace('{value}', campaignValue)
        : t.campaign.named.replace('{label}', catalog.campaign.label).replace('{value}', campaignValue);

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        {/* Arama kutusu kitin `TextField`i değil: onun etiket, yardımcı satır ve hata yuvaları burada yok, gereken öndeki ikon ise
            onda yok. */}
        <View style={styles.searchBox}>
          <Icon name="search" size={theme.size.inlineIcon} color={theme.colors.muted} />
          <TextInput
            value={catalog.searchText}
            onChangeText={catalog.search}
            placeholder={t.search.placeholder}
            placeholderTextColor={theme.colors.muted}
            // Yer tutucu ekran okuyucu için ad değildir, yazmaya başlayınca kaybolur.
            accessibilityLabel={t.search.label}
            returnKeyType="search"
            style={styles.searchInput}
            testID="catalog-search"
          />
          {/* Temizle yalnız yazı varken çizilir; `compact` kitin dokunma payını getirir, 16 px'lik çarpı parmakla ıskalanırdı. */}
          {catalog.searchText.length === 0 ? null : (
            <PressableSurface
              onPress={() => catalog.search('')}
              feedback="scale-small"
              compact
              accessibilityLabel={t.search.clear}
              testID="catalog-search-clear"
            >
              <Icon name="close" size={theme.size.inlineIcon} color={theme.colors.muted} />
            </PressableSurface>
          )}
        </View>
        <PressableSurface
          onPress={() => setSortSheetOpen(true)}
          feedback="scale-small"
          style={[styles.filterButton, catalog.filtersActive ? styles.filterActive : undefined]}
          accessibilityLabel={t.filter.label}
          testID="catalog-filter"
        >
          <Icon
            name="filter"
            size={theme.size.inlineIcon}
            color={catalog.filtersActive ? theme.colors['olive-dark'] : theme.colors.ink}
          />
        </PressableSurface>
      </View>
      {/* Koleksiyon bandı sunucunun `activeCollection`ı doluyken çizilir, ayrı görünürlük bayrağı yok. Koleksiyon açıkken kategori
          rayı gizlenir, çünkü süzgeç kategori havuzunu da daraltır ve rayda yalnız "Tümü" kalırdı. */}
      {catalog.activeCollection === null ? null : (
        <View style={styles.collectionBand} testID="catalog-collection-band">
          <View style={styles.collectionText}>
            <Text style={styles.collectionEyebrow}>{upperIn(t.collection.eyebrow, locale)}</Text>
            <Text style={styles.collectionName} numberOfLines={1}>
              {catalog.activeCollection.name}
            </Text>
          </View>
          {/* Çarpı `headerIcon` ölçüsünde ve eylem rengi `terracotta`da: burada yapılan iş bir geri alma ve basılabildiği görünmeli. */}
          <PressableSurface
            onPress={() => catalog.selectCollection(null)}
            feedback="scale-small"
            compact
            accessibilityLabel={t.collection.clear}
            testID="catalog-collection-clear"
          >
            <Icon name="close" size={theme.size.headerIcon} color={theme.colors.terracotta} bold />
          </PressableSurface>
        </View>
      )}
      {/* `keyboardShouldPersistTaps`: klavye açıkken çipe dokunmak yoksa yalnız klavyeyi kapatır, süzgeç değişmezdi. */}
      {catalog.activeCollection !== null ? null : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRail}
        keyboardShouldPersistTaps="handled"
        testID="catalog-chips"
      >
        {/* "Tümü" bir kategori değil, süzgecin yokluğudur; listenin başında ve hep var. */}
        <Chip label={t.all} selected={catalog.activeCategory === null} onPress={() => catalog.selectCategory(null)} />
        {catalog.categories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            selected={catalog.activeCategory === category.slug}
            onPress={() => catalog.selectCategory(category.slug)}
          />
        ))}
      </ScrollView>
      )}

      {/* Kampanya cümlesi müşteriye kampanyayı sepete gelmeden söyler. Fiyat vaadi değil, "sepette uygulanır" der: motor kazananı
          bütün sepet üzerinden seçer, kart fiyatı değişmez. */}
      {campaignNote === null ? null : (
        <View style={styles.campaignNote} testID="catalog-campaign">
          <Text style={styles.campaignText}>{campaignNote}</Text>
        </View>
      )}
    </View>
  );

  /** Sıralama sayfası: seçim anında uygulanır ve sayfa kapanır, ayrı bir "Göster" düğmesi yok. */
  const sortSheet = (
    <BottomSheet
      visible={sortSheetOpen}
      title={t.filter.title}
      onClose={() => setSortSheetOpen(false)}
      testID="catalog-sort-sheet"
    >
      <View style={styles.sortList}>
        {/* Seçenekler şemadan (`CATALOG_SORTS`) türer: uca eklenen sıralama listede kendiliğinden görünür. */}
        {CATALOG_SORTS.map((option: CatalogSort) => {
          const selected = catalog.sort === option;
          const icon = SORT_ICONS[option];
          return (
            <PressableSurface
              key={option}
              onPress={() => {
                catalog.selectSort(option);
                setSortSheetOpen(false);
              }}
              feedback="scale"
              style={[styles.sortRow, selected ? styles.sortRowSelected : styles.sortRowIdle]}
              accessibilityLabel={t.sort[option]}
              selected={selected}
              testID={`catalog-sort-${option}`}
            >
              <View style={styles.sortRowMain}>
                {/* İkon yuvası HER satırda ayrılır (ikonsuz seçenekte boş kalır) ki üç etiket aynı
                    hizadan başlasın; ikonun kendisi sessizdir, satırın adını etiket taşıyor. */}
                <View style={styles.sortIconSlot}>
                  {icon === undefined ? null : <Icon name={icon} size={theme.size.inlineIcon} color={theme.colors.ink} />}
                </View>
                <Text style={styles.sortLabel}>{t.sort[option]}</Text>
              </View>
              {/* İşaret yalnız GÖRSEL: seçili olma bilgisi ekran okuyucuya `selected` ile gidiyor. */}
              {selected ? <Text style={styles.sortCheck}>✓</Text> : null}
            </PressableSurface>
          );
        })}
      </View>
      {/* Yer süzgeci bu sayfada değil, bölge dışı bandının içinde: bant görünürken anahtar da görünür, kapalı sayfada açık kalıp
          listeyi sessizce kısamaz. */}
    </BottomSheet>
  );

  const listFooter = () => {
    if (catalog.loadingMore) {
      return (
        <View style={styles.footer}>
          <LoadingState size="sm" label={t.loading} accessibilityLabel={t.loading} />
        </View>
      );
    }
    if (catalog.tailFailed) {
      // Kuyruk düştü: liste yerinde kalır; sessizce bitmiş gibi göstermek kuyruğu yutmak olurdu.
      return (
        <View style={styles.footer}>
          <PrimaryButton label={t.error.retry} shape="pill" onPress={catalog.loadMore} testID="catalog-tail-retry" />
        </View>
      );
    }
    if (!catalog.hasMore && catalog.products.length > 0) {
      return <Text style={styles.listEnd}>{t.listEnd}</Text>;
    }
    return null;
  };

  const body = () => {
    /* İlk yükün göstergesi iskelettir, kuyruğunki alttaki halka; burada liste çizilmediği için ikisi birlikte görünmez. */
    if (catalog.status === 'loading') return <CatalogSkeleton loadingLabel={t.loading} testID="catalog-skeleton" />;

    if (catalog.status === 'error') {
      return (
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={catalog.retry} testID="catalog-retry" />}
          testID="catalog-error"
        />
      );
    }

    return (
      <FlatList
        data={catalog.products}
        keyExtractor={(product) => product.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          // Kartın genişliği SÜTUNDAN gelir (kare oranı kartın kendisinden) — bu yüzden hücre sarmalayıcı.
          <View style={styles.cell}>
            <ProductPhotoCard {...cardOf(item)} onPress={() => openProduct(item.slug)} testID={`product-${item.slug}`} />
          </View>
        )}
        /* Bilgi bandı listenin başında, yapışkan başlıkta değil: bir kez okunur ve kaydırılıp geçilir, başlıkta her kaydırmada
           ekrandan bir dilim yerdi. */
        ListHeaderComponent={
          noticePlace === null ? null : (
            <PlaceNoticeBand
              country={noticePlace.country}
              postalCode={noticePlace.postalCode}
              /* Şehir çözümden gelir; `null` ise bant yalnız kodu basar. */
              placeName={noticePlace.placeName}
              source="app-catalog"
              /* Koşulu ayrıca yazılmaz: bant zaten `chipVisible` ile aynı hâlde (çözülmüş, rota dışı) çiziliyor. */
              shippableFilter={{ value: catalog.onlyShippable, onChange: catalog.setOnlyShippable }}
              testID="catalog-place-notice"
            />
          )
        }
        onEndReached={catalog.loadMore}
        /* Ekranın yarısı kala istenir: kart yüksekliği ekranın yaklaşık yarısı kadar, yani bir
           satır önceden. Daha küçük bir eşik, hızlı kaydırmada listenin sonunda boşluk bırakırdı. */
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={catalog.refreshing}
            onRefresh={() => {
              catalog.refresh();
              placeLookup.refresh();
            }}
            // Yenileme halkası da temadan; iki platformun iki ayrı propu tek yerden (`pull-refresh`).
            {...pullRefreshColors(theme.colors.olive)}
          />
        }
        ListEmptyComponent={
          /* `fill={false}`: burası sayfanın gövdesi DEĞİL, listenin boş hâli — üstünde arama
             çubuğu ve süzgeç şeridi duruyor. `flex: 1` liste kabını bozardı (bileşenin künyesi). */
          <EmptyState
            fill={false}
            icon={<Icon name="search-empty" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
            title={t.empty.title}
            description={t.empty.body}
            /* Düğme yalnız süzgeç varken: süzgeçsiz boş katalogda aynı boş listeye götürürdü. Arama metni ve yer anahtarı da
               süzgeçtir, düğme onları da temizler. */
            action={
              catalog.activeCategory === null && catalog.searchText === '' && !catalog.onlyShippable ? undefined : (
                <PrimaryButton
                  label={t.empty.cta}
                  shape="pill"
                  onPress={() => {
                    catalog.search('');
                    catalog.selectCategory(null);
                    catalog.setOnlyShippable(false);
                  }}
                  testID="catalog-clear-filter"
                />
              )
            }
            testID="catalog-empty"
          />
        }
        ListFooterComponent={listFooter()}
        testID="catalog-list"
      />
    );
  };

  return (
    <View style={styles.screen}>
      {header}
      {body()}
      {sortSheet}
      {/* Sepet FAB'ı sepette ürün varken görünür, boşken kendini çizmez; yuvası vitrindekiyle aynı. */}
      <View style={styles.fabSlot} pointerEvents="box-none">
        <CartFab
          count={fabCount}
          onPress={() => router.push('/cart')}
          accessibilityLabel={t.cart.open.replace('{n}', String(fabCount))}
          testID="catalog-cart-fab"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  /** Sepet FAB yuvası vitrindekiyle aynı konumda. */
  fabSlot: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: theme.space['5xl'],
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    // Üst güvenli alan ekranın kendisinde: başlık durum çubuğunun altında başlar.
    paddingTop: rt.insets.top,
  },
  header: {
    // Yatay dolgu çocuklarda: ray kenardan kenara kaymalı.
    paddingTop: theme.space.md,
    paddingBottom: theme.space.lg,
    gap: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors.ink,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['3xl'],
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.control,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.font.body[400],
    // `body-sm`: `button` sayıca tasarıma daha yakın ama düğme kademesidir, girdi metni için değil.
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  filterButton: {
    width: theme.size.controlSm,
    height: theme.size.controlSm,
    // Tam daire yarıçapı çaptan türetilir, sette daire yarıçapı yok.
    borderRadius: theme.size.controlSm / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.ink,
  },
  /* Süzgeç etkinken dolu: rayda görünmeyen bir süzgecin var olduğunu söyleyen tek işaret bu; boştaki hâl zeminsiz. */
  filterActive: { backgroundColor: theme.colors['sand-150'] },
  /* Kampanya cümlesi zeytin zeminde: bu bir kazanç bilgisi, uyarı değil. */
  campaignNote: {
    marginHorizontal: theme.space['4xl'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space['2xl'],
    paddingVertical: theme.space.lg,
  },
  campaignText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
  },
  /* Koleksiyon bandı kapsız, yalnız metin: altındaki ızgara kartlardan oluşur ve kutu onunla yarışırdı; bölümü başlığın alt
     çizgisi kapatır. */
  collectionBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
  },
  /* Metin bloğu esner, çarpı sabit kalır; aralık `2xs`, çünkü ad açık satır yüksekliğiyle kendi payını zaten bırakır. */
  collectionText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  collectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // Aralık token'da `em` (yazı boyuna göreli); RN mutlak dp ister — çeviri tek yerde (`emToDp`).
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    /* Terracotta: etkin süzgeç ve onu kaldıran çarpı aynı şeyin parçası, aynı vurgu renginde. */
    color: theme.colors.terracotta,
  },
  /* Ad vitrindeki koleksiyon bandının başlığıyla aynı kademede: müşteri az önce o banda bastı, ad aynı sesle karşılar. */
  collectionName: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    /* Açık satır yüksekliği vitrindeki bant başlığının formülü; verilmezse Lora'nın doğal satır kutusu üstbaşlıkla arayı açar. */
    lineHeight: theme.text['h2-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  chipRail: {
    flexDirection: 'row',
    gap: theme.space.md,
    paddingHorizontal: theme.space['4xl'],
  },
  sortList: {
    gap: theme.space.md,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Tasarımın 13'ü ölçekte ara değer, bir üst durağa yuvarlandı.
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    // Kontrol kademesinin köşesi; tasarımın 14'ü sette yok.
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  sortRowSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  // Seçili olmayan satır zeminsiz, yalnız çerçeveli.
  sortRowIdle: {
    borderColor: theme.colors['sand-400'],
  },
  /* Satırın SOL yarısı: ikon yuvası + etiket. Ayrı bir sarmalayıcı gerekiyor çünkü satırın kendisi
     `space-between` ile ikiye ayrılıyor (sol blok ↔ sağdaki onay işareti). */
  sortRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  /* Sabit genişlik: ikonsuz seçenekte de yer tutar, üç etiket aynı hizadan başlar. */
  sortIconSlot: {
    width: theme.size.inlineIcon,
    alignItems: 'center',
  },
  sortLabel: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  sortCheck: {
    fontFamily: theme.font.body[theme.text['step-sm--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors['olive-dark'],
  },
  grid: {
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.xl,
    gap: theme.space['5xl'],
  },
  row: {
    gap: theme.space['2xl'],
  },
  cell: {
    flex: 1,
  },
  footer: {
    paddingVertical: theme.space['2xl'],
    alignItems: 'center',
  },
  listEnd: {
    fontFamily: theme.font.body[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },
}));
