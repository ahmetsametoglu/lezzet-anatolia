import { fireEvent, render, screen } from '@testing-library/react-native';

import { TicketDetailScreen } from './ticket-detail-screen';
import { ticketsFixture } from './support-fixture';
import messages from './messages.json';

/*
  TALEP DETAY EKRAN TESTİ — yazışmanın çizimi, sonuç bloğu, boş mesajın engellenmesi, gönderilen
  mesajın yazışmada belirmesi, çözülmüş talebin YENİDEN AÇILMASI ve bulunamayan numara.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: unknown) => mockPush(href), back: () => mockBack() }),
}));

const t = messages.tr;
const resolved = ticketsFixture()[0]!;
const open = ticketsFixture()[1]!;

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
});

describe('TicketDetailScreen', () => {
  it('yazışmayı, kapsam satırını ve sonuç bloğunu çizer', async () => {
    await render(<TicketDetailScreen id={resolved.id} ticket={resolved} />);

    expect(screen.getByTestId('ticket-thread')).toBeOnTheScreen();
    expect(screen.getByTestId('ticket-meta')).toHaveTextContent('Sipariş LA-2411 · 30 Temmuz 2026');
    expect(screen.getByTestId('ticket-resolution')).toHaveTextContent(
      t.detail.resolution.replace('{value}', resolved.resolutionLabel!),
    );
    expect(screen.getByText(resolved.messages[0]!.body)).toBeOnTheScreen();
    expect(screen.getByText(t.detail.notice)).toBeOnTheScreen();
  });

  it('baloncuğun KİMLİĞİ ekran okuyucuya gider — hiza tek başına yetmez', async () => {
    await render(<TicketDetailScreen id={resolved.id} ticket={resolved} />);

    expect(screen.getByLabelText(`${t.detail.fromCustomer}: ${resolved.messages[0]!.body}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${t.detail.fromTeam}: ${resolved.messages[1]!.body}`)).toBeOnTheScreen();
  });

  it('boş mesaj gönderilemez: düğme ENGELLİ ve yazışma büyümez', async () => {
    await render(<TicketDetailScreen id={open.id} ticket={open} />);

    expect(screen.getByTestId('ticket-send')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('ticket-send'));

    expect(screen.getAllByLabelText(/^Siz: /u)).toHaveLength(1);
  });

  it('yazılan mesaj yazışmada belirir ve kutu boşalır', async () => {
    await render(<TicketDetailScreen id={open.id} ticket={open} />);

    await fireEvent.changeText(screen.getByTestId('ticket-reply'), 'Teşekkürler, anladım.');
    await fireEvent.press(screen.getByTestId('ticket-send'));

    expect(screen.getByText('Teşekkürler, anladım.')).toBeOnTheScreen();
    expect(screen.getByTestId('ticket-reply').props.value).toBe('');
  });

  it('çözülmüş talebe yazmak onu yeniden AÇAR (şema: resolved → open)', async () => {
    await render(<TicketDetailScreen id={resolved.id} ticket={resolved} />);

    expect(screen.getByTestId('ticket-status')).toHaveTextContent(t.status.resolved);

    await fireEvent.changeText(screen.getByTestId('ticket-reply'), 'Sorun tekrarladı.');
    await fireEvent.press(screen.getByTestId('ticket-send'));

    expect(screen.getByTestId('ticket-status')).toHaveTextContent(t.status.open);
  });

  it('bulunamayan numara sessiz değil: bulunamadı bloğu çıkar ve listeye götürür', async () => {
    await render(<TicketDetailScreen id="T-999" ticket={null} />);

    expect(screen.getByTestId('ticket-not-found')).toBeOnTheScreen();
    expect(screen.queryByTestId('ticket-thread')).toBeNull();

    await fireEvent.press(screen.getByTestId('ticket-not-found-cta'));

    expect(mockPush).toHaveBeenCalledWith('/support');
  });
});
