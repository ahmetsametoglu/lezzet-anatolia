import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';

// TemperatureLog — hijyen denetiminin ilk istediği veri. Sensör yok, elle giriş (DOMAIN §4).
//
// Bu şema `stock-adjustment.schema.ts`'in içinde duruyordu ve orada durmasının bir sebebi yoktu:
// migration tarafındaki "aile içi birleştirme" (02.11) tesadüfen tipleri de aynı dosyaya toplamıştı.
// Defter işi (06.14) o dosyayı zaten söktü; sıcaklık kaydı kendi evine taşındı.

export const TemperatureLogSchema = z.object({
  id: z.string().uuid(),
  /**
   * Hangi TESİS (DOMAIN §17) — hijyen denetimi tesis bazındadır, denetmen bir depoya gelir ve o
   * deponun kayıtlarını ister. Araç kaydı da bir depoya yazılır (aracın çıktığı depo): araçlar
   * depoya bağlanmaz (K8) ama soğuk zincir kaydı sahipsiz kalamaz.
   */
  warehouseId: z.string().uuid(),
  /**
   * ÖLÇÜM NOKTASI — ikisinden **tam biri** dolu (`temperature_log_one_point`, `0045`).
   *
   * Önce tek bir `location` serbest metniydi ve hem dolap adını hem araç plakasını taşıyordu.
   * Yazım farkı (`Dolap 1` ≠ `Dolap-1`) geçmişi bölüyor, sapma uyarısını sessizce işlevsizleştiriyor
   * ve en ağırı **ölçülmeyeni gizliyordu**: var olduğu bilinmeyen bir noktanın eksik ölçümü de
   * bilinemez. Tanımlı kayda geçince "bugün ölçülmedi" cümlesi kurulabilir oldu (19.28).
   */
  storageAreaId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  temperatureC: dbNumeric,
  recordedBy: z.string().uuid().nullable(),
  recordedAt: z.string(),
});
export type TemperatureLog = z.infer<typeof TemperatureLogSchema>;

/**
 * Yazma sözleşmesi kısıtı ŞEMADA da taşıyor (`superRefine`): veritabanı zaten reddediyor ama
 * reddin okunur hâli burada doğuyor — çağıran "kısıt ihlali" değil "nokta seçilmedi" görsün.
 */
export const TemperatureLogInsertSchema = z
  .object({
    warehouseId: z.string().uuid(),
    storageAreaId: z.string().uuid().nullish(),
    vehicleId: z.string().uuid().nullish(),
    temperatureC: z.number(),
    recordedBy: z.string().uuid().nullish(),
    recordedAt: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const filled = [value.storageAreaId, value.vehicleId].filter((id) => id != null).length;
    if (filled === 1) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['storageAreaId'],
      message: filled === 0 ? 'Ölçüm noktası seçilmedi.' : 'Tek kayıt tek noktaya yazılır — alan ya araç, ikisi değil.',
    });
  });
export type TemperatureLogInsert = z.infer<typeof TemperatureLogInsertSchema>;

export const TemperatureLogUpdateSchema = TemperatureLogSchema.partial().required({ id: true });
export type TemperatureLogUpdate = z.infer<typeof TemperatureLogUpdateSchema>;
