import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { CATALOG_SORTS, type CatalogProduct, type CatalogSort } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Chip } from '@/components/ui/chip';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon-paths';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProductPhotoCard } from '@/components/ui/product-photo-card';
// Fiyat yazımı paylaşılan tek kaynaktan (terfi 21.7) — RN'de para biçimi yeniden yazılmaz (02-mimari §3.4).
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { placeModeOf, shippableChipVisible, stockMarkOf } from '@/lib/places/place-view';
import { usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { CartFab } from '@/screens/customer-kit/cart-fab';
import { cartCount, useCart } from '@/screens/customer-kit/cart-store';
// Bant KİTE taşındı (10.08): paketler sekmesi ikinci çağıranı oldu (komponentin kendi künyesi).
import { PlaceNoticeBand } from '@/screens/customer-kit/place-notice-band';
import { productPriceLabel } from '@/screens/customer-kit/price-label';
import { emToDp } from '@/theme/parse';
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
     yok"). Şablonun kendi diliyle kuruldu: listenin ALTINDA halka + "Yükleniyor…", bittiğinde
     "— hepsi bu kadar —" satırı, düşerse aynı satırda tekrar-dene. İLK yükün göstergesi bu DEĞİL,
     iskelettir; ikisi asla birlikte çizilmez (aşağıda `body()`).
  5. **Süzgeç sayfasının "Sadece indirimliler" anahtarı ve iki alt düğmesi YOK.** Anahtar
     SÖZLEŞMEDE yok: `/api/v1/products` `locale · q · category · sort · shippable · cursor · limit`
     kabul ediyor (`ProductQuerySchema`) ve `offers` bunların arasında değil — istemcide süzmek
     listenin sayfalı olduğu gerçeğiyle çelişirdi (bir sayfada üç indirimli varsa müşteri "üç ürün
     var" sanır). Anahtar düşünce alt
     düğmeler de anlamını yitirdi: "Temizle" ilk satırı seçmekle, "Göster" seçim yapmakla aynı şey
     — ekranda zaten duran iki şeyin ikinci kopyası olurlardı. Sıralama seçilir seçilmez uygulanır.
     **Anahtar SATIRI ise şimdi dolu** (aşağı): şablonun o yuvası boş kalmadı, sözleşmede gerçekten
     var olan tek boolean süzgeç ("adresime gönderilebilir") oraya yerleşti.

  ── SÜZGEÇ NEREDE (kullanıcı isteği 10.08) ──────────────────────────────────
  "Adresime gönderilebilir" ayrı bir çipti (kategori rayının altında kendi satırında); artık
  SÜZGEÇ SAYFASININ içinde. Yeni bir görsel dil üretilmedi — şablonun `shFilter` sayfasında bu
  süzgecin duracağı yer ZATEN VAR: sıralama satırlarının altındaki anahtar satırı ("Sadece
  indirimliler", `padding:4px 2px` · etiket solda · anahtar sağda). O satırı boş bırakıp süzgeci
  başka yere koymak, tasarımın verdiği kararı görmezden gelmek olurdu. Anahtarın kendisi kitte
  hazır (`ToggleSwitch`, v3:882 — hesap ekranının kampanya tercihleri); ikinci bir anahtar
  çizilmedi.

  Taşınmanın bir yan sonucu: süzgeç artık EKRANDA GÖRÜNMÜYOR, yani "etkin süzgeç var" bilgisini
  taşıyacak tek işaret süzgeç düğmesinin dolu hâli. `filtersActive` bu yüzden onu da sayıyor
  (hook künyesi) — çipken saymıyordu çünkü çipin kendisi görünürdü.
*/

/**
 * SIRALAMA SATIRLARININ İKONLARI (kullanıcı isteği 10.08) — kitin KENDİ setinden (`IconName`),
 * uydurma yok. İki fiyat satırı para ikonunu (`money`, avro glifi) paylaşır: ikisinin de eksen
 * "fiyat"tır, YÖNÜ etiket söyler. Sette yukarı/aşağı ok YOK — yatay oklar (`arrow-left/right`)
 * yön anlatır ama YANLIŞ yönü, o yüzden kullanılmadı.
 *
 * `featured` (Önerilen) BİLEREK İKONSUZ: sette "önerilen"i anlatan bir çizim (yıldız, kıvılcım,
 * kalp) yok ve olmayan bir kavram için eldeki bir ikonu ödünç almak, satırı başka bir yere
 * gidiyormuş gibi gösterirdi. Satırın ikon yuvası yine ayrılır ki üç etiket aynı hizadan başlasın.
 * Eksik ikonlar envantere raporlandı.
 */
const SORT_ICONS: Partial<Record<CatalogSort, IconName>> = {
  priceAsc: 'money',
  priceDesc: 'money',
};

type Messages = LocalizedCopy<typeof messages>;

interface CatalogScreenProps {
  /**
   * Vitrin bandından iletilen kategori SLUG'ı (21.14b); `null` = istek yok. Süzgecin SAHİBİ
   * değildir — yalnız bir seçim iletir: değer geldiğinde çip seçilir, müşteri sonra elle
   * değiştirebilir. **Uygulanınca TÜKETİLİR** (rotadan silinir) — gerekçesi ve ölçülen arıza
   * aşağıdaki etkinin künyesinde.
   */
  requestedCategory?: string | null;
  /**
   * Vitrin bandından iletilen koleksiyon SLUG'ı (21.64); `null` = istek yok. Kategorinin ikizi ve
   * aynı kurallarla: yalnız bir seçim iletir, sahibi ekrandır — müşteri bandın çarpısıyla kapatır.
   */
  requestedCollection?: string | null;
}

export function CatalogScreen({ requestedCategory = null, requestedCollection = null }: CatalogScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* KATALOG DA YERE BAĞLI (kullanıcı bulgusu 09.08): fiyat, teklif ve stok hâli depoya göre
     değişiyor ve vitrin kodu zaten gönderiyordu — katalog göndermeyince aynı ürün iki ekranda
     farklı fiyatla görünebiliyordu. Kaynak vitrindekiyle AYNI: cihazdaki onboarding kaydı
     (`home-screen` deseni). Kod değişince hook listeyi baştan okur (künyesi).

     Snapshot burada `undefined` OLAMAZ: kök kapı (`useOnboardingGate`) depo okunana dek ağacı
     hiç çizmiyor — yine de `?.` ile okunur, kapının kararı bu ekranın varsayımı olmasın. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;
  const catalog = useCatalog(locale, postalCode);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  /* YERİN ÇÖZÜMÜ — kartın hangi cümleyi kuracağını ve süzgeç satırının çizilip çizilmeyeceğini
     belirler (21.20). Kaynak vitrindekiyle AYNI kapı (`usePlaceResolution`); posta kodu beş haneye
     ulaşmamışsa ya da tanınmamışsa `null` döner ve o hâlde ne işaret ne süzgeç satırı vardır.

     Stok HÂLİ süzgece değil, sunucudan gelen cevaba bağlı: kod zaten her istekte gidiyor ve depo
     orada çözülüyor. Buradaki ikinci çözüm yalnız "rota içinde miyim" sorusunu cevaplıyor —
     depo kimliği İSTEMCİYE hiç verilmiyor (`place-api.schema.ts` güvenlik sınırı). */
  const place = usePlaceResolution(postalCode ?? '');
  const placeMode = placeModeOf(place);
  const chipVisible = shippableChipVisible(placeMode);
  /* BANDIN yeri: aynı koşul (çözülmüş + rota dışı), ama bandın kendisi ülke ve normalize posta
     kodunu İSTİYOR — talebi o ikisiyle kaydediyor. `chipVisible` bir boolean olduğu için tipi
     daraltmıyor; nesne buradan, tek satırda türetilir (ikinci bir kural yazılmış olmuyor). */
  const noticePlace = place?.kind === 'resolved' && !place.place.inRoute ? place.place : null;

  /* Satır kaybolunca SÜZGEÇ de kapanır: müşteri bölgesini rota içine çevirdiğinde (posta kodunu
     değiştirdi) görünmeyen bir süzgeç açık kalır ve listeyi sessizce daraltırdı — geri almanın
     görünür bir yolu olmadan. Süzgeç artık sayfanın İÇİNDE olduğu için bu kapı daha da gerekli:
     kapalı bir sayfada duran anahtar, ekranda hiç iz bırakmadan listeyi kısar. Web aynı korumayı
     sunucuda yapıyor (`shippableFilterApplies`); uygulamada URL yok, kapı burası. */
  const { onlyShippable, setOnlyShippable } = catalog;
  useEffect(() => {
    if (!chipVisible && onlyShippable) setOnlyShippable(false);
  }, [chipVisible, onlyShippable, setOnlyShippable]);

  /* Banttan gelen seçim etkiyle uygulanır: sekme MOUNT KALIR (navigatör tembel), yani ikinci
     banda basışta yeni bir mount olmaz — parametreyi ancak bir etki izleyebilir. İlk yük "Tümü"
     ile başlayıp hemen kategoriye geçebilir (tek fazladan istek, yalnız sekme hiç açılmamışken);
     eskimiş cevabı hook'un `generation` koruması düşürür. */
  /*
    BANTTAN GELEN İSTEK TEK SEFERLİK BİR MESAJDIR — VE OKUNDUĞUNDA TÜKETİLİR (21.64).

    Parametre eskiden ekranda ASILI kalıyordu ve şu ÖLÇÜLEN arızayı doğuruyordu (cihazda, 16.08):
    banda bas → kesit açılır → çarpıyla kapat → vitrine dön → AYNI banda bas → **hiçbir şey olmaz.**
    Sebep parametre değil etkiydi: sekme mount kalıyor (navigatör tembel), yani ikinci basışta yeni
    bir mount yok; etkinin tek bağımlılığı olan değer de `'bayram-sofrasi'`ten `'bayram-sofrasi'`e
    "değişmediği" için etki hiç koşmuyordu. Kanıt: farklı bir slug'la (`cay-saati`) aynı an çalıştı.

    Çare parametreyi uygulandığı anda SİLMEK: mesaj alındı, kutu boşaldı. Böylece bir sonraki basış
    — değeri aynı olsa bile — `null → değer` geçişidir ve etki koşar. `setParams` yığına sayfa
    EKLEMEZ (ürün detayının aile çiplerinde kurulmuş desen), yani geri tuşu bundan etkilenmez.

    Aynı arıza kategoride de vardı ve aynı yerden düzeltildi: "Fırın" bandına basıp çipi "Tümü"ye
    çekince, o banda ikinci kez basmak da işe yaramıyordu.
  */
  const { selectCategory, selectCollection } = catalog;
  useEffect(() => {
    // Bağımlılık BİLEREK yalnız istek: `selectCategory` her render'da tazelenir, ona bağlanmak
    // etkiyi her çizimde koşturur ve müşterinin elle seçimini bantla ezerdi.
    if (requestedCategory === null) return;
    selectCategory(requestedCategory);
    router.setParams({ category: undefined });
  }, [requestedCategory]);

  /* Koleksiyon AYRI etkide, aynı gerekçelerle. Tek etkide birleştirilmedi çünkü ikisinin
     bağımlılığı ayrı: bir bandın türü ya kategori ya koleksiyondur (`HomeBandKindEnum`), yani her
     geçişte ikisinden yalnız biri değişir — birleşik etki ötekini de boşuna yeniden uygulardı. */
  useEffect(() => {
    if (requestedCollection === null) return;
    selectCollection(requestedCollection);
    router.setParams({ collection: undefined });
  }, [requestedCollection]);

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
  const cardOf = (product: CatalogProduct) => {
    /* YER İŞARETİ (21.20) — sunucu doğruyu zaten söylüyordu (`stockStatus`), kart onu ATIYORDU:
       rota dışı müşteri katalogda neyin gelip gelmeyeceğini göremiyor, uyarıyı ancak ürün
       detayına girince buluyordu. Cümleyi kuran yer `stockMarkOf`; kart yalnız çiziyor. */
    const stockMark = stockMarkOf(product.stockStatus, place, locale);
    /* "KARGOYLA GELİR" KARTA YAZILMAZ (kullanıcı kararı 10.08): rota dışı müşterinin kartlarının
       neredeyse tamamı o işareti taşıyordu — her kartta yazan bir bilgi, bilgi olmaktan çıkar.
       Cümle listenin başındaki banda (`PlaceNoticeBand`) taşındı, TEK yere. Kartta kalan not,
       GÖNDEREMEDİĞİMİZ ya da bölgede olmayan ürününkidir: `info` tonu (kargo) elenir, `blocked`
       ve `pending` kalır. Eleme burada yapılır çünkü `stockMarkOf` vitrinin daire kartını da
       besliyor ve o ekran bu şeridin alanı değil (terfi ihtiyacı raporlandı). */
    const placeNote = stockMark === null || stockMark.tone === 'info' ? undefined : stockMark.label;
    return {
      name: product.name,
      photoUri: product.image.url,
      priceLabel: productPriceLabel(product.priceCents, product.variantCount, locale),
      soldOut: product.soldOut,
      soldOutLabel: t.card.soldOut,
      discountLabel: product.wasCents === undefined ? undefined : t.card.offer,
      placeNote,
      /* SOLMA yalnız KAPALI kapıda: "bu adrese gönderemiyoruz" kalıcı bir hâl ve kart bir satın
         alma değil bir bilgi. `shipping` ve rota içi `elsewhere` SOLMAZ — ikisinde de ürün
         gelebiliyor (biri kargoyla, öteki stok girince) ve soldurmak müşteriyi olmayan bir
         kapıdan çevirirdi. */
      dimmed: stockMark?.tone === 'blocked',
      /* Çeşit satırı yalnız ÇOK boylu üründe (şablon: `p.vs.length>1 ? p.vs.length+' seçenek' : null`).
         Sayı sözleşmeden (`variantCount`), CÜMLE cihazdan: "N seçenek" bir i18n şablonudur ve dile
         göre çekim alır — API biçimli metin göndermez. "1 seçenek" yazılmaz: olmayan bir seçim
         varmış izlenimi verirdi. */
      optionsLabel: product.variantCount > 1 ? t.card.options.replace('{n}', String(product.variantCount)) : undefined,
    };
  };

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
          {/* TEMİZLE — yalnız yazı VARKEN çizilir (kullanıcı isteği 15.08). Boşken de dursaydı
              hiçbir işi olmayan bir düğme, kutunun içinde kalıcı gürültü olurdu.
              Dokunma hedefi ikondan büyük: `compact` işareti kitin tek dokunma payını getiriyor
              (`theme.touchSlop`) — 16 px'lik bir çarpı, parmakla ıskalanan bir düğmedir. Pay
              öğe başına hesaplanmaz, kitin kararıdır (`pressable-surface` künyesi).
              KLAVYE TUZAĞI (MB-01) burada YOK: arama satırı listenin DIŞINDA, kardeş bir `View`
              içinde duruyor, yani FlatList'in `keyboardShouldPersistTaps` varsayılanı bu dokunuşu
              yutmuyor — yine de cihazda klavye açıkken ölçüldü. */}
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
      {/* KOLEKSİYON BANDI (21.64 · kullanıcı kararı 16.08) — arama ile çip rayının ARASINDA.
          Kaynak sunucunun cevabı: bant `activeCollection` doluyken çizilir, süzgeç kalkınca cevap
          `null` döner ve bant kendiliğinden söner (ayrı bir görünürlük bayrağı YOK — iki kaynak bir
          gün ayrışır ve bant boş bir kesitin adını yazardı).

          ── KATEGORİ RAYI ARTIK GİZLENİYOR (kullanıcı kararı 18.08 — 16.08'i DEĞİŞTİRİR) ──
          16.08'de web'den bilinçli sapılmıştı: web'de koleksiyon sayfanın BAŞLIĞI olur ve kategori
          şeridi tamamen gizlenir; mobilde ray kalsın, müşteri kesit İÇİNDE daraltabilsin denmişti.
          **Cihazda ölçülünce gerekçe çürüdü (18.08):** koleksiyon süzgeci kategori havuzunu da
          daraltıyor, yani "L'amour de Paris" açıkken rayda YALNIZ "Tümü" kalıyordu — daraltacak
          bir şey sunmayan, tek düğmelik ölü bir şerit. Kullanıcının cümlesi: *"kategori filtre
          butonları görünmesin."* Artık mobil de web'in kararını uyguluyor; iki yüzey aynı hizada. */}
      {catalog.activeCollection === null ? null : (
        <View style={styles.collectionBand} testID="catalog-collection-band">
          <View style={styles.collectionText}>
            <Text style={styles.collectionEyebrow}>{upperIn(t.collection.eyebrow, locale)}</Text>
            <Text style={styles.collectionName} numberOfLines={1}>
              {catalog.activeCollection.name}
            </Text>
          </View>
          {/* Dokunma hedefi ikondan büyük (`compact` → kitin tek dokunma payı) — arama temizle
              düğmesiyle aynı karar, aynı gerekçe.

              ── BASILABİLDİĞİ GÖRÜNSÜN (kullanıcı bulgusu 18.08) ──────────────
              Eski hâl `inlineIcon` (17) ve `olive-dark`tı: sayfanın geri kalanıyla aynı sessiz
              tonda, satır içi bir işaret gibi duruyordu ve kullanıcı cihazda *"o butona
              basılacağı çok anlaşılmayabiliyor"* dedi. İki şey değişti, ikisi de token'dan:
              ölçü `headerIcon` (20) — künyesi zaten "başlık satırındaki yuvarlak düğmenin ikonu"
              diyor, yani bu rolün kendi durağı; renk ise `terracotta`, uygulamanın EYLEM
              vurgusu (fırsat rozeti, çağrı bağlantıları aynı aileden). Kırmızıya yakın olması
              tesadüf değil: burada yapılan iş bir GERİ ALMA. */}
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
      {/* Şerit arama alanının hemen altında: klavye açıkken kategori çipine dokunmak yalnız
          klavyeyi kapatırdı, süzgeç değişmezdi (künye `feedback-screen`).
          Koleksiyon açıkken HİÇ çizilmez — gerekçe yukarıdaki bant künyesinde (18.08). */}
      {catalog.activeCollection !== null ? null : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRail}
        keyboardShouldPersistTaps="handled"
        testID="catalog-chips"
      >
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
      )}
    </View>
  );

  /** Sırala & filtrele sayfası — sıralama seçimi ANINDA uygulanır ve sayfa kapanır (bkz. sapma 5). */
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
      {/* YER SÜZGECİ ARTIK BURADA DEĞİL (kullanıcı kararı 11.08) — bilgi bandının içinde
          (`PlaceNoticeBand shippableFilter`). Sayfa yine yalnız SIRALAMADIR.

          Gerekçe kullanıcının kendi cümlesi: süzgeç zaten *"ancak teslimat noktalarımızın dışında
          çıkan"* bir denetim, yani bandın çizildiği hâlin ta kendisi — iki ayrı yerde iki ayrı
          koşul tutmak yerine tek yerde duruyor. Yerleşimden öte bir doğruluk kazancı da var:
          KAPALI bir sayfanın içindeki anahtar açık kalıp listeyi ekranda hiçbir iz bırakmadan
          kısabiliyordu; bant görünürken anahtar da görünür. */}
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
    /* İLK YÜK ile KUYRUK yükü AYRI şeyler ve göstergeleri de ayrı: burada liste hiç çizilmediği
       için alttaki halka (`listFooter`) ilk yükte zaten görünemez. Kullanıcının 09.08'de bildirdiği
       çift gösterge ölçüldü ve kaynağı BURASI DEĞİLDİ — iskeletin KENDİ içindeki "Yükleniyor…"
       satırıydı; düzeltme orada (`catalog-skeleton` künyesi). */
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
        /* BİLGİ BANDI listenin BAŞINDA, başlığın içinde DEĞİL: adresin gerçeği bir kez okunur,
           sonra kaydırılıp geçilir. Yapışkan başlığa konsaydı her kaydırmada ekranın üstünden bir
           dilim yerdi — arama ve kategori rayı kalıcı denetimlerdir, bu bir cümledir. */
        ListHeaderComponent={
          noticePlace === null ? null : (
            <PlaceNoticeBand
              country={noticePlace.country}
              postalCode={noticePlace.postalCode}
              /* Şehir de hapta yazılır (kullanıcı isteği 11.08) — çözümden gelir, `null` olabilir
                 ve o hâlde bant yalnız kodu basar (prop künyesi). */
              placeName={noticePlace.placeName}
              source="app-catalog"
              /* Süzgeç bandın İÇİNDE (kullanıcı kararı 11.08 — süzgeç sayfasından taşındı).
                 Koşulu ayrıca yazılmaz: bant zaten `chipVisible` ile aynı hâlde çiziliyor
                 (ikisi de "çözülmüş + rota dışı"). Paketler listesi bu prop'u vermez — orada
                 süzülecek bir şey yok. */
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
            onRefresh={catalog.refresh}
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
            /* CTA yalnız SÜZGEÇ VARKEN: süzgeçsiz boş katalogda "tüm katalog" düğmesi aynı boş
               listeye götürürdü. Arama metni de bir süzgeçtir — onu temizlemek de aynı düğme.
               Yer çipi de öyle: açıkken liste boşalabilir (rota dışı müşterinin kategorisinde hiç
               kargolanabilir ürün yoksa) ve düğme onu temizlemezse çıkışsız bir oda kalırdı. */
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
  /* KOLEKSİYON BANDI — arama satırıyla aynı yatay dolguda (kenardan kenara kayan çip rayının
     aksine), yani ekranın kenar hizasını bozmuyor. Zemin `sand-150`: süzgeç düğmesinin ETKİN
     hâliyle aynı ton, çünkü ikisi de aynı şeyi söylüyor — "burada açık bir daraltma var". */
  /* KAP YOK — YALNIZ METİN (kullanıcı kararı 18.08).

     Eski hâl yuvarlak köşeli, iki yandan boşluklu, kum zeminli bir KUTUYDU; altındaki ızgara da
     kartlardan oluşuyor ve kullanıcı cihazda görüp eledi: *"kart kart tasarıma dönüşmeye başlıyor
     burası"*. Ara adım olarak kutu kenardan kenara açıldı, ama o da tutmadı — küçükken göze
     batmayan kum zemini tam genişlikte büyük bir renk alanına dönüştü ve kullanıcı *"renk
     seçimlerimiz… genel proje tasarımımızdan kopuk duruyor"* dedi. Haklıydı: bu ekranın koleksiyon
     hâli ŞABLONDA HİÇ YOK (`Mobil - Musteri v3` katalog başlığında yalnız arama, süzgeç ve çipler
     var), yani zemin de ad kademesi de bir tasarım kararına değil tahmine dayanıyordu.

     Doğru cevap kabı tümden kaldırmak: sayfa zemininde üstbaşlık + ad + temizle. Renk sorusu
     ortadan kalkar, ızgarayla yarışan bir yüzey kalmaz ve süzgecin ne olduğu yine tek bakışta
     okunur. Bölümü kapatan çizgi ZATEN VAR ve yenisi eklenmedi: başlık bloğunun kendi alt kenarı
     (`header.borderBottom`) — kutu değil, çizgi. */
  /* DİKEY DOLGU YOK — ritim BAŞLIĞIN (kullanıcı bulgusu 18.08: *"arada çok fazla boşluklar var"*).
     Ölçüldü: zemin varken bandın kendi dolgusu gerekliydi, kalkınca ÜST ÜSTE bindi — arama ile
     üstbaşlık arasında `header.gap` 10 + bandın 10 = 20 dp, ad ile çizgi arasında bandın 12 +
     `header.paddingBottom` 10 = 22 dp. Kapsız bir metin bloğunun kendi dolgusu olmaz; boşluğu
     zaten kapsayıcı veriyor. Şimdi ikisi de 10 ve satırlar başlığın öteki çocuklarıyla aynı
     ritimde. Yatay dolgu KALIYOR: başlığın yatay dolgusu çocuklarda (kendi künyesi). */
  collectionBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
  },
  // Metin bloğu esner, çarpı sabit kalır: uzun koleksiyon adı düğmeyi ekran dışına itmesin.
  collectionText: {
    flex: 1,
    gap: theme.space.xs,
  },
  collectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // Aralık token'da `em` (yazı boyuna göreli); RN mutlak dp ister — çeviri tek yerde (`emToDp`).
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    /* KIRMIZI TONU, ZEYTİN DEĞİL (kullanıcı kararı 18.08). `olive-dark`tı ve satırda iki ayrı
       vurgu rengi vardı: üstbaşlık zeytin, temizleme çarpısı terracotta — biri "bilgi" biri
       "eylem" gibi okunuyor, oysa ikisi aynı şeyin parçası (etkin süzgeç ve onu kaldırma).
       `terracotta` uygulamanın kırmızı ucu ve üstbaşlıklarda ZATEN kullanılıyor (vitrinin kum
       bandı, ürün detayının "PASTA" satırı) — yeni bir ton açılmadı. */
    color: theme.colors.terracotta,
  },
  /* Ad, VİTRİNDEKİ koleksiyon bandının başlığıyla BİREBİR aynı kademede (18.08): Lora `h2-sm`.
     Tahminle seçilmedi, ölçüldü — `home/collection-band.tsx` başlığı tam bu ikiliyi kullanıyor.
     Müşteri az önce o banda basıp buraya geldi; adın aynı sesle karşılaması "bastığın şeyin
     içindesin" demenin en kısa yolu. Zemin gitti ama TİPOGRAFİ bağı kaldı — bağlantıyı kuran
     zaten renk değil, adın kademesiydi. */
  collectionName: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
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
  /* Anahtar satırının stili de BANDA TAŞINDI (11.08): satır artık süzgeç sayfasında değil, bilgi
     kutusunun içinde — ölçüsü orada, komşusuyla birlikte veriliyor. */
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
