import type { SupabaseClient } from '@supabase/supabase-js';
import { fromCents } from '@lezzet/helper';
import {
  MoneyDocumentOrderSchema,
  SalesInvoiceCandidateSchema,
  SalesInvoiceSchema,
  type MoneyDocumentOrder,
  type SalesInvoice,
  type SalesInvoiceCandidate,
  type SalesInvoiceIssueInput,
  type SalesInvoiceOpenInput,
  type SalesInvoiceRefreshInput,
  type SalesInvoiceStatus,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Satış faturasının akışı (`sales_invoice`); belge, siparişleri ve akışı bölünmez yazımlar olduğu için yazımlar RPC'dir. */
export class SalesInvoiceService extends BaseDbService<SalesInvoice, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'sales_invoice', SalesInvoiceSchema, SalesInvoiceSchema as never, SalesInvoiceSchema as never, false);
  }

  /** Faturayı açar ve belgenin kimliğini döner; sipariş başka bir faturadaysa veri kısıtı reddeder. */
  open(input: SalesInvoiceOpenInput): Promise<string> {
    return this.executeRpc<string>('sales_invoice_open', {
      p_customer_id: input.customerId,
      p_business: input.business,
      p_order_ids: input.orderIds,
      p_issued_on: input.issuedOn,
      p_due_on: input.dueOn,
      p_amount: fromCents(input.amountCents),
      p_vat_lines: input.vatLines,
      p_vat_regime: input.vatRegime,
      p_missing: input.missing,
    });
  }

  /** Yalnız onay bekleyen fatura yeniden hesaplanır; kuyruktaki ya da kesilmiş fatura için `false`. */
  refresh(input: SalesInvoiceRefreshInput): Promise<boolean> {
    return this.executeRpc<boolean>('sales_invoice_refresh', {
      p_document_id: input.documentId,
      p_due_on: input.dueOn,
      p_amount: fromCents(input.amountCents),
      p_vat_lines: input.vatLines,
      p_vat_regime: input.vatRegime,
      p_missing: input.missing,
    });
  }

  /** Eksiği kalmamış onay bekleyen fatura kuyruğa girer; değilse `false`. */
  approve(documentId: string, actorId: string): Promise<boolean> {
    return this.executeRpc<boolean>('sales_invoice_approve', { p_document_id: documentId, p_actor_id: actorId });
  }

  /** Kuyruktaki faturanın Pennylane künyesi yazılır, numarası siparişlerine de; ikinci yazım `false`. */
  issue(input: SalesInvoiceIssueInput): Promise<boolean> {
    return this.executeRpc<boolean>('sales_invoice_issue', {
      p_document_id: input.documentId,
      p_pennylane_invoice_id: input.pennylaneInvoiceId,
      p_number: input.number,
      p_issued_on: input.issuedOn,
      p_due_on: input.dueOn,
    });
  }

  /** Kesilmiş faturanın e-postası gitti; ikinci yazım `false`. */
  markSent(documentId: string, sentAt: string): Promise<boolean> {
    return this.executeRpc<boolean>('sales_invoice_mark_sent', { p_document_id: documentId, p_sent_at: sentAt });
  }

  findByDocument(documentId: string): Promise<SalesInvoice | null> {
    return this.getOneBy({ documentId });
  }

  listByStatus(status: SalesInvoiceStatus): Promise<SalesInvoice[]> {
    return this.getAll({ status }, { orderBy: 'createdAt' });
  }

  /** Kesilmemiş faturalar: onay bekleyen ve kuyruktaki; küme iş listesidir, kesilen düşer. */
  listUnissued(): Promise<SalesInvoice[]> {
    return this.getAll({ status: ['awaiting_approval', 'queued'] }, { orderBy: 'createdAt' });
  }

  async listByDocuments(documentIds: readonly string[]): Promise<SalesInvoice[]> {
    if (documentIds.length === 0) return [];
    return this.getAll({ documentId: [...documentIds] });
  }
}

/** Faturası açılmamış B2B satışlar (`sales_invoice_candidate` görünümü); fatura işi her turda bunları okur. */
export class SalesInvoiceCandidateService extends BaseDbService<SalesInvoiceCandidate, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'sales_invoice_candidate',
      SalesInvoiceCandidateSchema,
      SalesInvoiceCandidateSchema as never,
      SalesInvoiceCandidateSchema as never,
      false,
    );
  }

  /** Satış gününe göre; müşteri verilirse yalnız onların satışları. */
  list(customerIds?: readonly string[]): Promise<SalesInvoiceCandidate[]> {
    return this.getAll(customerIds ? { customerId: [...customerIds] } : {}, { orderBy: 'saleDate' });
  }
}

/** Satış faturasının siparişleri (`money_document_order`); bağı fatura açılışı yazar, bu sınıf yalnız okur. */
export class MoneyDocumentOrderService extends BaseDbService<MoneyDocumentOrder, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'money_document_order',
      MoneyDocumentOrderSchema,
      MoneyDocumentOrderSchema as never,
      MoneyDocumentOrderSchema as never,
      false,
    );
  }

  /** Faturaların siparişleri tek turda, belge başına. */
  async ordersOf(documentIds: readonly string[]): Promise<Map<string, string[]>> {
    const byDocument = new Map<string, string[]>();
    if (documentIds.length === 0) return byDocument;
    for (const row of await this.getAll({ documentId: [...documentIds] })) {
      byDocument.set(row.documentId, [...(byDocument.get(row.documentId) ?? []), row.orderId]);
    }
    return byDocument;
  }
}
