import type {
  PennylaneBankAccount,
  PennylaneChangePage,
  PennylaneCompany,
  PennylaneTransaction,
  PennylaneTransactionPage,
} from '@lezzet/types';

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
}
