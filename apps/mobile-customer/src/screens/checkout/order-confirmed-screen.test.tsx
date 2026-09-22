import { render, screen } from '@testing-library/react-native';
import type { CheckoutOrderStatus } from '@lezzet/types';

import { OrderConfirmedScreen } from './order-confirmed-screen';
import messages from '@lezzet/i18n/customer/checkout';

/*
  Numara ya vardır ya hiç yazılmaz: kart yolunda sipariş ödeme kartı kapandığında hâlâ taslaktır. Ekran o hâlde sonucu sunucudan
  bekler ve web onay sayfasının hâllerini çizer; sunucu ve zil sahtedir, komşu daveti bu dosyanın konusu değildir.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('./use-neighbor-invite.hook', () => ({ useOrderNeighborInvite: () => null }));

const mockStatus = jest.fn<Promise<unknown>, [string, string]>();
jest.mock('@/lib/api/checkout', () => ({ fetchCheckoutOrderStatus: (locale: string, id: string) => mockStatus(locale, id) }));
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
  referenceNo: null,
  channel: `order:${ORDER_ID}`,
};
const cevap = (data: CheckoutOrderStatus) => mockStatus.mockResolvedValue({ data, error: null, status: 200 });

function kartYolu() {
  return render(
    <OrderConfirmedScreen orderId={ORDER_ID} reference={null} totalCents={2000} deliveryLabel="Kargoyla gönderim" paymentLabel="Kart" />,
  );
}

beforeEach(() => mockStatus.mockReset());

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

  it('ödeme tamamlanmadıysa ret çizilir ve çıkış sepete döner', async () => {
    cevap({ ...taslak, paymentState: 'incomplete' });
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
