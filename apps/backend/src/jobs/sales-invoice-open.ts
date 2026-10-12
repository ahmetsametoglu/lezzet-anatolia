import { serviceDb } from '@lezzet/database';
import { openSalesInvoices } from '@lezzet/application';

/**
 * Teslim edilen B2B satışın faturası bizde açılır; Pennylane'e kesim yazım kuyruğunun işidir. Anahtarsız ortamda da fatura açılır,
 * çünkü kesilmeyi bekleyen fatura listede görünmeli.
 */
export async function salesInvoiceOpenJob(): Promise<Record<string, number>> {
  return openSalesInvoices(serviceDb());
}
