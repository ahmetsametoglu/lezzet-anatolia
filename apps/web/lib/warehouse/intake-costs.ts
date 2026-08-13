import type { IntakeFormLine, PurchaseIntakeLine } from '@lezzet/application';
import type { StockIntakePayload } from '@lezzet/types';

/**
 * Operatörün onayladığı satırlara dilekçedeki maliyeti ekler — **yalnız sunucuda** (09.14).
 *
 * Mal kabul ekranının `receiving-handoff` dosyasındaydı; kaydeden kapı ortak alana çıkınca
 * (`lib/warehouse/intake-actions`) buraya taşındı — bir `lib` dosyasının sayfa klasöründen okuması
 * ters yönlü bağımlılıktır (`docs:check §3e`).
 *
 * ── NEDEN SUNUCUDA EŞLEŞTİRİLİYOR ───────────────────────────────────────────
 * Depo ekranı fiyat GÖRMEZ ve sınır tipin kendisinde duruyor (`IntakeFormLine`de maliyet alanı
 * yok). Fatura fotoğrafından okunan birim maliyet dilekçede duruyor; depocu adedi ve tarihi gözüyle
 * doğruluyor, maliyet onun görmediği bir yoldan (`receivePurchase`) yazılıyor. Rol duvarı da ayakta
 * kalıyor, veri de — `auto_price` "son alış fiyatı"nı bu kayıttan öğreniyor.
 *
 * **Asistan kuyruğunda bu eşleştirme KULLANILMAZ** (22.23): orası patronun ekranı, maliyet satırda
 * görünür ve düzeltilebilir; kapıya operatörün onayladığı fiyat gider, dilekçedeki değil.
 *
 * Eşleşme `variantId + SKT + lot` üçlüsüyle: maliyet SATIRIN, varyantın değil (aynı varyant farklı
 * tarihle iki satırda gelebilir ve aynı sevkiyatta farklı fiyata alınmış olabilir —
 * `PurchaseIntakeLine` künyesi). Operatör SKT'yi ya da lotu DÜZELTTİYSE üçlü tutmaz; o zaman aynı
 * varyant dilekçede tek satırsa onun fiyatı kullanılır, birden çoksa fiyat `null` kalır.
 *
 * `null` burada "bilmiyorum" demek ve meşru: uydurulmuş bir maliyet, kâr hesabını sessizce
 * bozardı. Kayıt yine yazılır.
 */
export function costsForLines(payload: StockIntakePayload, lines: readonly IntakeFormLine[]): PurchaseIntakeLine[] {
  const byVariant = new Map<string, StockIntakePayload['lines']>();
  for (const line of payload.lines) {
    const list = byVariant.get(line.variantId) ?? [];
    list.push(line);
    byVariant.set(line.variantId, list);
  }

  return lines.map((line) => {
    const candidates = byVariant.get(line.variantId) ?? [];
    const exact = candidates.find((c) => c.expiryDate === line.expiryDate && (c.lotNumber ?? '') === (line.lotNumber ?? ''));
    const fallback = candidates.length === 1 ? candidates[0] : undefined;
    return { ...line, unitCostCents: (exact ?? fallback)?.unitCostCents ?? null };
  });
}
