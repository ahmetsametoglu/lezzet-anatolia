import 'server-only';
import { ProductRatingService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import {
  resolveLocalizedText,
  type KeysetCursor,
  type Page,
  type ProductComplaintSignal,
  type ProductFeedback,
  type ReviewStatus,
} from '@lezzet/types';
import { productScoreOf, type CandidateSignal, type ProductScore } from '@lezzet/domain-core';
import { getProductComplaintSignals } from '../ticket/read';
import { getProductSignals, listReviewsForModeration } from './product-feedback';

/**
 * MODERASYON KUYRUĞUNUN OKUMA KAPISI (17.1) — ham yorum satırı + ürün ve müşteri ADI.
 *
 * `listReviewsForModeration` çıplak `ProductFeedback` döndürüyor: `productId`, `customerId`. Ama
 * moderasyon kararı kimliklerle verilemez — operatör *"Fıstıklı Baklava'ya gelen bu yorumu
 * yayınlayayım mı"* diye düşünür, `a3f1…` diye değil. Çizim de ikisini kartın en üstüne koyuyor.
 *
 * **Adlar TOPLU çözülür, satır satır DEĞİL.** Sayfa başına 20 kayıt için 40 ayrı sorgu (her satırda
 * bir ürün + bir müşteri) klasik N+1 olurdu; burada kimlikler tekilleştirilip iki sorguya iniyor.
 * Kuyruk keyset ile sayfalandığı için bu sayı sayfa boyuyla sınırlı kalır, kuyruk büyüse de artmaz.
 *
 * **Adsız kalan satır DÜŞMEZ.** Silinmiş bir ürünün ya da hesabını kapatmış bir müşterinin yorumu
 * hâlâ moderasyon bekliyor olabilir; satırı gizlemek onu sonsuza dek kuyrukta bırakırdı — görünmez
 * ama sayaçta duran bir iş. Ad çözülemezse yerine kimliğin kısası yazılır ve karar yine verilebilir.
 */

export interface ModerationRowView {
  review: ProductFeedback;
  /** Ürünün operasyon dilindeki adı; ürün silinmişse kimliğin kısası. */
  productName: string;
  /**
   * Yorumu yazan. `null` = kimliksiz kayıt — moderasyon kuyruğunda beklenmez (metin yalnız satın
   * alandan gelir) ama tip yalan söylemesin: kolon nullable ve bir gün ziyaretçi metni gelirse
   * ekran "bilinmiyor" demeli, boş bir ad değil.
   */
  customerName: string | null;
}

export async function listModerationQueue(
  status: ReviewStatus,
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<ModerationRowView>> {
  const page = await listReviewsForModeration(status, cursor, limit);
  if (page.rows.length === 0) return { rows: [], nextCursor: page.nextCursor };

  const productIds = [...new Set(page.rows.map((r) => r.productId))];
  const customerIds = [...new Set(page.rows.flatMap((r) => (r.customerId ? [r.customerId] : [])))];

  const db = serviceDb();
  const [products, customers] = await Promise.all([
    new ProductService(db).listByIds(productIds),
    customerIds.length > 0 ? new UserProfileService(db).listByIds(customerIds) : Promise.resolve([]),
  ]);

  // Ad KANONİK sırayla çözülür (`resolveLocalizedText` parametresiz → TR → FR → DE) — operasyon
  // yüzeyinin geri kalanı da böyle okuyor (Fiyatlar, Stok). Buraya `DEFAULT_LOCALE` geçmek cazipti
  // ama o sabit `'fr'`: müşteri yüzeyinin varsayılanı, personelin değil. Yüzey Türkçe (CLAUDE.md §2)
  // ve çizim de ürünleri Türkçe adıyla gösteriyor.
  const productName = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));
  const customerName = new Map(customers.map((c) => [c.id, c.name || c.phone || c.email || '']));

  return {
    rows: page.rows.map((review) => ({
      review,
      productName: productName.get(review.productId) || review.productId.slice(0, 8),
      customerName: review.customerId ? customerName.get(review.customerId) || review.customerId.slice(0, 8) : null,
    })),
    nextCursor: page.nextCursor,
  };
}

/**
 * SKOR TABLOSUNUN OKUMA KAPISI (17.1) — "en sevilen / en sevilmeyen" ürünler.
 *
 * Sıralamayı DB yapıyor (`listRanked`, `product_rating` görünümü üstünde) ama **yıldız
 * ortalamasına göre**; ekranda gösterilen birleşik skor ise motorda hesaplanıyor
 * (`productScoreOf`: yıldız + beğeni oranı, sayı-ağırlıklı). İkisi aynı şey değil, o yüzden liste
 * alındıktan sonra motorun skoruyla YENİDEN sıralanıyor. Servisin künyesi de bunu söylüyor.
 *
 * **Skoru olmayan ürün listede YOKTUR** ve bu görünümün kendi kararı: `product_rating` yalnız
 * onaylı beyanı olan ürün için satır üretiyor. Doğrusu da bu — hakkında hiç yorum/beğeni olmayan bir
 * ürün ne "sevilen" ne "sevilmeyen"dir, listenin iki ucundan birine konsa yanlış okunurdu.
 */
export interface ScoreRowView {
  productId: string;
  productName: string;
  score: ProductScore;
  /**
   * **Bu sevgiye ne kadar güvenelim** (`trust` 0–1) — skorun cevaplamadığı ikinci soru
   * (`DOMAIN §14`). `score.confident` "yeterince kişi konuştu mu"yu, bu "konuşanlar ayırt ediyor
   * mu"yu söyler: kart süresi × kaydıranın deseni. Çizimin üç hâlli `Sinyal` kolonundaki
   * "Düşük güven" budur.
   *
   * Hiç oy yoksa `null` — sıfır DEĞİL: "güven ölçülemedi" ile "güvenilmez" ayrı şeyler
   * (`CLAUDE §1`).
   */
  signal: CandidateSignal | null;
  /**
   * Ürüne bağlı şikâyet yoğunluğu (16.6). Skorun YANINDA okunur: "çok beğenilmiş ama bozuk
   * geliyor" ile "az beğenilmiş ama şikâyeti de yok" iki ayrı durumdur ve tek başına skor ikisini
   * ayıramaz. Şikâyeti olmayan üründe `null`.
   */
  complaints: ProductComplaintSignal | null;
}

export async function listRankedScores(direction: 'asc' | 'desc', limit = 20, since?: string): Promise<ScoreRowView[]> {
  const db = serviceDb();
  const rows = await new ProductRatingService(db).listRanked(direction, limit);
  if (rows.length === 0) return [];

  const productIds = rows.map((r) => r.productId);
  // Üç okuma PARALEL ve hepsi TOPLU: satır başına sorgu, 20 satırlık tabloda 60 gidiş-dönüş demekti
  // (aynı gerekçe adların toplu çözülmesinde de yazılı).
  const [products, signals, complaints] = await Promise.all([
    new ProductService(db).listByIds(productIds),
    getProductSignals(productIds, since),
    getProductComplaintSignals(productIds, since),
  ]);
  const names = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));

  return rows
    .map((row) => ({
      productId: row.productId,
      productName: names.get(row.productId) || row.productId.slice(0, 8),
      score: productScoreOf(row),
      signal: signals.get(row.productId) ?? null,
      complaints: complaints.get(row.productId) ?? null,
    }))
    .sort((a, b) => (direction === 'desc' ? (b.score.average ?? 0) - (a.score.average ?? 0) : (a.score.average ?? 0) - (b.score.average ?? 0)));
}
