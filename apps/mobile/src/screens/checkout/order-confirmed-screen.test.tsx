import { render, screen } from '@testing-library/react-native';

import { OrderConfirmedScreen } from './order-confirmed-screen';
import messages from './messages.json';

/*
  SİPARİŞ ALINDI — NUMARANIN İKİ HÂLİ (27.08 · eski `BEKLEYEN(21.14)`).

  Çivilenen karar: **numara ya vardır ya hiç yazılmaz.** Sipariş numarası ilk kalıcı durumda doğuyor
  (`confirmed`); kapıda/vadeli ödemede sipariş bu çağrıda kesinleştiği için numara gelir, kart
  yolunda ise sipariş ödeme kartı kapandığı an hâlâ TASLAKTIR ve numara yoktur — onayı webhook
  yazar, saniyeler sonra.

  Neden test: "bilinmiyor" ya da boş bir "Sipariş no:" satırı, olmayan bir numaradan kötüdür —
  müşteri onu okuyup destek hattına yazar. Tutarın kendi "bilinmiyor" hâli VARDIR ve o ayrı bir
  karar (ekran künyesi); numaranınki yok.

  Komşu daveti bu dosyanın konusu değil: kancası ağ turu açıyor, sahtelendi (davetsiz hâlde şerit
  zaten çizilmiyor).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('./use-neighbor-invite.hook', () => ({ useOrderNeighborInvite: () => null }));

const t = messages.tr.confirmed;

const ORDER_ID = '22222222-2222-4222-8222-222222222222';

describe('OrderConfirmedScreen — sipariş numarası', () => {
  it('numara VARSA satırı çizer', async () => {
    await render(
      <OrderConfirmedScreen
        orderId={ORDER_ID}
        reference="LA-26-7K4M2P"
        totalCents={2000}
        deliveryLabel="Kargoyla gönderim"
        paymentLabel="Havale ile öde"
      />,
    );

    expect(screen.getByTestId('confirmed-reference')).toBeOnTheScreen();
    expect(screen.getByText(t.reference.replace('{reference}', 'LA-26-7K4M2P'))).toBeOnTheScreen();
  });

  it('numara YOKSA satır HİÇ doğmaz — "bilinmiyor" yazan bir sipariş no yazılmaz', async () => {
    await render(
      <OrderConfirmedScreen
        orderId={ORDER_ID}
        reference={null}
        totalCents={2000}
        deliveryLabel="Kargoyla gönderim"
        paymentLabel="Havale ile öde"
      />,
    );

    expect(screen.queryByTestId('confirmed-reference')).toBeNull();
    // Ekranın kendisi yerinde: eksik olan yalnız numara.
    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-summary')).toBeOnTheScreen();
  });

  it('TUTAR okunamadıysa "bilinmiyor" yazar — numaradan farklı, çünkü satırın kendisi zorunlu', async () => {
    await render(
      <OrderConfirmedScreen
        orderId={ORDER_ID}
        reference="LA-26-7K4M2P"
        totalCents={null}
        deliveryLabel="Kargoyla gönderim"
        paymentLabel="Havale ile öde"
      />,
    );

    expect(screen.getByText(t.unknown)).toBeOnTheScreen();
  });
});
