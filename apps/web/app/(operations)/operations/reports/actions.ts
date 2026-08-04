'use server';

import { revalidatePath } from 'next/cache';
import { buildExport, matchInvoiceNo, toExportCsv } from '@/lib/accounting/export';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireFinance } from '@/lib/guard';
import { monthRange, REPORTS_PATH } from './reports-url';

// Raporlar server action'ları — guard ilk + kapıya devret + `{ data, error }` (throw yok).
//
// **Guard `requireFinance`** (yönetici VEYA muhasebeci): export ve fatura eşleştirmesi tam olarak
// muhasebenin işidir. Kâr blokları ayrı bir kapıdan geçiyor (sayfada `canSeeProfit`) — tasarım §6
// kârı yalnız yöneticiye açıyor, ama export'u muhasebeciden esirgemek ekranı işlevsiz kılardı.

/**
 * Muhasebe dosyasını üretir — **indirme İSTEMCİDE yapılır**, dosya buradan metin olarak döner.
 *
 * Sunucudan doğrudan dosya yollamak bir rota (route handler) isterdi; oysa üretilen şey birkaç yüz
 * satırlık metin ve zaten ekranın gösterdiği özetin aynısından çıkıyor. Metin dönüp indirmeyi
 * tarayıcıya bırakmak, ikinci bir yetki kapısı açmaktan da güvenli: rota olsaydı guard'ı ayrıca
 * orada tutmak gerekirdi.
 *
 * **Aynı dönem ikinci kez üretilebilir** (tasarım §4: muhasebeci dosyayı kaybetmiş olabilir) —
 * üretim bir KAYIT değil, okuma; hiçbir yere "export edildi" damgası basmıyor.
 */
export async function generateExportAction(ym: string): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    await requireFinance();
    const { from, to } = monthRange(ym);
    const data = await buildExport({ from, to });

    return {
      data: {
        csv: toExportCsv(data),
        // Dosya adı insanın tanıyacağı hâlde: muhasebeciye giden ekte "export.csv" değil ayın adı
        // görünmeli, yoksa üç ayın dosyası aynı klasörde birbirinden ayrılmaz.
        filename: `lezzet-muhasebe-${ym}.csv`,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Sipariş referansına resmî fatura numarasını bağlar.
 *
 * Numara burada ÜRETİLMEZ — dış muhasebede doğar, sistem kendi referansıyla eşleştirir (12.7'nin
 * kuralı). Boş numara kapıda reddediliyor: yazılsaydı satır kuyruktan düşer ama hiçbir faturaya
 * bağlanmazdı, yani kuyruk temizlenmiş görünürken eşleşme hiç olmazdı.
 */
export async function matchInvoiceAction(orderId: string, invoiceNo: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const trimmed = invoiceNo.trim();
    if (!trimmed) return { data: null, error: 'Fatura numarası boş bırakılamaz.' };

    // Kapının tek reddi `empty_invoice_no` ve o zaten yukarıda karşılandı; yine de dal açık
    // duruyor: bir gün kapıya ikinci bir ret eklenirse burası sessizce "başarılı" demesin.
    const outcome = await matchInvoiceNo(orderId, trimmed);
    if (outcome.status !== 'ok') return { data: null, error: 'Fatura numarası kaydedilemedi.' };

    revalidatePath(REPORTS_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
