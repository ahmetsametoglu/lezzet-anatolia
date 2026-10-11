import { describe, expect, it } from 'vitest';
import { parsePayoutStatement, payoutPaymentFees, unexplainedPayoutRows, type PayoutStatementRow } from './payout-statement';

const HEADER =
  'created_date,completed_date,payout_affected_date,affected_payout_amount,transaction_id,order_id,dispute_id,merchant_order_reference,type,related_icpp_charge_id,transaction_amount,transaction_currency,billing_amount,billing_currency,state,original_transaction_id,original_transaction_amount,original_transaction_currency,original_order_id,original_order_channel,original_merchant_order_reference,fee_amount,fee_currency,settlement_amount,settlement_currency,location_id,location_name,submerchant_id,payout_transfer_reference,payout_total_amount,payout_date';

/** Revolut belgesindeki örnek rapor (merchant-2026-08-17), tutarlar avro biriminde. */
const SAMPLE = [
  HEADER,
  '2025-03-25T14:34:05Z,2025-03-26T14:34:38Z,2025-03-26T14:34:38Z,true,t1,ord-1,,ORD-2025-0042,Settlement,,0.57,USD,0.57,USD,COMPLETED,t1,0.57,USD,ord-1,API,ORD-2025-0042,0.00,USD,0.57,USD,,,,"Revolut USD payout 2025-03-26, MerchantName",0.17,2025-03-26T15:00:00Z',
  '2025-03-25T15:38:45Z,2025-03-26T15:39:58Z,2025-03-26T15:39:58Z,true,t2,cb-1,d1,ORD-2025-0042-CB1,Customer dispute - withdrawal,,-0.40,USD,-0.40,USD,COMPLETED,t1,0.57,USD,ord-1,API,ORD-2025-0042,0.00,USD,-0.40,USD,,,,"Revolut USD payout 2025-03-26, MerchantName",0.17,2025-03-26T15:00:00Z',
  '2025-03-26T08:00:00Z,,2025-03-26T14:34:38Z,true,t3,,,,Irreducible balance hold,,50.00,USD,50.00,USD,REVERTED,,,,,,,,,50.00,USD,,,,"Revolut USD payout 2025-03-26, MerchantName",0.17,2025-03-26T15:00:00Z',
].join('\n');

const row = (over: Partial<PayoutStatementRow>): PayoutStatementRow => ({
  type: 'Settlement',
  state: 'COMPLETED',
  orderId: 'ord-1',
  originalOrderId: 'ord-1',
  transactionCents: 2000,
  feeCents: 30,
  feeCurrency: 'EUR',
  settlementCents: 1970,
  ...over,
});

describe('aktarım raporunun okunması', () => {
  it('tutarlar avrodan cent’e çevrilir; boş kimlik `null` okunur', () => {
    const [settlement, dispute, hold] = parsePayoutStatement(SAMPLE);
    expect(settlement).toMatchObject({ type: 'Settlement', orderId: 'ord-1', transactionCents: 57, feeCents: 0, settlementCents: 57 });
    expect(dispute).toMatchObject({
      type: 'Customer dispute - withdrawal',
      orderId: 'cb-1',
      originalOrderId: 'ord-1',
      settlementCents: -40,
    });
    expect(hold).toMatchObject({ orderId: null, originalOrderId: null, feeCurrency: null, settlementCents: 5000 });
  });

  it('beklenen sütun yoksa okumaz — biçimi değişmiş raporda yanlış komisyon yazılmasın', () => {
    expect(() => parsePayoutStatement(HEADER.replace('fee_amount', 'fee') + '\n')).toThrow(/fee_amount/);
  });
});

describe('ödeme başına komisyon', () => {
  it('tamamlanmış ödeme satırlarından toplanır; komisyonsuz, bekleyen ve başka birimdeki satır yazılmaz', () => {
    const fees = payoutPaymentFees([
      row({ orderId: 'a', feeCents: 30 }),
      row({ orderId: 'a', feeCents: 5 }),
      row({ orderId: 'b', feeCents: 0 }),
      row({ orderId: 'c', state: 'PENDING' }),
      row({ orderId: 'd', feeCurrency: 'USD' }),
      row({ orderId: 'e', type: 'Refund', feeCents: 10 }),
    ]);
    expect(fees).toEqual([{ paymentRef: 'a', feeCents: 35 }]);
  });
});

describe('defterin açıklayamadığı satırlar', () => {
  it('bilinmeyen ödeme ve ters ibraz sayılır; bilinen ödeme, onun iadesi ve geçici tutma sayılmaz', () => {
    const unexplained = unexplainedPayoutRows(
      [
        row({ orderId: 'bilinen' }),
        row({ orderId: 'yabanci' }),
        row({ type: 'Refund', orderId: 'iade-1', originalOrderId: 'bilinen' }),
        row({ type: 'Customer dispute - withdrawal', orderId: 'cb-1', originalOrderId: 'bilinen' }),
        row({ type: 'Irreducible balance hold', orderId: null, originalOrderId: null }),
      ],
      new Set(['bilinen']),
    );
    expect(unexplained.map((r) => r.orderId)).toEqual(['yabanci', 'cb-1']);
  });
});
