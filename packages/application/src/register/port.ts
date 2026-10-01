import type { MovementDirection, PaymentMethod, RegisterCashMove, RegisterDay, RegisterSale } from '@lezzet/types';

/**
 * Sertifikalı kasanın portu: eşitleme yalnız bunu bilir, Hiboutik uyarlaması ve testlerin bellek içi kasası uygular. Kapanmamış satışta
 * kalem ve ödeme satırı silinebilir; kapanmış satış mali kayıttır, ona yalnız ödeme satırı eklenir.
 */
export interface CashRegister {
  findProductByRef(refExt: string): Promise<number | null>;
  createProduct(input: { name: string; priceCents: number; vatRate: number; refExt: string }): Promise<number>;
  updateProduct(productId: number, change: { name?: string; priceCents?: number; vatRate?: number }): Promise<void>;
  createSale(storeId: number): Promise<number>;
  /** Satışı `extRef` ile işaretler ve tutarları açık yazılan satış yapar; tekrar çağrılabilir. */
  prepareSale(saleId: number, extRef: string): Promise<void>;
  /** `vatRate` verilirse kalemin oranı ürününkinden ayrılır (oran ürün açıldıktan sonra değişmişse). */
  addLine(input: { saleId: number; productId: number; quantity: number; unitPriceCents: number; vatRate: number | null }): Promise<number>;
  deleteLine(lineId: number): Promise<void>;
  addPayment(input: { saleId: number; method: PaymentMethod; amountCents: number }): Promise<number>;
  deletePayment(paymentId: number): Promise<void>;
  closeSale(saleId: number): Promise<void>;
  /** Olmayan satış `null` döner. */
  readSale(saleId: number): Promise<RegisterSale | null>;
  /** Arama "içerir" biçimindedir; tam eşleşmeyi çağıran satışı okuyarak doğrular. */
  findSaleIdsByExtRef(extRef: string): Promise<number[]>;
  /** Fiş dışı nakit, açıklamasıyla kasaya giriş ya da çıkış; kasa sayımı çekmeceyle tutsun diye. */
  moveCash(input: { storeId: number; direction: MovementDirection; amountCents: number; label: string }): Promise<number>;
  listCashMoves(storeId: number, month: { year: number; month: number }): Promise<RegisterCashMove[]>;
  /** Günler `YYYY-MM-DD`, kasanın takviminde. */
  readDay(storeId: number, date: string): Promise<RegisterDay>;
  /** Günün kapanış anı; kapanmamışsa `null`. */
  dayClosedAt(storeId: number, date: string): Promise<string | null>;
  /** Günü ve öncesini kapatır; kapanış mali kayıttır, geri alınmaz. */
  closeDay(storeId: number, date: string): Promise<void>;
}
