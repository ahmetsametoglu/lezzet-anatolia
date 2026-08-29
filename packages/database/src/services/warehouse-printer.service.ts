import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehousePrinterInsertSchema,
  WarehousePrinterSchema,
  WarehousePrinterUpdateSchema,
  type PrinterPurpose,
  type WarehousePrinter,
  type WarehousePrinterInsert,
  type WarehousePrinterUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Depo yazıcı envanteri (`warehouse_printer`, 0054) — SAF I/O.
 *
 * **Seçim burada YOK ve olmayacak:** hangi yazıcının kullanıldığı cihazın kendi bilgisidir
 * (kullanıcı kararı 29.08) ve sunucuya hiç gelmez. Bu servis yalnız "bu depoda hangi yazıcılar
 * var" sorusunu cevaplıyor.
 */
export class WarehousePrinterService extends BaseDbService<WarehousePrinter, WarehousePrinterInsert, WarehousePrinterUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'warehouse_printer', WarehousePrinterSchema, WarehousePrinterInsertSchema, WarehousePrinterUpdateSchema, false);
  }

  /**
   * Deponun yazıcıları.
   *
   * `onlyActive` varsayılan KAPALI (kutu kataloğunun aynı kararı): yönetim ekranı kapatılmış
   * yazıcıyı da göstermeli — "neden listede yok" sorusunun cevabı orada. Cihazın seçim listesi
   * ise açık geçer: kapalı bir yazıcıyı seçtirmek, sökülmüş bir cihaza basmayı denetmektir.
   */
  async listForWarehouse(
    warehouseId: string,
    opts: { purpose?: PrinterPurpose; onlyActive?: boolean } = {},
  ): Promise<WarehousePrinter[]> {
    const filters: Record<string, unknown> = { warehouseId };
    if (opts.purpose) filters.purpose = opts.purpose;
    if (opts.onlyActive) filters.isActive = true;
    return this.getAll(filters, { orderBy: 'name' });
  }
}
