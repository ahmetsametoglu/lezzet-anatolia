import type {
  PennylaneAssignedCategory,
  PennylaneBankAccount,
  PennylaneCategory,
  PennylaneCategoryGroup,
  PennylaneChangePage,
  PennylaneCompany,
  PennylaneCustomer,
  PennylaneCustomerDraft,
  PennylaneCustomerInvoice,
  PennylaneCustomerInvoiceDraft,
  PennylaneCustomerPatch,
  PennylaneInvoice,
  PennylaneInvoiceDraft,
  PennylaneInvoicePatch,
  PennylaneInvoiceTemplate,
  PennylanePaymentStatus,
  PennylaneSupplier,
  PennylaneSupplierDraft,
  PennylaneTransaction,
  PennylaneTransactionMatch,
  PennylaneTransactionPage,
} from '@lezzet/types';

/** Kategorisi okunup yazılan kayıt; fatura ile banka işleminin kategori uç noktası aynı biçimdedir. */
export interface PennylaneCategoryTarget {
  kind: 'invoice' | 'transaction';
  id: number;
}

/** Muhasebe yazılımının portu: eşitleme yalnız bunu bilir, böylece Pennylane uyarlaması ağa çıkmayan bir ikizle değiştirilebilir. */
export interface PennylanePort {
  /** Anahtarın şirketi; kip ile uyuşmuyorsa hiçbir istek gitmez. */
  company(): Promise<PennylaneCompany>;
  listBankAccounts(): Promise<PennylaneBankAccount[]>;
  /** Banka hesabının `fromDate` gününden itibaren hareketleri, kimlik sırasıyla; `cursor` önceki sayfanın devamıdır. */
  listTransactions(input: { bankAccountId: number; fromDate: string; cursor: string | null }): Promise<PennylaneTransactionPage>;
  /** Olmayan ya da başka şirketin hareketi `null` döner. */
  getTransaction(id: number): Promise<PennylaneTransaction | null>;
  /** Hareket değişiklik akışı: ilk sayfa `since` anından, sonrakiler imleçten; akış son dört haftayı tutar. */
  transactionChanges(input: { since: string; cursor: null } | { since: null; cursor: string }): Promise<PennylaneChangePage>;
  /** Alış faturası değişiklik akışı, aynı düzenle; eşleme, çözme ve ödendi işareti olay düşürür, kategori düşürmez. */
  invoiceChanges(input: { since: string; cursor: null } | { since: null; cursor: string }): Promise<PennylaneChangePage>;
  /** Dış referansla tedarikçi; referans tekil olduğu için en çok bir tane. */
  findSupplier(externalReference: string): Promise<PennylaneSupplier | null>;
  /** Şirketin bütün tedarikçileri; Pennylane KDV numarasıyla süzmüyor, aynı firma listeden bulunur. */
  listSuppliers(): Promise<PennylaneSupplier[]>;
  /** Aynı dış referansla ikinci açılış reddedilir (`validation`); çağıran önce arar. */
  createSupplier(draft: PennylaneSupplierDraft): Promise<PennylaneSupplier>;
  /** Faturalar dış referansla ya da tedarikçi ve numarayla; Pennylane numaranın tekrarını kendisi yakalamaz. */
  findInvoices(filter: { externalReference: string } | { supplierId: number; invoiceNumber: string }): Promise<PennylaneInvoice[]>;
  getInvoice(id: number): Promise<PennylaneInvoice | null>;
  /** Dosyanın Pennylane'deki kimliği; PDF, JPEG ve PNG alınır. */
  uploadFile(file: { bytes: Uint8Array; contentType: string; filename: string }): Promise<number>;
  /** Aynı içerikli dosya başka faturada duruyorsa içe aktarılmaz, var olan faturanın kimliği döner. */
  importInvoice(input: {
    draft: PennylaneInvoiceDraft;
    fileId: number;
  }): Promise<{ status: 'imported'; invoice: PennylaneInvoice } | { status: 'duplicate_file'; existingId: number }>;
  /** Pennylane güncellemede toplamı satırlarla karşılaştırmaz; çağıran ikisini birlikte gönderir. */
  updateInvoice(id: number, patch: PennylaneInvoicePatch): Promise<void>;
  setPaymentStatus(id: number, status: PennylanePaymentStatus): Promise<void>;
  /** Hareketin eşlendiği faturalar; Pennylane eşleme sırasını vermiyor. */
  transactionMatches(transactionId: number): Promise<PennylaneTransactionMatch[]>;
  /** Hareketi alış faturasına eşler; tutar taşımaz, Pennylane hareketi faturalara açılma sırasıyla dağıtır, eşleme sırasıyla değil. */
  matchTransaction(input: { invoiceId: number; transactionId: number }): Promise<void>;
  /** Tek bir faturanın bağını çözmek hareketin bütün eşleşmelerini çözer; çağıran kalanları yeniden kurar. */
  unmatchTransaction(input: { invoiceId: number; transactionId: number }): Promise<void>;
  /** Dış referansla müşteri; referans tekil olduğu için en çok bir tane. */
  findCustomer(externalReference: string): Promise<PennylaneCustomer | null>;
  /** Şirketin bütün müşterileri; aynı firmanın elle açılmış kaydı SIREN ya da KDV numarasıyla listeden bulunur. */
  listCustomers(): Promise<PennylaneCustomer[]>;
  /** Olmayan ya da başka şirketin müşterisi `null` döner. */
  getCustomer(id: number): Promise<PennylaneCustomer | null>;
  /** Aynı dış referansla ikinci açılış reddedilir (`validation`); çağıran önce arar. */
  createCustomer(draft: PennylaneCustomerDraft): Promise<PennylaneCustomer>;
  /** Yalnız verilen alanlar yazılır. */
  updateCustomer(id: number, patch: PennylaneCustomerPatch): Promise<void>;
  /** Dış referansla müşteri faturası; yarıda kalmış kesme denemesinin faturası ikinci kez açılmasın diye önce aranır. */
  findCustomerInvoice(externalReference: string): Promise<PennylaneCustomerInvoice | null>;
  /** Faturayı taslak açar; toplamları Pennylane satırlardan hesaplar ve kesinleştirmeden önce bizimkiyle karşılaştırılır. */
  createCustomerInvoice(draft: PennylaneCustomerInvoiceDraft): Promise<PennylaneCustomerInvoice>;
  /** Taslağı kesinleştirir ve numarasını verir; kesinleşen fatura düzenlenmez, düzeltmesi alacak notudur. */
  finalizeCustomerInvoice(invoiceId: number): Promise<PennylaneCustomerInvoice>;
  sendCustomerInvoice(input: { invoiceId: number; recipients: readonly string[] }): Promise<void>;
  /** Satış faturası şablonları; işin ayarı faturayı hangisinin basacağını seçer. */
  listInvoiceTemplates(): Promise<PennylaneInvoiceTemplate[]>;
  listCategoryGroups(): Promise<PennylaneCategoryGroup[]>;
  createCategoryGroup(label: string): Promise<PennylaneCategoryGroup>;
  listCategories(): Promise<PennylaneCategory[]>;
  createCategory(input: { label: string; groupId: number }): Promise<PennylaneCategory>;
  readCategories(target: PennylaneCategoryTarget): Promise<PennylaneAssignedCategory[]>;
  /** Kaydın bütün kategorilerini verilenlerle değiştirir; aynı gruptaki ağırlıkların toplamı 1 olmalı. */
  writeCategories(target: PennylaneCategoryTarget, categories: ReadonlyArray<{ id: number; weight: number }>): Promise<void>;
}
