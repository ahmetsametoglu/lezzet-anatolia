import { z } from 'zod';

/**
 * DEPO YAZICISI (07.12 · `0054_warehouse_printer.sql`).
 *
 * **Envanter DEPONUN, seçim CİHAZIN** (kullanıcı kararı 29.08). Bu şema envanterin şeklidir;
 * hangi yazıcının kullanıldığı telefonun yerel deposunda yaşar ve sunucuya hiç gelmez — aynı
 * depodaki iki telefon iki ayrı yazıcıya basabilir ve bu meşrudur (biri rampada, biri masada).
 */
export const PrinterPurposeEnum = z.enum(['box', 'shipping']);
export type PrinterPurpose = z.infer<typeof PrinterPurposeEnum>;

export const WarehousePrinterSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  /**
   * Operatörün listede gördüğü ad ("Rampa · QL-1110"). Adres teknik kimlik, bu İNSAN kimliği:
   * iki yazıcı arasında seçim yapan depocu `192.168.1.90` ile `.91`i ayırt edemez.
   */
  name: z.string().min(1),
  /**
   * Hangi İŞ. `box` bizim QR'lı kutu etiketimiz (4×6), `shipping` taşıyıcının A6 etiketi.
   * Kargo kulvarında ikisi AYNI kutuya basılmaz (tasarım §4.6) — ayrım fiziksel, kozmetik değil.
   */
  purpose: PrinterPurposeEnum,
  address: z.string().min(1),
  model: z.string().min(1),
  /** Takılı kâğıt. SDK'dan OKUNAMIYOR (23.5 ölçümü); yanlış boy `SetLabelSizeError` döndürüyor. */
  labelSize: z.string().min(1),
  /** Yazıcı silinmez, kapatılır: cihazların seçimi kimliğe bağlı ve silme onu sessizce düşürürdü. */
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type WarehousePrinter = z.infer<typeof WarehousePrinterSchema>;

export const WarehousePrinterInsertSchema = WarehousePrinterSchema.omit({ id: true, createdAt: true }).partial({
  isActive: true,
});
export type WarehousePrinterInsert = z.infer<typeof WarehousePrinterInsertSchema>;

export const WarehousePrinterUpdateSchema = WarehousePrinterSchema.partial().required({ id: true });
export type WarehousePrinterUpdate = z.infer<typeof WarehousePrinterUpdateSchema>;
