import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { CatalogProduct } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProductPhotoCard } from '@/components/ui/product-photo-card';
// Fiyat yazımı paylaşılan tek kaynaktan (terfi 21.7) — RN'de para biçimi yeniden yazılmaz (02-mimari §3.4).
import { formatPrice } from '@lezzet/helper';
import { deviceLocale } from '@/lib/i18n/locale';
import { CatalogSkeleton } from './catalog-skeleton';
import { useCatalog } from './use-catalog.hook';
import messages from './messages.json';

/*
  KATALOG EKRANI (v3 `vCatalog`) — kategori rayı + iki sütun kare kart ızgarası + keyset sonsuz
  kaydırma. Uygulamanın ilk gerçek ekranı.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli, gerekçeli) ──────────────────────────
  1. **Arama kutusu ve süzgeç düğmesi YOK — BEKLEYEN(21.7).** İkisi de bu dilimin kapsamı dışında
     (yönetici imzası) ve ikisi de İKON ister (büyüteç, süzgeç çizgileri); uygulamada ikon sistemi
     henüz yok (bkz. `BottomTabBar` künyesi). Uç arama ve sıralamayı ZATEN destekliyor, eksik olan
     yalnız arayüz.
  2. **Yapışkanlık kaydırma alanının DIŞINDA.** RN'de `position: sticky` yok; şablonun `sticky top:0`
     davranışının karşılığı, ray listenin üstünde sabit dururken listenin altından akmasıdır. Görsel
     sonuç aynı: ray her zaman görünür.
  3. **Hata bloğunun KESİKLİ ÇERÇEVESİ çizilmedi.** Şablon kesikli kum çerçeveli bir kutu kullanıyor;
     o kalıp envanterde ayrı bir komponent adayı (`DashedInvite`, §2) ve henüz kurulmadı. `EmptyState`
     kendi dolgusunu taşıdığı için çerçeve içine alınınca şablonun 28 px'lik nefesi 70'e çıkıyordu.
  4. **Şablonun iki durum ikonu (bulunamadı büyüteci · bağlantı yok simgesi) çizilmedi** — aynı ikon
     boşluğu. `EmptyState` ikonu YUVA olarak bekliyor, sistem kurulunca tek satırla takılır.
  5. **"Tekrar dene" düğmesi zeytin.** Şablonda mürekkep zeminli; kitte mürekkep dolgulu düğme YOK
     (birincil zeytin, ikincil çerçeveli) ve tek ekran için üçüncü bir düğme tonu açmak kitin
     sözlüğünü büyütürdü.
  6. **Kuyruk (sonraki sayfa) durumları şablonda HİÇ YOK** (envanter §5: "sonsuz kaydırma göstergesi
     yok"). Şablonun kendi diliyle kuruldu: yüklenirken iskelet bloğundaki halka + "Yükleniyor…",
     bittiğinde "— hepsi bu kadar —" satırı, düşerse aynı satırda tekrar-dene.
*/

type Messages = LocalizedCopy<typeof messages>;

export function CatalogScreen() {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const catalog = useCatalog(locale);

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

  const chipRail = (
    <View style={styles.header}>
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
            title={t.empty.title}
            description={t.empty.body}
            /* CTA yalnız SÜZGEÇ VARKEN: süzgeçsiz boş katalogda "tüm katalog" düğmesi aynı boş
               listeye götürürdü. */
            action={
              catalog.activeCategory === null ? undefined : (
                <PrimaryButton
                  label={t.empty.cta}
                  shape="pill"
                  onPress={() => catalog.selectCategory(null)}
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
      {chipRail}
      {body()}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    // Üst güvenli alan ekranın kendisinde: ray durum çubuğunun altında başlar.
    paddingTop: rt.insets.top,
  },
  header: {
    // Şablon: `padding:8px 18px 10px` + altında 1,5 px mürekkep çizgi.
    paddingVertical: theme.space.md,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors.ink,
  },
  chipRail: {
    flexDirection: 'row',
    gap: theme.space.md,
    paddingHorizontal: theme.space['4xl'],
  },
  grid: {
    // Şablon: `padding:20px 22px 12px`; 20 ölçekte ara değer, yukarı yuvarlandı (22).
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['5xl'],
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
    fontFamily: theme.font.body,
    // Şablon: `600 11.5px 'Karla'` + `#b3ab97` — ikisi de ölçekte tam karşılığıyla var.
    fontSize: theme.text.micro,
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingTop: theme.space.md,
  },
}));
