import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ShippingBoxInsertSchema,
  ShippingBoxSchema,
  ShippingBoxUpdateSchema,
  type ShippingBox,
  type ShippingBoxInsert,
  type ShippingBoxUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Kargo kutusu kataloğu (`shipping_box`, 0052) — SAF I/O.
 *
 * İki küme tek tabloda yaşıyor ve okuma kapıları onları AYIRIYOR: sistem şablonları
 * (`warehouse_id null`) ve deponun kendi kutuları. Ayrımı çağırana bırakmak, bir gün süzgeci
 * unutan bir okumanın şablonları deponun listesine karıştırması demekti — ve şablon seçilemez
 * olduğu için o liste, tıklanınca reddedilen satırlar gösterirdi.
 */
export class ShippingBoxService extends BaseDbService<ShippingBox, ShippingBoxInsert, ShippingBoxUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'shipping_box', ShippingBoxSchema, ShippingBoxInsertSchema, ShippingBoxUpdateSchema, false);
  }

  /**
   * Deponun kutu listesi — kutu seçicinin ve Depolar ekranının okuması.
   *
   * `onlyActive` varsayılan olarak KAPALI: yönetim ekranı kapatılmış kutuyu da göstermeli
   * ("neden listede yok" sorusunun cevabı orada). Kutu SEÇİCİSİ ise açık geçer — kapalı bir
   * kutuyu seçtirmek, olmayan bir kutuya gönderi hazırlatmaktır.
   */
  async listForWarehouse(warehouseId: string, opts: { onlyActive?: boolean } = {}): Promise<ShippingBox[]> {
    const filters = opts.onlyActive ? { warehouseId, isActive: true } : { warehouseId };
    return this.getAll(filters, { orderBy: 'sortOrder' });
  }

  /**
   * Sistem şablonları — depo listesine EKLENECEK adaylar. Doğrudan seçilemezler (bileşik FK
   * reddeder); `adopt` ile kopyalanırlar.
   */
  async listTemplates(): Promise<ShippingBox[]> {
    const { data, error } = await this.supabase
      .from('shipping_box')
      .select('*')
      .is('warehouse_id', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return this.parseRows(data ?? []);
  }

  /**
   * **ŞABLONU BENİMSE — bağlama değil KOPYALAMA** (kullanıcı kararı 28.08).
   *
   * Depo şablonu kendi satırı olarak alır. Üç karşılığı var ve üçü de bağlama modelinde yoktu:
   * depo kutuyu bırakabilir (başkasını etkilemeden), şablon düzeltmesi fiziksel kutuyu
   * değiştirmez, ve depo ölçüyü kendi gerçeğine göre düzeltebilir.
   *
   * Aynı adın ikinci kez benimsenmesi veritabanınca reddedilir (`shipping_box_name_uq`) —
   * operatöre "bu kutu listenizde zaten var" demek, sessizce ikinci bir kopya açmaktan iyidir.
   */
  async adopt(warehouseId: string, templateId: string): Promise<ShippingBox> {
    const template = await this.getById(templateId);
    if (!template) throw new Error(`Kargo kutusu şablonu bulunamadı (${templateId})`);
    if (template.warehouseId !== null) {
      throw new Error('Bu kayıt bir şablon değil, bir deponun kendi kutusu — benimsenemez.');
    }
    const mevcut = await this.listForWarehouse(warehouseId);
    return this.insert({
      warehouseId,
      name: template.name,
      lengthMm: template.lengthMm,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      tareG: template.tareG,
      maxContentG: template.maxContentG,
      // Sıra listenin SONUNA: benimsenen kutu en yeni, operatörün sıralaması onun kararı.
      sortOrder: mevcut.length,
    });
  }

  /** Kutu kapatılır/açılır — silinmez. Kapalı kutu geçmiş gönderilerde referans olarak yaşar. */
  async setActive(id: string, isActive: boolean): Promise<ShippingBox> {
    return this.update({ id, isActive });
  }

  /**
   * Kutu tipini siler ve bağlı gönderi yüzünden reddedilirse hatayı OKUNABİLİR hâle getirir.
   *
   * `restrict` doğru: ölçü, o gönderinin faturasının dayanağıdır ve silinirse geçmiş bir kargo
   * bedelinin nereden çıktığı cevapsız kalır. Engel doğru; ham FK hatasının operatörün ekranına
   * düşmesi değil (`ProductVariantService.deleteVariant` ile aynı çizgi).
   */
  async deleteBox(id: string): Promise<void> {
    try {
      await this.delete(id);
    } catch (err) {
      const raw = err instanceof Error ? err.message : JSON.stringify(err ?? '');
      if (!/foreign key|violates/i.test(raw)) throw err;
      throw new Error(
        'Bu kutu silinemedi: onunla gönderilmiş sipariş kutusu var. Gerçekleşmiş bir gönderinin ' +
          'ölçüsü silinemez — listeden kaldırmak için "Aktif" anahtarını kapatın.',
      );
    }
  }
}
