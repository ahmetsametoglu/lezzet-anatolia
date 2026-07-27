import { CategorySchema, DEFAULT_CROP_FIELDS, ProductSchema } from '@lezzet/types';
import type { ImageMeta } from '@lezzet/types';

/**
 * Vitrin fixture'ları — kaynağı HENÜZ OLMAYAN bölümler için (08.10): fırsatlar (05.6 indirim
 * tanımı) ve paketler (05.5 Bundle servisi). Ürün, fiyat ve stok artık GERÇEK okunuyor; onların
 * fixture'ları düştü.
 *
 * Kategoriler yalnız katalog tamamen boşken (seed atılmamış yerel ortam) yedeğe düşer.
 *
 * KURAL: veriler elle yazılmış nesne DEĞİL, şemadan `parse` edilir. Alan adı uydurmak ya da tip
 * kaydırmak böylece imkânsızlaşır — şema değişirse fixture derleme/çalışma anında patlar, sessizce
 * sapmaz. `pick` ile yalnız vitrinin kullandığı alanlar doğrulanır (tam satır kurmak fixture'ı
 * okunmaz yapardı); doğrulanan alanların ADI ve TİPİ şemanın kendisinden gelir.
 *
 * Görsel: fixture'da anahtar yok → kartlar placeholder gösterir. Gerçek görseller R2'de, gerçek
 * katalog yolunda gelir (05.11).
 */

const CategoryFixture = CategorySchema.pick({ id: true, slug: true, name: true });
const ProductFixture = ProductSchema.pick({ id: true, slug: true, name: true });

// Sabit UUID'ler — fixture'ın kimliği koşudan koşuya değişmesin (React anahtarları sabit kalır).
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Görselsiz künye — fixture satırları gerçek satırlarla AYNI şekli taşısın diye. Böylece okuma
 * katmanı "fixture mı, gerçek mi" ayrımı yapmaz; tek indirgeme her ikisine uyar. Odak/zoom
 * varsayılanı elle yazılmaz, `DEFAULT_CROP_FIELDS`'ten gelir (tek kaynak).
 */
export const NO_IMAGE_META: ImageMeta = { imageKey: null, imageAlt: null, imageUpdatedAt: null, ...DEFAULT_CROP_FIELDS };

export const FIXTURE_CATEGORIES = [
  { id: uuid(1), slug: 'borekler', name: { tr: 'Börekler', fr: 'Böreks', de: 'Böreks' } },
  { id: uuid(2), slug: 'manti-hamur', name: { tr: 'Mantı & Hamur İşi', fr: 'Mantı & pâtes', de: 'Mantı & Teigwaren' } },
  { id: uuid(3), slug: 'tatlilar', name: { tr: 'Tatlılar', fr: 'Desserts', de: 'Süßspeisen' } },
  { id: uuid(4), slug: 'kebap-kofte', name: { tr: 'Kebap & Köfte', fr: 'Kebab & boulettes', de: 'Kebab & Frikadellen' } },
  { id: uuid(5), slug: 'cerezler', name: { tr: 'Çerezler', fr: 'Fruits secs', de: 'Knabbereien' } },
  { id: uuid(6), slug: 'sebze-dolma', name: { tr: 'Sebze & Dolma', fr: 'Légumes & dolma', de: 'Gemüse & Dolma' } },
].map((c) => ({ ...CategoryFixture.parse(c), ...NO_IMAGE_META }));

/** İndirimli teklifler — STUB(08.10 → 05.6 indirim tanımı). Sebep taşınmaz, yalnız fiyat ve sınır. */
export const FIXTURE_OFFERS = [
  {
    product: { id: uuid(21), slug: 'ispanakli-gozleme', name: { tr: 'Ispanaklı Gözleme', fr: 'Gözleme aux épinards', de: 'Gözleme mit Spinat' } },
    unitLabel: '4 adet',
    comparisonCents: 1475,
    priceCents: 590,
    wasCents: 790,
    limitPerCustomer: 5,
  },
  {
    product: { id: uuid(22), slug: 'cevizli-sucuk', name: { tr: 'Cevizli Sucuk Tatlısı', fr: 'Sucuk aux noix', de: 'Walnuss-Sucuk' } },
    unitLabel: '400 g',
    comparisonCents: 1625,
    priceCents: 650,
    wasCents: 890,
    limitPerCustomer: 3,
  },
  {
    product: { id: uuid(23), slug: 'yaprak-sarma', name: { tr: 'Yaprak Sarma', fr: 'Feuilles de vigne farcies', de: 'Gefüllte Weinblätter' } },
    unitLabel: '1 kg',
    comparisonCents: 990,
    priceCents: 990,
    wasCents: 1250,
    limitPerCustomer: 4,
  },
].map((o) => ({ ...o, product: { ...ProductFixture.parse(o.product), ...NO_IMAGE_META } }));

/** Paketler — STUB(08.10 → 05.5 Bundle servisi). Model henüz yok, şema doğrulaması uygulanamıyor. */
export const FIXTURE_PACKAGES = [
  {
    id: uuid(31),
    slug: 'bayram-sofrasi',
    name: { tr: 'Bayram Sofrası', fr: 'Table de fête', de: 'Festtafel' },
    description: {
      tr: 'Baklava, börek, sarma ve daha fazlası — 6 kişilik hazır bayram sofrası.',
      fr: 'Baklava, börek, feuilles de vigne et plus — table de fête prête pour 6 personnes.',
      de: 'Baklava, Börek, Weinblätter und mehr — fertige Festtafel für 6 Personen.',
    },
    itemCount: 8,
    priceCents: 4990,
  },
  {
    id: uuid(32),
    slug: 'kahvalti-keyfi',
    name: { tr: 'Kahvaltı Keyfi', fr: 'Plaisir du petit-déjeuner', de: 'Frühstücksgenuss' },
    description: {
      tr: 'Hafta sonu kahvaltısı için gözleme, pişi ve ev tadında eşlikçiler.',
      fr: 'Gözleme, pişi et accompagnements maison pour le brunch du week-end.',
      de: 'Gözleme, Pişi und hausgemachte Beilagen für das Wochenendfrühstück.',
    },
    itemCount: 5,
    priceCents: 2490,
  },
];
