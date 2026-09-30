import { describe, expect, it } from 'vitest';
import { allowedDecisions, allowedReturnDispositions } from './decisions';

describe('allowedDecisions', () => {
  it('taslakta karar verilmez', () => {
    expect(allowedDecisions('draft')).toEqual([]);
  });

  it('teslimden önce kısmi karşılama ve iptal açıktır', () => {
    expect(allowedDecisions('confirmed')).toEqual(['partial_fulfillment', 'cancel']);
    expect(allowedDecisions('preparing')).toEqual(['partial_fulfillment', 'cancel']);
    expect(allowedDecisions('ready')).toEqual(['partial_fulfillment', 'cancel']);
  });

  it('yoldaki siparişte iptal YOK — makine izin vermiyor', () => {
    expect(allowedDecisions('out_for_delivery')).toEqual(['partial_fulfillment']);
  });

  it('teslimden sonra kısmi karşılama değil İADE açılır', () => {
    expect(allowedDecisions('delivered')).toEqual(['refund']);
  });

  it('kapanmış kayıtta iade hâlâ açıktır — şikâyet günler sonra gelir', () => {
    expect(allowedDecisions('completed')).toEqual(['refund']);
    expect(allowedDecisions('returned')).toEqual(['refund']);
  });

  it('iptal edilmiş siparişte hiçbir karar kalmaz', () => {
    expect(allowedDecisions('cancelled')).toEqual([]);
  });
});

describe('allowedReturnDispositions', () => {
  it('kapıda reddedilip dönen malda "müşteride kaldı" sunulmaz — mal müşteriye hiç ulaşmadı', () => {
    expect(allowedReturnDispositions(['confirmed', 'preparing', 'ready', 'out_for_delivery', 'returned'])).toEqual(['restock', 'discard']);
  });

  it('teslimden sonra iadeye dönen siparişte sunulur — durum aynı, geçmiş farklı', () => {
    expect(allowedReturnDispositions(['out_for_delivery', 'delivered', 'returned'])).toEqual(['restock', 'discard', 'goodwill']);
    expect(allowedReturnDispositions(['delivered', 'completed'])).toEqual(['restock', 'discard', 'goodwill']);
  });
});
