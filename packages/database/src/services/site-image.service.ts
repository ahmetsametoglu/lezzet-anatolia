import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SiteImageInsertSchema,
  SiteImageSchema,
  SiteImageUpdateSchema,
  type ImageCropFields,
  type SiteImage,
  type SiteImageInsert,
  type SiteImageSlot,
  type SiteImageUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sayfa görselleri (`site_image`, 09.16) — ana sayfa kahramanı, Paketler/Professionnels kahramanı,
 * boş sepet çizimi.
 *
 * **Ürün görselinden farkı sahibi:** onunki bir VARLIĞA aittir (`product.image_key`), bunlar bir
 * SAYFA YERİNE. Karşılık gelen satır yoktur — "boş sepet" diye bir varlık yok — bu yüzden künye
 * ürünün satırına yazılamaz ve kendi tablosu gerekti.
 *
 * **Boş slot = satır YOK.** Okuma haritası eksik anahtarı hiç taşımaz; ekran bugünkü yer tutucusunu
 * çizmeye devam eder. Kova boş diye sayfa kırılmaz — bu, talebin açıkça istediği davranış.
 */
export class SiteImageService extends BaseDbService<SiteImage, SiteImageInsert, SiteImageUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'site_image', SiteImageSchema, SiteImageInsertSchema, SiteImageUpdateSchema);
  }

  /**
   * Tüm slotlar — operasyonun "Vitrin görselleri" sekmesi.
   *
   * **Sayfalanmıyor ve doğru olan bu** (`CLAUDE §1`): küme veriyle değil EKRAN sayısıyla büyüyor ve
   * tavanı enum'un kendisi — bugün dört. Doğal tavanı olan küme tek turda çekilir.
   */
  listAll(): Promise<SiteImage[]> {
    return this.getAll({}, { orderBy: 'slot' });
  }

  /**
   * Slot → görsel haritası — müşteri yüzeyinin okuması.
   *
   * Harita dönmesinin sebebi çağrı sayısı: dört slot dört ayrı `getOneBy` ile okunsaydı her sayfa
   * yükleyişi dört tur ederdi. Eksik slot haritada HİÇ bulunmaz (boş değerle değil) — "yok" ile
   * "boş" aynı şey değil ve okuyan taraf ikincisini yanlışlıkla çizebilirdi.
   */
  async bySlot(): Promise<Map<SiteImageSlot, SiteImage>> {
    const rows = await this.listAll();
    return new Map(rows.map((row) => [row.slot, row]));
  }

  /** Tek slot — yalnız o sayfayı çizen okuma (ör. boş sepet). */
  getSlot(slot: SiteImageSlot): Promise<SiteImage | null> {
    return this.getOneBy({ slot });
  }

  /**
   * Slota görsel yazar — **varsa ÜZERİNE**, yoksa açar.
   *
   * `upsert` şart: iki satır olsaydı "hangisi geçerli" sorusu doğardı ve o sorunun ekranda cevabı
   * yok. Tekillik veride de duruyor (`site_image_slot_idx`); burada çakışmayı hata saymamak,
   * operatöre sebepsiz bir uyarı göstermemek için.
   *
   * Sürüm damgası dosyayla BİRLİKTE yazılır: public okuma adresi `?v=` ile sürümlenir ve anahtar
   * deterministik olduğu için (slot → aynı obje) damga olmadan yeni dosya bir yıllık `immutable`
   * cache'in arkasında kalırdı.
   */
  put(slot: SiteImageSlot, imageKey: string): Promise<SiteImage> {
    return this.upsert({ slot, imageKey, imageUpdatedAt: new Date().toISOString() }, 'slot');
  }

  /**
   * Odak/zoom yazar — dosya değişmediği için sürüm damgasına DOKUNMAZ (kırpma CSS'te uygulanır).
   * Aynı fotoğraf iki çerçeveye farklı oturduğu için (16:9 ↔ 3:2) alan burada da gerekli.
   */
  setCrop(id: string, crop: ImageCropFields): Promise<SiteImage> {
    return this.update({ id, ...crop });
  }

  /** Slotu boşaltır — ekran yer tutucusuna geri döner. Kovadaki obje ayrı silinir. */
  async clear(slot: SiteImageSlot): Promise<void> {
    await this.deleteWhere({ slot });
  }
}
