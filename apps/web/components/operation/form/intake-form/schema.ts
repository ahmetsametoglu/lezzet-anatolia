import { z } from 'zod';

/**
 * **MAL KABUL FORMUNUN ŞEMASI** — iki yüzeyin paylaştığı tek tanım (22.23).
 *
 * Mal kabul ekranının satır editörü (`FreeIntake`) `useState` ile çalışıyordu ve şeması yoktu;
 * asistan kuyruğu da aynı formu açtığı için tanım ortak alana çıktı ve doğrulama tek yere toplandı.
 *
 * ── SATIR NEDEN VARYANT ANAHTARLI DEĞİL ─────────────────────────────────────
 * Aynı varyant birden çok satırda gelebilir: farklı son kullanma tarihi ya da farklı lot AYRI bir
 * partidir ve aynı sevkiyatta farklı fiyata alınmış olabilir (`PurchaseIntakeLine` künyesi).
 * Satırlar bu yüzden bir dizi; varyant anahtarlı bir harita o farkı sessizce yutardı.
 */
export const IntakeLineSchema = z.object({
  variantId: z.string().uuid(),
  /** Satırda okunan ad — dilekçeden ya da aramadan gelir; kimlik ekranda gösterilmez. */
  title: z.string(),
  /** Sayılan adet. `null` = HENÜZ GİRİLMEDİ (0 değil — "gelmedi" ayrı bir karardır). */
  qty: z.number().int().positive().nullable(),
  /** SKT — kayıt anında ZORUNLU: tarihsiz parti yazılamaz (gıda; `stock.expiry_date` not null). */
  expiryDate: z.string(),
  lotNumber: z.string(),
  location: z.string(),
  /**
   * Birim alış — **EURO** (form birimi), kapıya `toCents` ile gider. `null` = "bu satırın fiyatını
   * bilmiyorum" ve meşrudur: faturada okunamayan bir satır uydurulmaz (`CLAUDE §1`).
   */
  unitCost: z.number().nonnegative().nullable(),
});
export type IntakeLine = z.infer<typeof IntakeLineSchema>;

export const IntakeFormSchema = z.object({
  /** Depo — **varsayılanı YOK** (`CLAUDE §1`): kabul deposuz yazılamaz, seçim açık olmalı. */
  warehouseId: z.string(),
  supplierId: z.string(),
  /** İrsaliye/fatura numarası — kabulün notuna yazılır. */
  documentNo: z.string(),
  /**
   * **BELGENİN TARİHİ** — kabul bu güne yazılır (22.23).
   *
   * Boşsa kapı bugünü kullanır ve fatura genelde dünkü olur: patron akşam fotoğraflar, ertesi gün
   * onaylar. Yanlış güne yazılan bir kabul stok yaşını ve dönem mutabakatını sessizce kaydırır
   * (`StockIntakePayloadSchema` künyesi bunu yazıyordu ama alan hiçbir yola BAĞLI DEĞİLDİ —
   * dilekçede duruyor, kayda geçmiyordu; ölçüldü 13.08).
   */
  date: z.string(),
  lines: z.array(IntakeLineSchema),
});
export type IntakeFormValues = z.infer<typeof IntakeFormSchema>;

/** Boş satır — "+ satır" ve dilekçeden gelmeyen alanlar için tek yerden. */
export function emptyIntakeLine(variantId: string, title: string): IntakeLine {
  return { variantId, title, qty: null, expiryDate: '', lotNumber: '', location: '', unitCost: null };
}

/**
 * Kaydetmeyi engelleyen sebep — alt bar bunu YAZIYOR, düğmeyi sessizce kapatmıyor.
 *
 * **SKT engeli burada, çünkü veritabanı kısıtı orada.** Tarihsiz bir parti yazılamaz ve kural kapıda
 * öğrenilmemeli: kaydet düğmesine basıp `not null` hatası okumak, satırı doldururken uyarılmaktan
 * kötüdür. Adet girilmemiş satır ise engel DEĞİL — o satır kabule hiç girmez ("saymadım" demektir).
 */
export function intakeBlock(values: IntakeFormValues): string | null {
  if (!values.warehouseId) return 'Hangi depoya girdiğini seçin — kabul deposuz yazılamaz.';
  const counted = values.lines.filter((line) => line.qty !== null && line.qty > 0);
  if (counted.length === 0) return 'En az bir kaleme adet girin.';
  const missingDate = counted.find((line) => !line.expiryDate.trim());
  if (missingDate) return `Son kullanma tarihi eksik: ${missingDate.title || 'bir kalem'}.`;
  return null;
}

/** Kabule GİRECEK satırlar — adedi girilmiş olanlar. Ekran ve kaydeden kapı aynı süzgeci kullanır. */
export function countedLines(values: IntakeFormValues): IntakeLine[] {
  return values.lines.filter((line) => line.qty !== null && line.qty > 0);
}

/**
 * Satırlardan çıkan toplam — **faturanın kendi toplamıyla karşılaştırmak için** (22.23).
 *
 * Fatura toplamı dilekçede ayrı bir alan (`totalAmountCents`) ve satırların toplamı DEĞİLDİR: ikisi
 * arasındaki fark tam da aranan şeydir — nakliye, iskonto ya da okunamayan bir satır. Fiyatı
 * bilinmeyen satır toplama 0 olarak GİRMEZ; onun yerine "eksik" sayılır, çünkü bilinmeyen bir
 * maliyeti sıfır saymak mutabakatı sessizce doğru gösterirdi.
 */
export function intakeTotals(values: IntakeFormValues): { totalCents: number; unpricedCount: number } {
  const counted = countedLines(values);
  const unpriced = counted.filter((line) => line.unitCost === null);
  const totalCents = counted.reduce((sum, line) => sum + Math.round((line.unitCost ?? 0) * 100) * (line.qty ?? 0), 0);
  return { totalCents, unpricedCount: unpriced.length };
}
