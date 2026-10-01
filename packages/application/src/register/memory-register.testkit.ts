import type { MovementDirection, PaymentMethod, RegisterSale } from '@lezzet/types';
import type { CashRegister } from './port';

/**
 * Testlerin bellek içi kasası: Hiboutik'in ölçülen davranışını taklit eder (kapanmış satışa kalem eklenmez ama ödeme satırı eklenir,
 * arama "içerir" biçimindedir). `failOn` yarıda kesilen yazımı kurar: çağrı yazmadan ya da yazdıktan sonra fırlatır.
 */

interface MemorySale {
  storeId: number;
  extRef: string;
  divided: boolean;
  closed: boolean;
  lines: RegisterSale['lines'];
  payments: Array<{ paymentId: number; method: PaymentMethod; amountCents: number }>;
}

interface MemoryTill {
  tillId: number;
  storeId: number;
  direction: MovementDirection;
  amountCents: number;
  label: string;
  at: Date;
}

export function memoryRegister() {
  let nextId = 1;
  const products = new Map<number, { name: string; priceCents: number; vatRate: number; refExt: string }>();
  const sales = new Map<number, MemorySale>();
  const tills: MemoryTill[] = [];
  const failures = new Map<keyof CashRegister, 'before' | 'after'>();

  /** Çağrının yazımı `act` ile yapılır; düşme kipi yazımdan önce ya da sonra fırlatır ve bir kez geçerlidir. */
  const run = async <T>(name: keyof CashRegister, act: () => T): Promise<T> => {
    const failure = failures.get(name);
    failures.delete(name);
    if (failure === 'before') throw new Error(`kasa yanıt vermedi (${name})`);
    const result = act();
    if (failure === 'after') throw new Error(`kasa cevabı kayboldu (${name})`);
    return result;
  };
  const saleOf = (saleId: number): MemorySale => {
    const sale = sales.get(saleId);
    if (!sale) throw new Error(`satış yok (${saleId})`);
    return sale;
  };
  const openSaleOf = (saleId: number): MemorySale => {
    const sale = saleOf(saleId);
    if (sale.closed) throw new Error(`kapanmış satış değişmez (${saleId})`);
    return sale;
  };

  const register: CashRegister = {
    findProductByRef: (refExt) =>
      run('findProductByRef', () => [...products].find(([, product]) => product.refExt === refExt)?.[0] ?? null),
    createProduct: (input) =>
      run('createProduct', () => {
        const id = nextId++;
        products.set(id, { ...input });
        return id;
      }),
    updateProduct: (productId, change) => run('updateProduct', () => void Object.assign(products.get(productId)!, change)),
    createSale: (storeId) =>
      run('createSale', () => {
        const id = nextId++;
        sales.set(id, { storeId, extRef: '', divided: false, closed: false, lines: [], payments: [] });
        return id;
      }),
    prepareSale: (saleId, extRef) =>
      run('prepareSale', () => {
        const sale = openSaleOf(saleId);
        sale.extRef = extRef;
        sale.divided = true;
      }),
    addLine: (input) =>
      run('addLine', () => {
        const lineId = nextId++;
        const vatRate = input.vatRate ?? products.get(input.productId)!.vatRate;
        openSaleOf(input.saleId).lines.push({
          lineId,
          productId: input.productId,
          quantity: input.quantity,
          unitPriceCents: input.unitPriceCents,
          vatRate,
        });
        return lineId;
      }),
    deleteLine: (lineId) =>
      run('deleteLine', () => {
        const sale = [...sales.values()].find((candidate) => candidate.lines.some((line) => line.lineId === lineId));
        if (!sale || sale.closed) throw new Error(`kalem silinemez (${lineId})`);
        sale.lines = sale.lines.filter((line) => line.lineId !== lineId);
      }),
    addPayment: (input) =>
      run('addPayment', () => {
        const sale = saleOf(input.saleId);
        if (!sale.divided) throw new Error('ödeme satırı yalnız DIV satışa eklenir');
        const paymentId = nextId++;
        sale.payments.push({ paymentId, method: input.method, amountCents: input.amountCents });
        return paymentId;
      }),
    deletePayment: (paymentId) =>
      run('deletePayment', () => {
        const sale = [...sales.values()].find((candidate) => candidate.payments.some((payment) => payment.paymentId === paymentId));
        if (!sale || sale.closed) throw new Error(`ödeme satırı silinemez (${paymentId})`);
        sale.payments = sale.payments.filter((payment) => payment.paymentId !== paymentId);
      }),
    closeSale: (saleId) => run('closeSale', () => void (openSaleOf(saleId).closed = true)),
    readSale: (saleId) =>
      run('readSale', () => {
        const sale = sales.get(saleId);
        if (!sale) return null;
        return {
          saleId,
          extRef: sale.extRef,
          closed: sale.closed,
          uniqueSaleId: sale.closed ? `Z-${saleId}` : null,
          receiptUrl: sale.closed ? `https://fis.test/${saleId}` : null,
          lines: sale.lines.map((line) => ({ ...line })),
          payments: sale.payments.map((payment) => ({ ...payment })),
        };
      }),
    findSaleIdsByExtRef: (extRef) =>
      run('findSaleIdsByExtRef', () => [...sales].filter(([, sale]) => sale.extRef.includes(extRef)).map(([id]) => id)),
    moveCash: (input) =>
      run('moveCash', () => {
        const tillId = nextId++;
        tills.push({ ...input, tillId, at: new Date() });
        return tillId;
      }),
    listCashMoves: (storeId, month) =>
      run('listCashMoves', () =>
        tills
          .filter(
            (till) => till.storeId === storeId && till.at.getUTCFullYear() === month.year && till.at.getUTCMonth() + 1 === month.month,
          )
          .map((till) => ({ tillId: till.tillId, label: till.label })),
      ),
  };

  return {
    register,
    products,
    sales,
    tills,
    failOn(name: keyof CashRegister, when: 'before' | 'after' = 'before') {
      failures.set(name, when);
    },
    /** Aynanın önceden andığı ürünü kasaya tanıtır; numaralar onunla çakışmasın diye sayaç ilerler. */
    knowProduct(id: number, product: { name: string; priceCents: number; vatRate: number; refExt: string }) {
      products.set(id, product);
      nextId = Math.max(nextId, id + 1);
    },
  };
}
