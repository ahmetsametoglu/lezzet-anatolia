import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { CATALOG_SORTS, type CatalogProduct, type CatalogSort } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProductPhotoCard } from '@/components/ui/product-photo-card';
// Fiyat yazımı paylaşılan tek kaynaktan (terfi 21.7) — RN'de para biçimi yeniden yazılmaz (02-mimari §3.4).
import { formatPrice } from '@lezzet/helper';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { cartCount, useCart } from '@/screens/customer-kit/cart-store';
import { CatalogSkeleton } from './catalog-skeleton';
import { useCatalog } from './use-catalog.hook';
import messages from './messages.json';

/*
  KATALOG EKRANI (v3 `vCatalog`) — arama + süzgeç + kategori rayı + iki sütun kare kart ızgarası +
  keyset sonsuz kaydırma. Uygulamanın ilk gerçek ekranı.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli, gerekçeli) ──────────────────────────
  1. **Yapışkanlık kaydırma alanının DIŞINDA.** RN'de `position: sticky` yok; şablonun `sticky top:0`
     davranışının karşılığı, başlığın listenin üstünde sabit dururken listenin altından akmasıdır.
     Görsel sonuç aynı: arama ve ray her zaman görünür.
  2. **Hata bloğunun KESİKLİ ÇERÇEVESİ çizilmedi.** Şablon kesikli kum çerçeveli bir kutu kullanıyor;
     o kalıp envanterde ayrı bir komponent adayı (`DashedInvite`, §2) ve henüz kurulmadı. `EmptyState`
     kendi dolgusunu taşıdığı için çerçeve içine alınınca şablonun 28 px'lik nefesi 70'e çıkıyordu.
  3. **"Tekrar dene" düğmesi zeytin.** Şablonda mürekkep zeminli; kitte mürekkep dolgulu düğme YOK
     (birincil zeytin, ikincil çerçeveli) ve tek ekran için üçüncü bir düğme tonu açmak kitin
     sözlüğünü büyütürdü.
  4. **Kuyruk (sonraki sayfa) durumları şablonda HİÇ YOK** (envanter §5: "sonsuz kaydırma göstergesi
     yok"). Şablonun kendi diliyle kuruldu: yüklenirken iskelet bloğundaki halka + "Yükleniyor…",
     bittiğinde "— hepsi bu kadar —" satırı, düşerse aynı satırda tekrar-dene.
  5. **Süzgeç sayfasının "Sadece indirimliler" anahtarı ve iki alt düğmesi YOK.** Anahtar
     SÖZLEŞMEDE yok: `/api/v1/products` yalnız `locale · q · category · sort · cursor · limit`
     kabul ediyor (`ProductQuerySchema`) — istemcide süzmek listenin sayfalı olduğu gerçeğiyle
     çelişirdi (bir sayfada üç indirimli varsa müşteri "üç ürün var" sanır). Anahtar düşünce alt
     düğmeler de anlamını yitirdi: "Temizle" ilk satırı seçmekle, "Göster" seçim yapmakla aynı şey
     — ekranda zaten duran iki şeyin ikinci kopyası olurlardı. Sıralama seçilir seçilmez uygulanır.
*/

type Messages = LocalizedCopy<typeof messages>;

interface CatalogScreenProps {
  /**
   * Vitrin bandından iletilen kategori SLUG'ı (21.14b); `null` = istek yok. Süzgecin SAHİBİ
   * değildir — yalnız bir seçim iletir: değer (yeniden) geldiğinde çip seçilir, müşteri sonra
   * elle değiştirebilir. Aynı değerle tekrar gelmek no-op (`selectCategory` kendi kapısında).
   */
  requestedCategory?: string | null;
}

export function CatalogScreen({ requestedCategory = null }: CatalogScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const catalog = useCatalog(locale);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  /* Banttan gelen seçim etkiyle uygulanır: sekme MOUNT KALIR (navigatör tembel), yani ikinci
     banda basışta yeni bir mount olmaz — parametreyi ancak bir etki izleyebilir. İlk yük "Tümü"
     ile başlayıp hemen kategoriye geçebilir (tek fazladan istek, yalnız sekme hiç açılmamışken);
     eskimiş cevabı hook'un `generation` koruması düşürür. */
  const { selectCategory } = catalog;
  useEffect(() => {
    // Bağımlılık BİLEREK yalnız istek: `selectCategory` her render'da tazelenir, ona bağlanmak
    // etkiyi her çizimde koşturur ve müşterinin elle seçimini bantla ezerdi.
    if (requestedCategory !== null) selectCategory(requestedCategory);
  }, [requestedCategory]);

  const cart = useCart();
  const fabCount = cartCount(cart);

  const openProduct = (slug: string) => router.push({ pathname: '/product/[slug]', params: { slug } });

  /**
   * Sözleşme satırı → kart props'u. TEK YERDE: sözleşme büyüdüğünde değişecek nokta burasıdır.
   *
   * Fiyat CİHAZDA biçimlenir (`priceCents` ham cent) — `priceCents === null` "bu kanalda fiyatı
   * yok → satışa kapalı" demek ve o zaman fiyat çipi HİÇ ÇİZİLMEZ (webin aynı kararı,
   * `components/customer/ui/price.tsx`). Yer tutucu bir tutar yazılmaz: "0,00 €" bedava,
   * "—" ise "bilinmiyor" derdi; ikisi de yanlış (CLAUDE §1).
   *
   * İNDİRİM rozeti tükendide çıkmaz — `ProductPhotoCard` tükendiyi zaten öne alıyor; burada da
   * elenmesi, tükenmiş bir ürünün "fırsat" diye okunmasını iki katmanda birden kapatır.
   */
  const cardOf = (product: CatalogProduct) => ({
    name: product.name,
    photoUri: product.image.url,
    priceLabel: product.priceCents === null ? undefined : formatPrice(product.priceCents, locale),
    soldOut: product.soldOut,
    soldOutLabel: t.card.soldOut,
    discountLabel: product.wasCents === undefined ? undefined : t.card.offer,
    /* Çeşit satırı yalnız ÇOK boylu üründe (şablon: `p.vs.length>1 ? p.vs.length+' seçenek' : null`).
       Sayı sözleşmeden (`variantCount`), CÜMLE cihazdan: "N seçenek" bir i18n şablonudur ve dile
       göre çekim alır — API biçimli metin göndermez. "1 seçenek" yazılmaz: olmayan bir seçim
       varmış izlenimi verirdi. */
    optionsLabel: product.variantCount > 1 ? t.card.options.replace('{n}', String(product.variantCount)) : undefined,
  });

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        {/* Arama kutusu KİTTEKİ `TextField` DEĞİL: o alanın (etiket · yardımcı satır · hata ·
            son yuva) hiçbiri buraya girmiyor, giren tek şey ise onda yok — BAŞTA duran ikon.
            `TextField`e "önde ikon" eklemek, o alanı tek bir çağıran için genişletmek olurdu. */}
        <View style={styles.searchBox}>
          <Icon name="search" size={theme.size.inlineIcon} color={theme.colors.muted} />
          <TextInput
            value={catalog.searchText}
            onChangeText={catalog.search}
            placeholder={t.search.placeholder}
            placeholderTextColor={theme.colors.muted}
            // Yer tutucu ekran okuyucu için AD DEĞİLDİR (yazmaya başlayınca kaybolur).
            accessibilityLabel={t.search.label}
            returnKeyType="search"
            style={styles.searchInput}
            testID="catalog-search"
          />
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail} testID="catalog-chips">
        {/* "Tümü" bir kategori DEĞİL, süzgecin yokluğudur — listenin başında ve her zaman var. */}
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
    </View>
  );

  /** Sıralama sayfası — seçim ANINDA uygulanır ve sayfa kapanır (bkz. sapma 5). */
  const sortSheet = (
    <BottomSheet
      visible={sortSheetOpen}
      title={t.filter.title}
      onClose={() => setSortSheetOpen(false)}
      testID="catalog-sort-sheet"
    >
      <View style={styles.sortList}>
        {/* Seçenekler ŞEMADAN türer (`CATALOG_SORTS`), elle yazılmaz: uca bir sıralama eklenip
            listeye eklenmediğinde o seçenek sessizce görünmezdi (CLAUDE §1). */}
        {CATALOG_SORTS.map((option: CatalogSort) => {
          const selected = catalog.sort === option;
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
              <Text style={styles.sortLabel}>{t.sort[option]}</Text>
              {/* İşaret yalnız GÖRSEL: seçili olma bilgisi ekran okuyucuya `selected` ile gidiyor. */}
              {selected ? <Text style={styles.sortCheck}>✓</Text> : null}
            </PressableSurface>
          );
        })}
      </View>
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
      // Kuyruk düştü: liste yerinde kalır, devamı gelmedi. Sessizce bitmiş gibi göstermek
      // listenin kuyruğunu yutmak olurdu (CLAUDE §1).
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
        onEndReached={catalog.loadMore}
        /* Ekranın yarısı kala istenir: kart yüksekliği ekranın yaklaşık yarısı kadar, yani bir
           satır önceden. Daha küçük bir eşik, hızlı kaydırmada listenin sonunda boşluk bırakırdı. */
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={catalog.refreshing}
            onRefresh={catalog.refresh}
            // Yenileme halkası da temadan (iOS tek renk, Android renk dizisi ister).
            tintColor={theme.colors.olive}
            colors={[theme.colors.olive]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Icon name="search-empty" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
            title={t.empty.title}
            description={t.empty.body}
            /* CTA yalnız SÜZGEÇ VARKEN: süzgeçsiz boş katalogda "tüm katalog" düğmesi aynı boş
               listeye götürürdü. Arama metni de bir süzgeçtir — onu temizlemek de aynı düğme. */
            action={
              catalog.activeCategory === null && catalog.searchText === '' ? undefined : (
                <PrimaryButton
                  label={t.empty.cta}
                  shape="pill"
                  onPress={() => {
                    catalog.search('');
                    catalog.selectCategory(null);
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
      {/* Sepet FAB'ı — v3:602 kuralı: sepette ürün varken vitrin·katalog·ürün·paket dörtlüsünde
          görünür (boşken komponent kendini çizmez); yerleşim vitrindekiyle aynı yuva. */}
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
  /** Sepet FAB yuvası — vitrindekiyle aynı konum (v3: sekme çubuğunun üstünde sağda). */
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
    // Şablon: `padding:8px 18px 10px` + gap 10 + altında 1,5 px mürekkep çizgi. Yatay dolgu
    // çocuklarda: ray kenardan kenara kaymalı (şablonun negatif kenar boşluğu kalıbı).
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
    // Şablon 14,5 çiziyor; ölçekte o durak yok ve en yakını `body-sm` (14) — `button` (14,5)
    // sayıca birebir ama DÜĞME kademesidir (700 ağırlıkla anlamlı), girdi metni için değil.
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  filterButton: {
    width: theme.size.controlSm,
    height: theme.size.controlSm,
    // Tam daire yarıçapı çaptan TÜREtilir (şablon: `border-radius:50%`) — resmî sette daire yok.
    borderRadius: theme.size.controlSm / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.ink,
  },
  /* Süzgeç ETKİNKEN dolu: rayda görünmeyen bir süzgecin var olduğunu söyleyen tek işaret bu.
     Boştaki hâli ZEMİNSİZDİR (şablon: `background:transparent`) — "saydam" bir renk token'ı
     açmak yerine zemin hiç verilmiyor; ikisi aynı sonuç, ikincisi palete sahte bir renk eklemiyor. */
  filterActive: { backgroundColor: theme.colors['sand-150'] },
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
    // Şablon: `padding:13px 16px`; 13 ölçekte ara değer, yukarı yuvarlandı (kitteki emsal).
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    // Şablon 14'lük köşe çiziyor; resmî set (Token Kararlari #7) kontrol kademesini 16'da tutuyor.
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  sortRowSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  // Seçili olmayan satır zeminsizdir (şablon: `background:transparent`) — yalnız çerçevesi var.
  sortRowIdle: {
    borderColor: theme.colors['sand-400'],
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
    // Şablon: `padding:20px 22px 12px` + satır arası 20 — hepsi ölçekte tam karşılığıyla var
    // (20'lik durak Token Kararlari #22 ile açıldı; daha önce 22'ye yuvarlanıyordu).
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.xl,
    gap: theme.space['5xl'],
  },
  row: {
    // Şablonun sütun arası 14 — ölçekte tam karşılığı var.
    gap: theme.space['2xl'],
  },
  cell: {
    flex: 1,
  },
  footer: {
    // Şablonun iskelet bloğundaki halka satırı: `padding:14px`.
    paddingVertical: theme.space['2xl'],
    alignItems: 'center',
  },
  listEnd: {
    fontFamily: theme.font.body[theme.text['card-title-sm--font-weight']],
    // Şablon: `600 11.5px 'Karla'` + `#b3ab97` — ikisi de ölçekte tam karşılığıyla var.
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },
}));
