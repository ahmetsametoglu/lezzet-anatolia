import 'server-only';
import { CategoryService, ProductFeedbackService, ProductService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { imageOf } from '@lezzet/application';
import type { StorefrontImage } from '@lezzet/application';
import { countCandidateLikers } from './product-feedback';

/**
 * Keşif destesinin okuma kapısı. Aday ürün satılabilir ürün değildir: kart fiyat, stok ve varyant taşımaz ki yanlışlıkla çizilemesin.
 */

/** Kartın taşıdığı her şey — fiyat/stok/varyant YOK ve olmayacak. */
export interface DiscoverCard {
  productId: string;
  name: string;
  /** Kısa tanıtım; yoksa kart yalnız ad ve görselle durur (uydurma metin yazılmaz). */
  description: string | null;
  image: StorefrontImage;
  /** Kategori adı; ürün kategorisizse rozet çizilmez. */
  category: string | null;
  /** Kaç kişi beğendi (kimlikli, tekilleştirilmiş) — aday panosuyla aynı ölçü. */
  likedBy: number;
}

/** Deste boyu: keşif bir liste değil bir tur, bitiş ekranı akışın parçası; aday kümesini operatör kurar, tek turda çekilir. */
const DECK_SIZE = 20;

/** Girişlide daha önce oylanan kartlar elenir; ziyaretçide tekilleştirmek kimlik tutmak demek olurdu, turu yenileyen aynı kartları görür. */
export async function openDiscoverDeck(locale: Locale, customerId: string | null): Promise<DiscoverCard[]> {
  const db = serviceDb();
  const [candidates, categories] = await Promise.all([new ProductService(db).listCandidates(), new CategoryService(db).list()]);
  if (candidates.length === 0) return [];

  // Girişsizde geçmiş okuması yapılmaz: elenecek bir şey yok, boşuna sorgu ilk kartı geciktirirdi.
  const seen = customerId ? await votedProductIds(db, customerId) : new Set<string>();
  const deck = candidates.filter((p) => !seen.has(p.id)).slice(0, DECK_SIZE);
  const likers = await countCandidateLikers(deck.map((p) => p.id));
  const categoryName = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name, locale)]));

  return deck.map((p) => ({
    productId: p.id,
    name: resolveLocalizedText(p.name, locale),
    // Boş/boşluk metin YOK sayılır — boş bir paragraf kartta açıklanmamış bir boşluk bırakır.
    description: p.description ? textOrNull(resolveLocalizedText(p.description, locale)) : null,
    image: imageOf(p),
    category: p.categoryId ? (categoryName.get(p.categoryId) ?? null) : null,
    likedBy: likers.get(p.id) ?? 0,
  }));
}

/** Müşterinin daha önce kaydırdığı aday ürünler. */
async function votedProductIds(db: ReturnType<typeof serviceDb>, customerId: string): Promise<Set<string>> {
  const rows = await new ProductFeedbackService(db).listByCustomer(customerId);
  return new Set(rows.filter((r) => r.context === 'candidate').map((r) => r.productId));
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
