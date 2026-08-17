import type { SupabaseClient } from '@supabase/supabase-js';
import {
  StorageAreaSchema,
  StorageAreaInsertSchema,
  StorageAreaUpdateSchema,
  VehicleSchema,
  VehicleInsertSchema,
  VehicleUpdateSchema,
  type StorageArea,
  type StorageAreaInsert,
  type StorageAreaUpdate,
  type Vehicle,
  type VehicleInsert,
  type VehicleUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Ölçüm noktaları (19.28) — soğuk zincirin iki fiziksel yeri: depodaki **alan** ve yoldaki **araç**.
 *
 * İki servis tek dosyada duruyor çünkü tek bir soruya hizmet ediyorlar ("bugün hangi noktalar
 * ölçülmeli"); ama iki AYRI sınıf, çünkü tabloları da ayrı — zorunlulukları farklı (`0045` künyesi).
 * Karar vermezler, satır getirirler: "bu nokta bugün ölçüldü mü" kararı okuyan ekranın işi.
 */
export class StorageAreaService extends BaseDbService<StorageArea, StorageAreaInsert, StorageAreaUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'storage_area', StorageAreaSchema, StorageAreaInsertSchema, StorageAreaUpdateSchema);
  }

  /**
   * Bir tesisin alanları — operatörün sırası, eşitlikte ad.
   *
   * **Depo süzgeci ZORUNLU ve bu bir kolaylık değil kural** (`CLAUDE §1`, depo bir boyut değil
   * değişmezdir): "Dolap 1" iki depoda da vardır, süzgeci unutulan bir okuma tek depolu veride
   * doğru cevap verir ve çok depoda depocuya öteki tesisin dolabını ölçtürür.
   */
  listByWarehouse(warehouseId: string, opts: { activeOnly?: boolean } = {}): Promise<StorageArea[]> {
    const filters: Record<string, unknown> = { warehouseId };
    if (opts.activeOnly) filters.isActive = true;
    return this.getAll(filters, { orderBy: 'sort_order' });
  }

  /**
   * Birden çok tesisin alanları tek turda — kapsamı çok depolu personelin ekranı için.
   *
   * Boş kapsam **boş dizi** döner, süzgeçsiz okuma DEĞİL: `undefined` süzgeç "hepsi" demektir ve
   * kapsamsız bir kişiye tüm ağın noktalarını gösterirdi (`readWarehouseContext` sözleşmesi).
   */
  listByWarehouses(warehouseIds: readonly string[], opts: { activeOnly?: boolean } = {}): Promise<StorageArea[]> {
    if (warehouseIds.length === 0) return Promise.resolve([]);
    const filters: Record<string, unknown> = { warehouseId: [...warehouseIds] };
    if (opts.activeOnly) filters.isActive = true;
    return this.getAll(filters, { orderBy: 'sort_order' });
  }

  /**
   * Kimlikle okuma — yazma kapılarının doğrulaması ("bu alan gerçekten var mı, türü ne").
   *
   * **Pasif alan da GELİR:** kapı "bu kayıt ne" diye soruyor, "seçilebilir mi" diye değil; ikincisi
   * çağıranın kararı. Süzseydik pasife alınmış bir alandaki partinin uyarısı sessizce kaybolurdu.
   */
  listByIds(ids: readonly string[]): Promise<StorageArea[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.getAll({ id: [...ids] });
  }
}

/**
 * Araç — plaka + künye. `warehouseId` nullable ve **hiçbir yerde zorlanmıyor**: aidiyet değil adres
 * ("genelde buradan yükler"). Kurye günü ve gün kapanışı kurye/gün ekseninde kalır (`DOMAIN §7`).
 */
export class VehicleService extends BaseDbService<Vehicle, VehicleInsert, VehicleUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'vehicle', VehicleSchema, VehicleInsertSchema, VehicleUpdateSchema);
  }

  /**
   * Araçlar. `warehouseId` verilirse yalnız o tesise künyelenmiş olanlar.
   *
   * **Süzgeç opsiyonel ve alanınkinden farkı kasıtlı:** araç bir depoya AİT değil; depo-üstü okuma
   * burada meşru bir sorudur ("filoda kaç araç var"), alanda değildi.
   */
  list(opts: { warehouseId?: string; activeOnly?: boolean } = {}): Promise<Vehicle[]> {
    const filters: Record<string, unknown> = {};
    if (opts.warehouseId) filters.warehouseId = opts.warehouseId;
    if (opts.activeOnly) filters.isActive = true;
    return this.getAll(Object.keys(filters).length > 0 ? filters : undefined, { orderBy: 'sort_order' });
  }
}
