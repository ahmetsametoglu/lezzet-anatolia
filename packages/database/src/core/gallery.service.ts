import type { SupabaseClient } from '@supabase/supabase-js';
import type { GalleryImage, ImageCropFields } from '@lezzet/types';
import type { ZodType, ZodTypeDef } from 'zod';
import { BaseDbService } from './base.service';

/**
 * Bir varlığa asılı FOTOĞRAF LİSTESİ — `product_image` ve `category_image` (05.23) ortak tabanı.
 *
 * İki tablo aynı dört soruyu soruyor: *listesi ne, sonuna ekle, kırpmasını yaz, sırasını değiştir.*
 * Ayrı yazıldıklarında dördü de kelimesi kelimesine tekrar ederdi (`CLAUDE §1` — no-duplication) ve
 * tekrarın bedeli görünürdü: `add`, sıra numarasını mevcut sayıdan türetiyor; iki nüshadan birinde
 * bu unutulsaydı o galerinin bütün satırları `sort_order = 0` ile doğar, sıra da belirsiz olurdu.
 *
 * Ayrışan tek şey fotoğrafın hangi varlığa asıldığıdır ve o da **bir kolon adından ibaret** →
 * constructor'da alınır. Şemalar yine alt sınıfın: tipler ayrı kalır, davranış ortaklaşır.
 */
export abstract class GalleryDbService<TDb extends GalleryImage, TInsert, TUpdate> extends BaseDbService<
  TDb,
  TInsert,
  TUpdate
> {
  constructor(
    supabase: SupabaseClient,
    tableName: string,
    /** Sahibi gösteren alan — **app tarafı yazımıyla** (`productId`, `categoryId`), `embeds` deseni. */
    protected readonly parentField: string,
    dbSchema: ZodType<TDb, ZodTypeDef, unknown>,
    insertSchema: ZodType<TInsert, ZodTypeDef, unknown>,
    updateSchema: ZodType<TUpdate, ZodTypeDef, unknown>,
  ) {
    super(supabase, tableName, dbSchema, insertSchema, updateSchema);
  }

  /**
   * Bir varlığın fotoğrafları, operatörün dizdiği sırada.
   *
   * Dizi de kabul eder ve TEK sorguya döner (`in`) — vitrin altı kategorinin havuzunu birden ister,
   * kart başına tur atmasın (`STACK §13`). Boş dizi sorgu bile açmaz.
   */
  protected listByParent(parentId: string | readonly string[]): Promise<TDb[]> {
    return this.getAll({ [this.parentField]: parentId }, { orderBy: 'sortOrder' });
  }

  /**
   * Yeni fotoğrafı listenin SONUNA ekler (yükleme sırası = ilk sıra beklentisi). Sürüm damgası
   * dosyayla birlikte yazılır — public okuma URL'i `?v=` ile sürümlenir (bkz. `publicImageUrl`).
   *
   * Tek `as` burada ve gerekçesi dar: sahip alanının ADI çalışma anında biliniyor (constructor),
   * tip düzeyinde değil. Yanlış bir ad sessiz kalmaz — `insert` girdiyi `insertSchema` ile
   * doğruluyor ve tanımadığı bir alan orada patlar.
   */
  protected async addPhoto(parentId: string, imageKey: string): Promise<TDb> {
    const sortOrder = await this.count({ [this.parentField]: parentId });
    return this.insert({
      [this.parentField]: parentId,
      imageKey,
      sortOrder,
      imageUpdatedAt: new Date().toISOString(),
    } as TInsert);
  }

  /** Odak/zoom yazar — dosya değişmediği için sürüm damgasına DOKUNMAZ (kırpma CSS'te uygulanır). */
  setCrop(id: string, crop: ImageCropFields): Promise<TDb> {
    return this.update({ id, ...crop } as TUpdate);
  }

  /** Sürükle-bırak sırası: verilen id dizisine göre sortOrder'ı 0..n-1 yazar. */
  reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
