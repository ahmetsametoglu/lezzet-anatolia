import { parisDateOf } from '@lezzet/helper';
import type { MovementDirection, PaymentMethod, RegisterSale } from '@lezzet/types';
import type { CashRegister } from './port';

/**
 * Testlerin bellek içi kasası: Hiboutik'in ölçülen davranışını taklit eder (kapanmış satışa kalem eklenmez ama ödeme satırı eklenir,
 * arama "içerir" biçimindedir). `failOn` yarıda kesilen yazımı kurar: çağrı yazmadan ya da yazdıktan sonra fırlatır. `now` kasanın saatidir.
 */

interface MemorySale {
  storeId: number;
  extRef: string;
  divided: boolean;
  closedAt: Date | null;
  lines: RegisterSale['lines'];
  payments: Array<{ paymentId: number; method: PaymentMethod; amountCents: number; at: Date }>;
}

interface MemoryTill {
  tillId: number;
  storeId: number;
  direction: MovementDirection;
  amountCents: number;
  label: string;
  at: Date;
}

/** Kasanın yerel saati, Hiboutik'in yazdığı biçimde (`YYYY-MM-DD hh:mm:ss`). */
const localTime = (at: Date): string =>
  `${parisDateOf(at)} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', timeStyle: 'medium' }).format(at)}`;

export function memoryRegister(opts: { now?: () => Date } = {}) {
  const clock = opts.now ?? (() => new Date());
  let nextId = 1;
  const products = new Map<number, { name: string; priceCents: number; vatRate: number; refExt: string }>();
  const sales = new Map<number, MemorySale>();
  const tills: MemoryTill[] = [];
  const closedDays = new Map<string, string>();
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
    if (sale.closedAt) throw new Error(`kapanmış satış değişmez (${saleId})`);
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
        sales.set(id, { storeId, extRef: '', divided: false, closedAt: null, lines: [], payments: [] });
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
        if (!sale || sale.closedAt) throw new Error(`kalem silinemez (${lineId})`);
        sale.lines = sale.lines.filter((line) => line.lineId !== lineId);
      }),
    addPayment: (input) =>
      run('addPayment', () => {
        const sale = saleOf(input.saleId);
        if (!sale.divided) throw new Error('ödeme satırı yalnız DIV satışa eklenir');
        const paymentId = nextId++;
        sale.payments.push({ paymentId, method: input.method, amountCents: input.amountCents, at: clock() });
        return paymentId;
      }),
    deletePayment: (paymentId) =>
      run('deletePayment', () => {
        const sale = [...sales.values()].find((candidate) => candidate.payments.some((payment) => payment.paymentId === paymentId));
        if (!sale || sale.closedAt) throw new Error(`ödeme satırı silinemez (${paymentId})`);
        sale.payments = sale.payments.filter((payment) => payment.paymentId !== paymentId);
      }),
    closeSale: (saleId) => run('closeSale', () => void (openSaleOf(saleId).closedAt = clock())),
    readSale: (saleId) =>
      run('readSale', () => {
        const sale = sales.get(saleId);
        if (!sale) return null;
        return {
          saleId,
          extRef: sale.extRef,
          closed: sale.closedAt !== null,
          uniqueSaleId: sale.closedAt ? `Z-${saleId}` : null,
          receiptUrl: sale.closedAt ? `https://fis.test/${saleId}` : null,
          lines: sale.lines.map((line) => ({ ...line })),
          payments: sale.payments.map(({ paymentId, method, amountCents }) => ({ paymentId, method, amountCents })),
        };
      }),
    findSaleIdsByExtRef: (extRef) =>
      run('findSaleIdsByExtRef', () => [...sales].filter(([, sale]) => sale.extRef.includes(extRef)).map(([id]) => id)),
    moveCash: (input) =>
      run('moveCash', () => {
        const tillId = nextId++;
        tills.push({ ...input, tillId, at: clock() });
        return tillId;
      }),
    listCashMoves: (storeId, month) =>
      run('listCashMoves', () => {
        const prefix = `${month.year}-${String(month.month).padStart(2, '0')}`;
        return tills
          .filter((till) => till.storeId === storeId && parisDateOf(till.at).startsWith(prefix))
          .map((till) => ({
            tillId: till.tillId,
            label: till.label,
            at: localTime(till.at),
            amountCents: till.direction === 'in' ? till.amountCents : -till.amountCents,
          }));
      }),
    readDay: (storeId, date) =>
      run('readDay', () => {
        const own = [...sales].filter(([, sale]) => sale.storeId === storeId);
        const vat = new Map<number, number>();
        for (const [, sale] of own) {
          if (!sale.closedAt || parisDateOf(sale.closedAt) !== date) continue;
          for (const line of sale.lines) vat.set(line.vatRate, (vat.get(line.vatRate) ?? 0) + line.quantity * line.unitPriceCents);
        }
        return {
          vat: [...vat].map(([vatRate, grossCents]) => ({ vatRate, grossCents })),
          payments: own.flatMap(([saleId, sale]) =>
            sale.payments
              .filter((payment) => parisDateOf(payment.at) === date)
              .map(({ method, amountCents }) => ({ saleId, method, amountCents })),
          ),
        };
      }),
    dayClosedAt: (storeId, date) => run('dayClosedAt', () => closedDays.get(`${storeId}:${date}`) ?? null),
    closeDay: (storeId, date) => run('closeDay', () => void closedDays.set(`${storeId}:${date}`, localTime(clock()))),
  };

  return {
    register,
    products,
    sales,
    tills,
    closedDays,
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
