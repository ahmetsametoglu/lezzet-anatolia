import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CheckoutOrderStatus } from '@lezzet/types';

import { OrderConfirmedScreen } from './order-confirmed-screen';
import messages from '@lezzet/i18n/customer/checkout';

/*
  Numara ya vardır ya hiç yazılmaz: kart yolunda sipariş ödeme kartı kapandığında hâlâ taslaktır. Ekran o hâlde sonucu sunucudan
  bekler ve web onay sayfasının hâllerini çizer; sunucu ve zil sahtedir, komşu daveti bu dosyanın konusu değildir.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }) }));
jest.mock('./use-neighbor-invite.hook', () => ({ useOrderNeighborInvite: () => null }));

const mockStatus = jest.fn<Promise<unknown>, [string, string]>();
const mockResume = jest.fn<Promise<unknown>, [string, string]>();
const mockCancel = jest.fn<Promise<unknown>, [string, string]>();
jest.mock('@/lib/api/checkout', () => ({
  fetchCheckoutOrderStatus: (locale: string, id: string) => mockStatus(locale, id),
  resumeCheckoutPayment: (locale: string, id: string) => mockResume(locale, id),
  cancelPendingCheckoutOrder: (locale: string, id: string) => mockCancel(locale, id),
}));
const mockPresentPayment = jest.fn<Promise<unknown>, [{ paymentToken: string }]>();
jest.mock('@/lib/payment/payment-sheet', () => ({ presentPayment: (input: { paymentToken: string }) => mockPresentPayment(input) }));
const mockRefreshCart = jest.fn();
jest.mock('@/screens/customer-kit/cart-store', () => ({ refreshCart: () => mockRefreshCart() }));
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { getSupabase: () => ({ channel: () => channel, removeChannel: async () => undefined }) };
});

const t = messages.tr.confirmed;
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

const taslak: CheckoutOrderStatus = {
  placed: false,
  cancelled: false,
  refunded: false,
  awaitingCard: true,
  paymentState: null,
  payBy: null,
  referenceNo: null,
  channel: `order:${ORDER_ID}`,
  totalCents: 2000,
  deliveryType: 'shipping',
  deliveryDate: null,
};
const cevap = (data: CheckoutOrderStatus) => mockStatus.mockResolvedValue({ data, error: null, status: 200 });

function kartYolu() {
  return render(
    <OrderConfirmedScreen orderId={ORDER_ID} reference={null} totalCents={2000} deliveryLabel="Kargoyla gönderim" paymentLabel="Kart" />,
  );
}

beforeEach(() => {
  for (const mock of [mockStatus, mockResume, mockCancel, mockPresentPayment, mockRefreshCart, mockReplace]) mock.mockReset();
});

describe('OrderConfirmedScreen — numarası belli sipariş', () => {
  it('numarayı çizer ve durumu sormaz', async () => {
    await render(
      <OrderConfirmedScreen orderId={ORDER_ID} reference="LA-26-7K4M2P" totalCents={2000} deliveryLabel="Kargoyla gönderim" paymentLabel="Havale ile öde" />,
    );

    expect(screen.getByText(t.reference.replace('{reference}', 'LA-26-7K4M2P'))).toBeOnTheScreen();
    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('tutar okunamadıysa "bilinmiyor" yazar', async () => {
    await render(
      <OrderConfirmedScreen orderId={ORDER_ID} reference="LA-26-7K4M2P" totalCents={null} deliveryLabel="Kargoyla gönderim" paymentLabel="Havale ile öde" />,
    );

    expect(screen.getByText(t.unknown)).toBeOnTheScreen();
  });
});

describe('OrderConfirmedScreen — kart ödemesinin sonucu beklenir', () => {
  it('cevap gelmeden "onaylanıyor" der, numara satırı doğmaz', async () => {
    mockStatus.mockReturnValue(new Promise(() => undefined));
    await kartYolu();

    expect(screen.getByText(t.pending)).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-mark-waiting')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirmed-reference')).toBeNull();
    expect(mockStatus).toHaveBeenCalledWith('tr', ORDER_ID);
  });

  it('sipariş kesinleşince onay başlığı ve sunucunun verdiği numara çizilir', async () => {
    cevap({ ...taslak, placed: true, awaitingCard: false, referenceNo: 'LA-26-9Q3W' });
    await kartYolu();

    expect(await screen.findByText(t.title)).toBeOnTheScreen();
    expect(screen.getByText(t.reference.replace('{reference}', 'LA-26-9Q3W'))).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-orders')).toBeOnTheScreen();
  });

  it('ödemesi kapanan sipariş ret çizer ve çıkış sepete döner', async () => {
    cevap({ ...taslak, awaitingCard: false, cancelled: true });
    await kartYolu();

    expect(await screen.findByText(t.failed)).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-mark-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-retry')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirmed-orders')).toBeNull();
  });

  it('parası iade edilmiş iptal kendi cümlesiyle söylenir', async () => {
    cevap({ ...taslak, awaitingCard: false, cancelled: true, refunded: true });
    await kartYolu();

    expect(await screen.findByText(t.refunded)).toBeOnTheScreen();
    expect(screen.getByText(t.refundedBody)).toBeOnTheScreen();
  });
});

describe('OrderConfirmedScreen — ödemesi gerçekleşmeyen sipariş', () => {
  const eksik = { ...taslak, paymentState: 'incomplete' as const, payBy: '2026-09-29T12:33:00.000Z' };

  // Tamamlanmayan ödeme ret gibi çizilirse müşteri ödenebilir siparişini kapatılmış sanar ve ödemeye dönemez.
  it('not, son saat, "ödemeyi tamamla" ve "iptal et" çizilir; ret çıkışı yoktur', async () => {
    cevap(eksik);
    await kartYolu();

    expect(await screen.findByText(t.unpaid)).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-mark-waiting')).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-pay-by')).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-pay')).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-cancel')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirmed-retry')).toBeNull();
  });

  // Ödemeye dönüş yeni sipariş açsaydı ya da başka anahtarla ödeseydi aynı sipariş iki kez ödenebilirdi.
  it('ödemeyi tamamla aynı ödemenin anahtarıyla kartı açar, geçince durum yeniden sorulur', async () => {
    cevap(eksik);
    mockResume.mockResolvedValue({
      data: { status: 'payment_required', orderId: ORDER_ID, paymentToken: 'rv_token_1' },
      error: null,
      status: 200,
    });
    mockPresentPayment.mockResolvedValue({ status: 'succeeded' });
    await kartYolu();
    await screen.findByText(t.unpaid);
    const sorular = mockStatus.mock.calls.length;

    await fireEvent.press(screen.getByTestId('confirmed-pay'));

    await waitFor(() => expect(mockStatus.mock.calls.length).toBeGreaterThan(sorular));
    expect(mockResume).toHaveBeenCalledWith('tr', ORDER_ID);
    expect(mockPresentPayment).toHaveBeenCalledWith({ paymentToken: 'rv_token_1' });
  });

  // İptalden sonra sepete gidilmez ya da sepet tazelenmezse müşteri geri dönen ürünlerini göremez.
  it('iptal edilen siparişin kalemleri sepete döner: sepet tazelenir ve sepete gidilir', async () => {
    cevap(eksik);
    mockCancel.mockResolvedValue({ data: { status: 'cancelled' }, error: null, status: 200 });
    await kartYolu();
    await screen.findByText(t.unpaid);

    await fireEvent.press(screen.getByTestId('confirmed-cancel'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cart'));
    expect(mockCancel).toHaveBeenCalledWith('tr', ORDER_ID);
    expect(mockRefreshCart).toHaveBeenCalled();
  });
});
