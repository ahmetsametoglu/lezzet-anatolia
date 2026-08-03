import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehouseSchema,
  WarehouseInsertSchema,
  WarehouseUpdateSchema,
  type Warehouse,
  type WarehouseInsert,
  type WarehouseUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Depo servisi (19.1) — DOMAIN §17.
 *
 * **Karar vermez, satır getirir.** "Bu posta kodu hangi depoya düşer", "bu personel hangi depoyu
 * görür" kararları saf motordadır (`domain-core/warehouse`); servis depoları getirir.
 *
 * VARSAYILAN DEPO KAVRAMI YOKTUR (C2) — bu yüzden burada `getDefault()` gibi bir uç de yoktur.
 * Depo daima açık bir kaynaktan gelir: adresin posta kodu ya da personelin sabit deposu.
 */
export class WarehouseService extends BaseDbService<Warehouse, WarehouseInsert, WarehouseUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'warehouse', WarehouseSchema, WarehouseInsertSchema, WarehouseUpdateSchema);
  }

  /**
   * Tüm depolar (admin) ya da yalnız aktifler (operasyon seçicisi). Operatörün sırası, eşitlikte kod.
   *
   * `warehouseIds` = personelin kapsamı: verilmezse süzgeç yok (admin), verilirse yalnız o depolar,
   * boş dizi ise **hiçbiri** — kapsam dışı depo hiçbir seçicide ve süzgeçte seçenek olarak var
   * olmamalı (görüp de seçememek değil, hiç görmemek).
   *
   * Kapsam buraya **dizi** olarak girer, `WarehouseScope` motor tipi olarak DEĞİL: `domain-core`
   * (saf karar) ile `database` (saf I/O) birbirini bilmez (`STACK §4`) ve `boundaries` lint'i o
   * bağımlılığı geçirmez. Kapsamı diziye çeviren tek yer uygulama katmanındaki bağlam kapısıdır.
   */
  list(opts: { activeOnly?: boolean; warehouseIds?: readonly string[] } = {}): Promise<Warehouse[]> {
    if (opts.warehouseIds?.length === 0) return Promise.resolve([]);
    const filters: Record<string, unknown> = {};
    if (opts.activeOnly) filters.isActive = true;
    if (opts.warehouseIds) filters.id = [...opts.warehouseIds];
    return this.getAll(Object.keys(filters).length > 0 ? filters : undefined, { orderBy: 'sort_order' });
  }

  /** Belge önekinin ve ekranın okuduğu kısa kod ('STR'). */
  getByCode(code: string): Promise<Warehouse | null> {
    return this.getOneBy({ code });
  }

  /**
   * Kargo çıkış deposu — bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu buradan gider.
   *
   * Ülke başına EN FAZLA BİR aktif tane vardır (kural veritabanında, kısmi unique indeks) — bu
   * yüzden "seçim algoritması" yok, tek satır okunuyor. `null` dönmesi gerçek bir arızadır:
   * kargo deposu tanımlı değilse bölge dışına satış yapılamaz ve bunu çağıran AÇIKÇA söylemeli,
   * sessizce boş listeye düşmemeli.
   */
  getShippingWarehouse(country: Warehouse['countryCode']): Promise<Warehouse | null> {
    return this.getOneBy({ countryCode: country, shipsOnline: true, isActive: true });
  }

  /**
   * Aktif depoların ülke kümesi — ülke seçicisinin görünüp görünmeyeceği BURADAN türer (C11):
   * küme 1'i aşmadıkça seçici gösterilmez. Ayar değil veri; yeni ülke depo açılınca kendiliğinden
   * belirir, kimsenin bir bayrağı açması gerekmez.
   */
  async listActiveCountries(): Promise<Warehouse['countryCode'][]> {
    const rows = await this.getAll({ isActive: true });
    return [...new Set(rows.map((w) => w.countryCode))];
  }

  /**
   * Sürükle-bırak sıralamasının TEK turu (`reorderBy`, `category`/`collection`/`bundle` ile aynı).
   *
   * Depo sırası önemsiz bir tercih değil: sistemdeki **bütün** depo seçicileri bu sırayı okur
   * (bağlam seçicisi, tablo süzgeci, transfer hedefi). Satır satır `update` atmak listeyi geçici
   * olarak yarı sıralı bırakır — aradaki bir okuma iki depoyu aynı sırada görür.
   */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
