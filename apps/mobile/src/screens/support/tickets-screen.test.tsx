import { fireEvent, render, screen } from '@testing-library/react-native';

import { TicketsScreen } from './tickets-screen';
import { ticketsFixture } from './support-fixture';
import messages from './messages.json';

/*
  TALEPLERİM EKRAN TESTİ — kart içeriği (tür · kapsam · tarih · durum), boş durum ve iki geçiş
  (yeni talep · talep detayı).

  RNTL v14 tuzağı: aynı testte İKİNCİ bir `render` öncekini söker — her test tek render kullanır.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: unknown) => mockPush(href), back: () => mockBack() }),
}));

const t = messages.tr;

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
});

describe('TicketsScreen', () => {
  it('talep kartını çizer: tür, kapsam · tarih ve durum rozeti', async () => {
    await render(<TicketsScreen />);

    expect(screen.getByTestId('tickets-list')).toBeOnTheScreen();
    expect(screen.getByText(t.type.missing)).toBeOnTheScreen();
    // Kapsam siparişliyse referansla, değilse "Genel" — ikisi de sayfanın sözlüğünden kuruluyor.
    expect(screen.getByText('Sipariş LA-2411 · 30 Temmuz 2026')).toBeOnTheScreen();
    expect(screen.getByText('Genel · 6 Ağustos 2026')).toBeOnTheScreen();
    expect(screen.getByText(t.status.resolved)).toBeOnTheScreen();
    expect(screen.getByText(t.status.open)).toBeOnTheScreen();
  });

  it('karta basınca talep detayına NUMARAYLA gider', async () => {
    await render(<TicketsScreen />);

    await fireEvent.press(screen.getByTestId('ticket-T-108'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/support/[ticket]', params: { ticket: 'T-108' } });
  });

  it('başlıktaki "＋ Yeni" yeni talep sayfasını açar', async () => {
    await render(<TicketsScreen />);

    await fireEvent.press(screen.getByTestId('tickets-new'));

    expect(mockPush).toHaveBeenCalledWith('/support/new');
  });

  it('talep yoksa boş durum çıkar ve düğmesi yine yeni talebe gider', async () => {
    await render(<TicketsScreen tickets={[]} />);

    expect(screen.getByTestId('tickets-empty')).toBeOnTheScreen();
    expect(screen.getByText(t.list.empty.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('tickets-list')).toBeNull();

    await fireEvent.press(screen.getByTestId('tickets-empty-cta'));

    expect(mockPush).toHaveBeenCalledWith('/support/new');
  });

  it('geri düğmesi yığından çıkar', async () => {
    await render(<TicketsScreen tickets={ticketsFixture()} />);

    await fireEvent.press(screen.getByTestId('tickets-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
