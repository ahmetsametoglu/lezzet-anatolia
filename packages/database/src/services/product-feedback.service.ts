import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  ProductFeedbackInsertSchema,
  ProductFeedbackSchema,
  ProductFeedbackUpdateSchema,
  ProductRatingSchema,
  type FeedbackContext,
  type KeysetCursor,
  type Page,
  type ProductFeedback,
  type ProductFeedbackInsert,
  type ProductFeedbackUpdate,
  type ProductRating,
  type ReviewStatus,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ürün geri bildirimi (17.1, 17.3) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * "Bu müşteri bu ürünü satın almış mı", "bu kayıt kuyruğa mı yayına mı doğar", "bu moderasyon
 * geçişi meşru mu" soruları burada DEĞİL: ilki uygulama kapısının (siparişleri okur), diğerleri
 * motorun işi (`domain-core/feedback`).
 */
export class ProductFeedbackService extends BaseDbService<ProductFeedback, ProductFeedbackInsert, ProductFeedbackUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_feedback', ProductFeedbackSchema, ProductFeedbackInsertSchema, ProductFeedbackUpdateSchema, false);
  }

  /**
   * Ürün sayfasının okuması: **yayınlanmış YAZILI yorumlar**, yeniden eskiye, keyset sayfalı.
   *
   * Yalnız metinli kayıtlar: beğeni yayınlanacak bir şey değil, sayılacak bir şeydir (skora girer).
   * "Durum" bir parametre olsaydı, bir gün müşteri yüzeyi onu yanlış geçirir ve onaylanmamış metin
   * ürün sayfasında görünürdü — bu yüzden imzada yok.
   */
  listPublishedComments(productId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<ProductFeedback>> {
    return this.getPage(
      { productId, status: 'approved' },
      { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor, isNotNullFields: ['comment'] },
    );
  }

  /** Moderasyon kuyruğu — bekleyenler, **en eski önce**: bekleyeni bekletmemek. */
  listPending(cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<ProductFeedback>> {
    return this.getPage({ status: 'pending' }, { orderBy: 'createdAt', orderDirection: 'asc', limit, keysetAfter: cursor });
  }

  /**
   * Duruma göre metinli kayıtlar — operasyonun "yayınlanmışları gör, gerekirse geri çek" listesi.
   *
   * Metinsizler süzülür: onlar hep `approved` doğar ve moderasyon ekranında görünmelerinin bir
   * anlamı yok — orada okunacak bir şey yok.
   */
  listByStatus(status: ReviewStatus, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<ProductFeedback>> {
    return this.getPage(
      { status },
      { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor, isNotNullFields: ['comment'] },
    );
  }

  /** Müşterinin bu ürüne bu bağlamdaki kaydı — varsa yeni satır değil GÜNCELLEME yapılır. */
  findByCustomerProduct(customerId: string, productId: string, context: FeedbackContext): Promise<ProductFeedback | null> {
    return this.getOneBy({ customerId, productId, context });
  }

  /** Müşterinin tüm geri bildirimleri — hesap sayfası, puan geçmişi, GDPR silme. */
  listByCustomer(customerId: string): Promise<ProductFeedback[]> {
    return this.getAll({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Verilen kimlikler TEK sorguda — keşif turunu hesaba bağlayan talep kapısının girdisi (08.7).
   *
   * Ziyaretçi kaydırmaları kimliksiz yazılıyor; tarayıcı kendi satır kimliklerini saklıyor ve giriş
   * sonrası onları getiriyor. Kimlikler tek tek okunsaydı 20 kartlık bir tur 20 sorgu ederdi.
   *
   * Kimliklerin sahipliği BURADA doğrulanmaz — çağıran her satırın gerçekten kimliksiz ve `candidate`
   * bağlamında olduğuna bakar. Servis satır getirir, kural uygulamaz (`STACK §6`).
   */
  async listByIds(ids: readonly string[]): Promise<ProductFeedback[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }

  /**
   * Keşif kaydırmaları — aday panosunun ağırlıklandırma girdisi (13.4 · 17.3), **en yeniden eskiye.**
   *
   * Ağırlık SQL'de hesaplanamaz: kaydıranın deseni tüm kaydırmalarına bakmayı ister ve kural
   * motorda yaşar (`swipeWeight`). Bu yüzden ham satırlar döner.
   *
   * **Küme sınırsız büyür.** Burada bir zamanlar "tavanı operatörün kurduğu aday listesidir" yazıyordu
   * — yanlıştı: satırlar aday başına değil KAYDIRMA başına doğar ve ziyaretçi kaydırması
   * tekilleştirilmiyor. Sıralamasız bir `limit` her turda başka bir örneklem getirir ve pano sessizce
   * yanlış sıralar. Sıralama bu yüzden belirleyicidir ve **en yeniler alınır**: "sırada hangi ürünü
   * getirelim" güncel ilgiyi sorar. Kırpıldığında çağıran bunu bilir (`rows.length === limit`) ve
   * ekrana söyler — sessiz tavan, "her şey sayıldı" gibi okunur.
   */
  listCandidateVotes(limit = 5000): Promise<ProductFeedback[]> {
    return this.getAll(
      { context: 'candidate' },
      { isNotNullFields: ['vote'], orderBy: 'createdAt', orderDirection: 'desc', limit },
    );
  }

  /** Bir davetten doğan kayıtlar — "2/5 tamamlandı" ilerlemesi buradan türetilir (17.2). */
  listByRequest(feedbackRequestId: string): Promise<ProductFeedback[]> {
    return this.getAll({ feedbackRequestId });
  }

  /**
   * **Bu ürünü isteyen, haberi HENÜZ verilmemiş müşteriler** (17.8 zemini) — "elimize geldi,
   * ister misiniz" bildiriminin alıcı listesi.
   *
   * Dört süzgecin dördü de gerekli: `candidate` (alım-sonrası beğeni bir talep beyanı değil,
   * yaşanmış deneyimdir) · `like` (geçilen ürün istenmemiştir) · kimlikli (kime haber vereceğimizi
   * bilmiyorsak liste işe yaramaz) · haberi verilmemiş (aynı sözü iki kez tutmak spam'dir).
   * Kısmi indeks bunlarla birebir (`product_feedback_awaiting_notice_idx`).
   *
   * **Tekillik zaten satırda:** `product_feedback_customer_key` (müşteri, ürün, bağlam) üzerinde
   * tekil, yani bir kişi bu listede bir kez görünür — mükerrer kaydırma burada bir sorun değildir.
   */
  listAwaitingArrivalNotice(productId: string, limit = 500): Promise<ProductFeedback[]> {
    return this.getAll(
      { productId, context: 'candidate', vote: 'like' },
      { isNotNullFields: ['customerId'], isNullFields: ['notifiedAt'], orderBy: 'createdAt', limit },
    );
  }

  /**
   * Haber verildi damgası — **toplu**, çünkü bildirim ürün başına bir turda gider.
   *
   * Damga GÖNDERİM SONRASI atılır: önce damgalayıp sonra göndermek, gönderim düşerse müşteriyi
   * kalıcı olarak sessizliğe mahkûm ederdi (bir daha listeye girmez). Tersi hâlde en kötü ihtimal
   * ikinci bir haberdir — biri kaybı, öteki fazlalığı seçer ve fazlalık geri alınabilir.
   */
  async markArrivalNotified(ids: readonly string[], at: string = new Date().toISOString()): Promise<void> {
    if (ids.length === 0) return;
    await this.updateWhereIn('id', ids, { notifiedAt: at });
  }

  /**
   * Moderasyon kararı. Damga duruma BAĞLI yazılır (DB kısıtı da zorlar). Geçişin meşruluğu ve
   * "okunacak bir şey var mı" sorusu çağırana aittir (`canModerate`).
   */
  moderate(id: string, status: Exclude<ReviewStatus, 'pending'>, moderatedBy: string): Promise<ProductFeedback> {
    return this.update({ id, status, moderatedBy, moderatedAt: new Date().toISOString() });
  }

  /** Bekleyen yorum sayısı — operasyon başlığındaki "5 yorum onay bekliyor" rozeti. */
  countPending(): Promise<number> {
    return this.count({ status: 'pending' });
  }
}

/**
 * `product_rating` görünümü — ürün skorunun **ham** sayıları (yıldız + beğeni).
 *
 * Ayrı servis, çünkü görünüm yazılmaz. Skoru yazma servisine metot olarak eklemek, bir gün "skoru
 * güncelle" diye bir yol açmanın davetiyesi olurdu — skorun yazılacak bir yeri yok.
 */
export class ProductRatingService extends BaseDbService<ProductRating, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_rating', ProductRatingSchema, ProductRatingSchema as never, ProductRatingSchema as never, false);
  }

  /** Tek ürünün ham skoru; hiç onaylı beyanı yoksa `null` (satır yoktur). */
  async getByProduct(productId: string): Promise<ProductRating | null> {
    const rows = await this.getAll({ productId }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Bir listedeki ürünlerin skorları TEK turda — katalog kartları, "benzer ürünler", operasyon
   * skor tablosu. Kart başına sorgu N+1 olurdu.
   */
  listByProducts(productIds: readonly string[]): Promise<ProductRating[]> {
    return this.getAll({ productId: [...productIds] });
  }

  /**
   * En sevilen / en sevilmeyen ürünler (operasyon skor tablosu).
   *
   * **Sıralama yıldız ortalamasına göredir, birleşik puana göre değil** — birleşik puan motorda
   * hesaplanır ve SQL onu bilmez. Ekran listeyi aldıktan sonra motorun skoruyla yeniden sıralar;
   * güven eşiği süzgeci de orada uygulanır (`confident`). Eşiği buraya gömmek, aynı kuralı iki
   * yerde tutmak olurdu.
   */
  listRanked(direction: 'asc' | 'desc', limit = 20): Promise<ProductRating[]> {
    return this.getAll(undefined, { orderBy: 'ratingAvg', orderDirection: direction, limit });
  }
}
