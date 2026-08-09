import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { RecipeRow } from '@lezzet/types';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { CirclePhoto } from '@/components/ui/circle-photo';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { deviceLocale } from '@/lib/i18n/locale';
import { addProduct } from '@/screens/customer-kit/cart-store';
import { emToDp } from '@/theme/parse';
import messages from './messages.json';
import { useRecipe } from './use-recipe.hook';

/*
  TARİF DETAY (v3 `vRecipe`, tasarım 21: v3:1182-1223 + yapışkan bar v3:1272-1276 + kurucu
  v3:1892-1899) — GERÇEK UÇTAN okur (`GET /api/v1/recipes/:slug`): sayfaya vitrinin "Sofradan
  fikirler" kartından gerçek slug'la gelinir. Satır fiyat/stok kararları MOTORUN (katalogla aynı
  kapı); ekran karar hesaplamaz, sözleşmeyi çizer.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **`qty` ekseni EKLENDİ**: v3 kurucusunda yok (mock verisi hep 1 adetti), veri modelinde var
     ve toplamın tanımı onun (`recipe.schema.ts`: toplam = Σ qty × fiyat). Satır 2+ adette
     "2 × 500 g" yazar; + ve "hepsini ekle" tarifin istediği adediyle ekler — satırın +'sı ile
     alt barın toplamı birbirini yalanlamasın.
  2. **Fiyatsız (satışa kapalı) satır hâli**: v3 mock'unda doğmuyordu; sözleşme `priceCents: null`
     taşıyabilir → + çizilmez, fiyat parçası düşer (katalog kartının kuralı: sıfır yazılmaz).
  3. **Hiçbir satır eklenemezse yapışkan bar ÇİZİLMEZ**: v3 barı koşulsuz basar ama mock'ta bu hâl
     yok; "…ekle · 0,00 €" ölü ve yalancı bir düğme olurdu (CLAUDE §1 — ölçülemeyen değer sıfır
     değildir). Bar yoksa kaydırma payı da yok.
  4. **Tükendi satırı SOLUKLAŞTIRILMAZ**: v3'ün `so` hâli yalnız +'ı "Tükendi" etiketiyle
     değiştiriyor (v3:1198), satıra opaklık düşürmüyor — v3 hakem, katalogdaki `soldOutOpacity`
     buraya taşınmadı.
  5. **Sepete ekleme onayı sessiz** (v3 `addAll` toast basıyor: "c malzeme sepete eklendi ✓"):
     küresel toast katmanı bilinen borç (ürün ekranı sapma 6'nın aynısı) — katman gelince
     `addAll` da onu çağırır.
  6. **İskelet v3'te tanımlı değil**; ürün ekranının bekleme diliyle asgari bloklar çizildi.
  7. **+ kutusunun gölgesi `2px 2px 0 ink`** (v3:1194) token renginden yerinde kurulur: kitte
     yalnız 3'lük `hard` durağı var; yeni durak (hard-sm) kit işi, ihtiyaç raporlandı. Basılı
     kayma (2,2) gölgeyi tam yutar — tasarımın kendi davranışı.

  Sepet FAB'ı bu sayfada YOK ve bu sapma değil v3 KURALI: fab dörtlüsü vitrin·katalog·ürün·paket
  (v3:602) — tarif sayfası listede değil.

  KAHRAMAN ROZETİ KOMŞUYA TAŞAR (süre·porsiyon, alt kenardan -18): kardeş çizim sırası yüzünden
  içerik bloğu rozeti ezerdi — kahraman kapsayıcısı `zIndex` ile üste alındı (ürün ekranının dersi).
*/

type Messages = LocalizedCopy<typeof messages>;

/*
  v3'te ölçülmüş, EKRANA-ÖZEL yapısal duraklar. `customer-kit/customer-metrics.ts` bu görevde
  yazıya KAPALI (kit dosyası) — ham değerler komponent stillerine DAĞILMADI, tek yerde duruyor
  (ölçü katmanının kendi kuralı); kit açıldığında oraya terfi eder, ihtiyaç raporlandı.
*/
const recipeMetrics = {
  /** Kahraman fotoğraf (v3:1184 — 300; ürünün 400'lük kahramanından bilerek basık). */
  hero: 300,
  /** Süre·porsiyon rozetinin alt kenardan sarkması (v3:1187 — -18). */
  badgeDrop: 18,
  /** Malzeme satırının daire fotoğrafı (v3:1191 — 46). */
  rowPhoto: 46,
  /** Sepete + kutusu (v3:1193 — 38×38). */
  addBox: 38,
  /** Hazırlanış adımının numara dairesi (v3:1206 — 28). */
  stepBadge: 28,
  /** Yapışkan barın kaydırma payı (v3:1223 — 108). */
  barSpace: 108,
} as const;

/** Satır eklenebilir mi — fiyatı var VE tükenmedi (v3 `l.ok`'un sözleşmedeki karşılığı). */
function isAddable(row: RecipeRow): row is RecipeRow & { priceCents: number } {
  return !row.soldOut && row.priceCents !== null;
}

/** Satırı sepet deposunun diline çevirir — kimlik ürün detayının şemasıyla AYNI (satırlar birleşir). */
function cartLineOf(row: RecipeRow & { priceCents: number }) {
  return {
    id: `${row.productSlug}-${row.variantId}`,
    slug: row.productSlug,
    name: row.name,
    variantLabel: row.variantLabel,
    unitCents: row.priceCents,
    photoUri: row.image.url,
    discounted: row.wasCents !== undefined,
    soldOut: false,
  };
}

/**
 * Satırın alt metni — v3: "{boy} · {fiyat}" (v3:1192). `qty` öneki sapma 1; boşluklu parçalar
 * eksik veride sessizce düşer (tek boylu ürünün boş etiketi, fiyatsız satır).
 */
function rowMeta(row: RecipeRow, locale: 'tr' | 'fr' | 'de'): string {
  const label = [row.qty > 1 ? `${row.qty} ×` : null, row.variantLabel.length > 0 ? row.variantLabel : null]
    .filter((part): part is string => part !== null)
    .join(' ');
  return [label.length > 0 ? label : null, row.priceCents === null ? null : formatPrice(row.priceCents, locale)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

interface RecipeDetailScreenProps {
  slug: string;
}

export function RecipeDetailScreen({ slug }: RecipeDetailScreenProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { status, detail, retry } = useRecipe(slug, locale);

  if (status === 'loading') {
    return (
      <View style={styles.screen} testID="recipe-loading">
        <Skeleton width="100%" height={recipeMetrics.hero} radius="card" />
        <View style={styles.skeletonBody}>
          <Skeleton width={120} height={12} radius="full" />
          <Skeleton width="80%" height={26} radius="full" />
          <Skeleton width="100%" height={46} radius="card" />
          <Skeleton width="100%" height={46} radius="card" />
        </View>
      </View>
    );
  }

  if (status === 'missing' || status === 'error' || detail === null) {
    const missing = status === 'missing';
    return (
      <View style={styles.errorScreen} testID={missing ? 'recipe-missing' : 'recipe-error'}>
        <EmptyState
          icon={missing ? undefined : <Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={missing ? t.notFound.title : t.error.title}
          description={missing ? t.notFound.body : t.error.body}
          action={
            <PrimaryButton
              label={missing ? t.notFound.back : t.error.retry}
              shape="pill"
              onPress={missing ? () => router.back() : retry}
              testID="recipe-error-action"
            />
          }
        />
      </View>
    );
  }

  /* Rozet parçaları eksik veride düşer; ikisi de boşsa rozet hiç çizilmez (v3: "{time} · {serves}"). */
  const badge = [detail.duration, detail.serves].filter((part): part is string => part !== null).join(' · ');
  const addable = detail.rows.filter(isAddable);
  /* Toplam veri modelinin kendi tanımı: Σ qty × fiyat (sapma 1). */
  const totalCents = addable.reduce((sum, row) => sum + row.priceCents * row.qty, 0);

  const addAll = () => {
    /* v3 `rc.addAll` (v3:1899): yalnız eklenebilir satırlar; onay sessiz (sapma 5). */
    for (const row of addable) addProduct(cartLineOf(row), row.qty);
  };

  return (
    <View style={styles.screen} testID="recipe-detail">
      <ScrollView contentContainerStyle={styles.content} testID="recipe-scroll">
        {/* ── Kahraman: foto + üst degrade + geri + süre·porsiyon rozeti (v3:1184-1187) ── */}
        <View style={styles.hero}>
          {detail.image.url === null ? (
            <View style={styles.heroFallback}>
              <Text style={styles.heroInitial}>{detail.name.slice(0, 1)}</Text>
            </View>
          ) : (
            <Image source={{ uri: detail.image.url }} style={styles.heroImage} accessibilityIgnoresInvertColors />
          )}
          {/* Skrim token gradyanının kendisi (photo-top: .28 → şeffaf %32 — v3:1185 birebir). */}
          <LinearGradient {...theme.gradient.photoTop} style={styles.heroScrim} pointerEvents="none" />
          <View style={styles.heroButtons}>
            <BackButton onPress={() => router.back()} accessibilityLabel={t.back} variant="photo" testID="recipe-back" />
          </View>
          {badge.length === 0 ? null : (
            <View style={styles.timeBadge} testID="recipe-badge">
              <Text style={styles.timeBadgeText}>{badge}</Text>
            </View>
          )}
        </View>

        {/* ── Künye + üç bölüm (v3:1188-1211): üstbaşlık · ad · açıklama · bizden · evinizden · adımlar ── */}
        <View style={styles.head}>
          <Text style={styles.eyebrow}>{t.eyebrow}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {detail.name}
          </Text>
          {detail.description === null ? null : <Text style={styles.description}>{detail.description}</Text>}

          {detail.rows.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.oursEyebrow]}>{t.sections.ours}</Text>
              <View>
                {detail.rows.map((row) => (
                  <View key={row.variantId} style={styles.row}>
                    <PressableSurface
                      onPress={() => router.push(`/product/${row.productSlug}`)}
                      feedback="opacity"
                      compact
                      style={styles.rowMain}
                      accessibilityLabel={t.row.open.replace('{name}', row.name)}
                      testID={`recipe-row-${row.variantId}`}
                    >
                      <CirclePhoto
                        size={recipeMetrics.rowPhoto}
                        initial={row.name.slice(0, 1)}
                        initialFontSize={theme.text['screen-title']}
                        photoUri={row.image.url}
                      />
                      <View style={styles.rowText}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {rowMeta(row, locale)}
                        </Text>
                      </View>
                    </PressableSurface>
                    {row.soldOut ? (
                      <Text style={styles.soldOut} testID={`recipe-soldout-${row.variantId}`}>
                        {t.row.soldOut}
                      </Text>
                    ) : row.priceCents === null ? null : (
                      <PressableSurface
                        onPress={() => {
                          if (isAddable(row)) addProduct(cartLineOf(row), row.qty);
                        }}
                        feedback="shadow"
                        compact
                        style={styles.addBox}
                        accessibilityLabel={t.row.add.replace('{name}', row.name)}
                        testID={`recipe-add-${row.variantId}`}
                      >
                        <Text style={styles.addGlyph}>+</Text>
                      </PressableSurface>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {detail.pantry.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.pantryEyebrow]}>{t.sections.pantry}</Text>
              <View style={styles.pantryList}>
                {detail.pantry.map((entry, index) => (
                  <Text key={index} style={styles.pantryItem}>
                    • {entry}
                  </Text>
                ))}
              </View>
            </>
          )}

          {detail.steps.length === 0 ? null : (
            <>
              <Text style={[styles.sectionEyebrow, styles.stepsEyebrow]}>{t.sections.steps}</Text>
              <View style={styles.stepList}>
                {detail.steps.map((step, index) => (
                  <View key={index} style={styles.stepRow}>
                    {/* Numarayı EKRAN verir (05.16 — metin taşımaz). */}
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Yapışkan barın payı (v3:1223 — 108); bar yoksa pay da yok (sapma 3). */}
        {addable.length === 0 ? null : <View style={styles.barSpace} />}
      </ScrollView>

      {/* ── Yapışkan alt bar (v3:1272-1276) — krem cam; düğme kitin birincil bloğu ── */}
      {addable.length === 0 ? null : (
        <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID="recipe-bar">
          <View style={styles.barGlass} pointerEvents="none" />
          <PrimaryButton label={`${t.addAll} · ${formatPrice(totalCents, locale)}`} onPress={addAll} testID="recipe-add-all" />
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },
  content: {
    paddingBottom: theme.space['3xl'],
  },
  skeletonBody: {
    padding: theme.space['3xl'],
    gap: theme.space.xl,
  },
  errorScreen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
    justifyContent: 'center',
    padding: theme.space['3xl'],
  },

  /* Kahraman kapsayıcısı içeriğin ÜSTÜNE çizilir (zIndex) — süre·porsiyon rozeti alt komşuya taşıyor. */
  hero: {
    height: recipeMetrics.hero,
    zIndex: 2,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  heroInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    fontWeight: theme.text['h1-sm--font-weight'],
    color: theme.colors['on-image-soft'],
  },
  heroScrim: {
    position: 'absolute',
    inset: 0,
  },
  heroButtons: {
    /* Ürün kahramanının aynı kararı (kullanıcı bulgusu 08.08): foto saat altına taşar, düğme
       taşmaz — şablonun 8px'i üst güvenli alanın üstüne eklenir; iki ekranın geri düğmesi hizalı. */
    position: 'absolute',
    top: rt.insets.top + theme.space.sm,
    left: theme.space.lg,
    right: theme.space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** Süre·porsiyon rozeti alt kenardan sarkar (v3:1187 — -18, 3° dönüş); taşma tasarımın imzası. */
  timeBadge: {
    position: 'absolute',
    right: theme.space['4xl'],
    bottom: -recipeMetrics.badgeDrop,
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.badge,
    transform: [{ rotate: '3deg' }],
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  timeBadgeText: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    fontWeight: theme.text['badge--font-weight'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text.badge),
    color: theme.colors['sand-50'],
  },

  head: {
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
    gap: theme.space.lg,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    fontWeight: theme.text['h1-sm--font-weight'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  /* Bölüm üstbaşlıkları tek stil (v3 10px/.18em) — aralar yalnız üst boşlukla ayrışır. */
  sectionEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  oursEyebrow: { marginTop: theme.space.md },
  pantryEyebrow: { marginTop: theme.space.sm },
  stepsEyebrow: { marginTop: theme.space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: theme.colors['sand-400'],
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space['2xs'],
  },
  rowName: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['chip--font-weight'],
    color: theme.colors.ink,
  },
  rowMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  soldOut: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.micro,
    fontWeight: theme.text['chip--font-weight'],
    color: theme.colors.muted,
  },
  /** + kutusu (v3:1193-1194): mürekkep çerçeve + krem zemin + 2'lik sert gölge (künye sapma 7). */
  addBox: {
    width: recipeMetrics.addBox,
    height: recipeMetrics.addBox,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.badge,
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors['sand-50'],
    boxShadow: `${theme.press.translate}px ${theme.press.translate}px 0 ${theme.colors.ink}`,
  },
  addGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['h2-sm'],
    color: theme.colors.ink,
  },

  pantryList: {
    gap: theme.space.sm,
  },
  pantryItem: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * 1.4,
    color: theme.colors.body,
  },

  stepList: {
    gap: theme.space.xl,
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.space.xl,
  },
  stepBadge: {
    width: recipeMetrics.stepBadge,
    height: recipeMetrics.stepBadge,
    borderRadius: recipeMetrics.stepBadge / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-150'],
  },
  stepBadgeText: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['chip--font-weight'],
    color: theme.colors.terracotta,
  },
  stepText: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },

  barSpace: {
    height: recipeMetrics.barSpace,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    paddingTop: theme.space.xl,
    paddingHorizontal: theme.space['4xl'],
    /* Alt güvenli alan barın İÇİNDE, dolguyla toplanmaz (tab bar kararı 08.08 — ikisinin büyüğü);
       şablonun 24'ü ölçekte 22 ('6xl'). */
    paddingBottom: Math.max(rt.insets.bottom, theme.space['6xl']),
  },
  barGlass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
}));
