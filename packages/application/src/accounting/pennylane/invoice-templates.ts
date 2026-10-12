import type { PennylaneInvoiceTemplate } from '@lezzet/types';
import type { PennylanePort } from './port';

/** Ayardaki şablon seçicisinin listesi; okunamayan liste boş liste değildir, sebebiyle döner. */
export type InvoiceTemplateList =
  { status: 'ok'; templates: PennylaneInvoiceTemplate[] } | { status: 'not_configured' } | { status: 'failed'; message: string };

/**
 * Pennylane'deki fatura şablonları, adlarına göre sıralı. Hata kaydı yazılmaz, çünkü sebep seçicinin altında görünür ve sayfa her
 * açıldığında yeniden denenir.
 */
export async function readInvoiceTemplates(pennylane: PennylanePort | null): Promise<InvoiceTemplateList> {
  if (!pennylane) return { status: 'not_configured' };
  try {
    const templates = await pennylane.listInvoiceTemplates();
    return { status: 'ok', templates: templates.sort((a, b) => a.name.localeCompare(b.name, 'tr')) };
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
