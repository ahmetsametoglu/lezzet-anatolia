import { CategorySchema, DEFAULT_CROP_FIELDS } from '@lezzet/types';
import type { ImageMeta } from '@lezzet/types';

/**
 * Vitrin fixture'ları — geriye TEK yedek kaldı: kategoriler. Ürün, fiyat, stok, fırsatlar ve
 * (05.5 ile) paketler artık GERÇEK okunuyor; onların fixture'ları düştü.
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

// Sabit UUID'ler — fixture'ın kimliği koşudan koşuya değişmesin (React anahtarları sabit kalır).
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Görselsiz künye — fixture satırları gerçek satırlarla AYNI şekli taşısın diye. Böylece okuma
 * katmanı "fixture mı, gerçek mi" ayrımı yapmaz; tek indirgeme her ikisine uyar. Odak/zoom
 * varsayılanı elle yazılmaz, `DEFAULT_CROP_FIELDS`'ten gelir (tek kaynak).
 */
const NO_IMAGE_META: ImageMeta = { imageKey: null, imageAlt: null, imageUpdatedAt: null, ...DEFAULT_CROP_FIELDS };

export const FIXTURE_CATEGORIES = [
  { id: uuid(1), slug: 'borekler', name: { tr: 'Börekler', fr: 'Böreks', de: 'Böreks' } },
  { id: uuid(2), slug: 'manti-hamur', name: { tr: 'Mantı & Hamur İşi', fr: 'Mantı & pâtes', de: 'Mantı & Teigwaren' } },
  { id: uuid(3), slug: 'tatlilar', name: { tr: 'Tatlılar', fr: 'Desserts', de: 'Süßspeisen' } },
  { id: uuid(4), slug: 'kebap-kofte', name: { tr: 'Kebap & Köfte', fr: 'Kebab & boulettes', de: 'Kebab & Frikadellen' } },
  { id: uuid(5), slug: 'cerezler', name: { tr: 'Çerezler', fr: 'Fruits secs', de: 'Knabbereien' } },
  { id: uuid(6), slug: 'sebze-dolma', name: { tr: 'Sebze & Dolma', fr: 'Légumes & dolma', de: 'Gemüse & Dolma' } },
].map((c) => ({ ...CategoryFixture.parse(c), ...NO_IMAGE_META }));
