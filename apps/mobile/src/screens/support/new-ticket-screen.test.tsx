import { fireEvent, render, screen } from '@testing-library/react-native';
import { TicketTypeEnum } from '@lezzet/types';

import { NewTicketScreen } from './new-ticket-screen';
import { ordersFixture } from '@/screens/orders/orders-fixture';
import messages from './messages.json';

/*
  YENİ TALEP EKRAN TESTİ — üç adımın akışı, sipariş detayından gelen kısayol, boş gönderimin
  reddi, kalem işaretinin gönderimi geçerli kılması ve başarı bloğu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: unknown) => mockPush(href), back: () => mockBack() }),
}));

const t = messages.tr;
const orders = ordersFixture();
const firstOrder = orders[0]!;

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
});

describe('NewTicketScreen', () => {
  it('ilk adım kapsam sorusudur; "genel" seçilince kalem ve konu sorulmaz', async () => {
    await render(<NewTicketScreen />);

    expect(screen.getByText(t.new.scope.question)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('new-ticket-scope-general'));

    expect(screen.getByText(t.new.message.title)).toBeOnTheScreen();
    expect(screen.queryByTestId(`new-ticket-type-${TicketTypeEnum.options[0]}`)).toBeNull();
  });

  it('"siparişimle ilgili" adımı sipariş listesini açar; seçim kalemleri getirir', async () => {
    await render(<NewTicketScreen />);

    await fireEvent.press(screen.getByTestId('new-ticket-scope-order'));
    expect(screen.getByText(t.new.order.question)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`new-ticket-order-${firstOrder.reference}`));

    expect(screen.getByText(t.new.items.eyebrow.replace('{reference}', firstOrder.reference))).toBeOnTheScreen();
    expect(screen.getByTestId(`new-ticket-line-${firstOrder.lines[0]!.id}`)).toBeOnTheScreen();
  });

  it('konu çipleri ŞEMADAN türer — elle yazılmış bir liste değil', async () => {
    await render(<NewTicketScreen orderReference={firstOrder.reference} />);

    for (const option of TicketTypeEnum.options) {
      expect(screen.getByTestId(`new-ticket-type-${option}`)).toBeOnTheScreen();
    }
    // Seçim ekran okuyucuya da gider (renk farkı ona ulaşmaz).
    await fireEvent.press(screen.getByTestId('new-ticket-type-damaged'));
    expect(screen.getByRole('button', { name: t.type.damaged, selected: true })).toBeOnTheScreen();
  });

  it('sipariş detayından gelindiğinde akış DOĞRUDAN forma açılır', async () => {
    await render(<NewTicketScreen orderReference={firstOrder.reference} />);

    expect(screen.queryByText(t.new.scope.question)).toBeNull();
    expect(screen.getByText(t.new.items.eyebrow.replace('{reference}', firstOrder.reference))).toBeOnTheScreen();
  });

  it('boş gönderim reddedilir; yazmaya başlayınca ret düşer', async () => {
    await render(<NewTicketScreen />);
    await fireEvent.press(screen.getByTestId('new-ticket-scope-general'));

    await fireEvent.press(screen.getByTestId('new-ticket-submit'));

    expect(screen.getByText(t.new.message.error)).toBeOnTheScreen();
    expect(screen.queryByTestId('new-ticket-sent')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('new-ticket-message'), 'Donuk ürün kaç gün durur?');

    expect(screen.queryByText(t.new.message.error)).toBeNull();
  });

  it('açıklama yazılınca gönderilir; başarı bloğu ne oluşturulduğunu söyler', async () => {
    await render(<NewTicketScreen />);
    await fireEvent.press(screen.getByTestId('new-ticket-scope-general'));
    await fireEvent.changeText(screen.getByTestId('new-ticket-message'), 'Donuk ürün kaç gün durur?');

    await fireEvent.press(screen.getByTestId('new-ticket-submit'));

    expect(screen.getByTestId('new-ticket-sent')).toBeOnTheScreen();
    // Siparişsiz talebin varsayılan konusu SORUDUR (şablonun kendi kuralı).
    expect(screen.getByText(new RegExp(`${t.type.question} · ${t.list.generalScope}`, 'u'))).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('new-ticket-sent-cta'));
    expect(mockPush).toHaveBeenCalledWith('/support');
  });

  it('yalnız kalem işaretlemek de gönderimi geçerli kılar (şablonun kapısı)', async () => {
    await render(<NewTicketScreen orderReference={firstOrder.reference} />);

    await fireEvent.press(screen.getByTestId(`new-ticket-line-${firstOrder.lines[0]!.id}`));
    await fireEvent.press(screen.getByTestId('new-ticket-submit'));

    expect(screen.getByTestId('new-ticket-sent')).toBeOnTheScreen();
  });

  it('fotoğraf ekleme kutusu durumunu bildirir (demo — gerçek seçici yok)', async () => {
    await render(<NewTicketScreen />);
    await fireEvent.press(screen.getByTestId('new-ticket-scope-general'));

    expect(screen.getByText(t.new.photo.add)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('new-ticket-photo'));

    expect(screen.getByText(t.new.photo.added)).toBeOnTheScreen();
  });

  it('siparişi olmayan müşteri çıkışsız kalmaz: genel talebe kapı açılır', async () => {
    await render(<NewTicketScreen orders={[]} />);

    await fireEvent.press(screen.getByTestId('new-ticket-scope-order'));
    expect(screen.getByText(t.new.order.none)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('new-ticket-order-none'));

    expect(screen.getByText(t.new.message.title)).toBeOnTheScreen();
  });
});
