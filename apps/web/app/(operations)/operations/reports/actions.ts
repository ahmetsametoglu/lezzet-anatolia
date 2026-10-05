'use server';

import { revalidatePath } from 'next/cache';
import { buildExport, matchInvoiceNo, toExportCsv } from '@/lib/accounting/export';
import { buildMovementExport, toMovementCsv } from '@/lib/accounting/movement-export';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireFinance } from '@/lib/guard';
import { monthRange, REPORTS_PATH } from './reports-url';

// Raporlar server action'ları: guard ilk, sonuç `{ data, error }`. Guard `requireFinance` (yönetici veya muhasebeci), çünkü
// export ve fatura eşleştirmesi muhasebenin işidir; kâr blokları sayfada ayrı kapıdan (`canSeeProfit`) geçer.

/**
 * Muhasebe dosyasını metin olarak döner, indirme tarayıcıda yapılır: ayrı bir rota ikinci bir yetki kapısı isterdi. Üretim kayıt
 * değil okumadır; aynı dönem tekrar üretilebilir, "export edildi" damgası basılmaz.
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

/** Hareket dökümü: dönemin her para hareketi belgesi, etiketi ve karşı tarafıyla; satış dosyasıyla aynı desen. */
export async function generateMovementExportAction(ym: string): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    await requireFinance();
    const { from, to } = monthRange(ym);
    const data = await buildMovementExport({ from, to });

    return {
      data: { csv: toMovementCsv(data), filename: `lezzet-hareketler-${ym}.csv` },
      error: null,
    };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Sipariş referansına resmî fatura numarasını bağlar; numara dış muhasebede doğar, burada üretilmez. Boş numara reddedilir: yazılsaydı
 * satır kuyruktan düşer ama hiçbir faturaya bağlanmazdı.
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
