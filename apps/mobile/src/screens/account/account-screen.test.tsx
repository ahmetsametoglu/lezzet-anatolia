import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountScreen } from './account-screen';
import messages from './messages.json';

/*
  HESAP EKRANI TESTİ — bu turda EKLENEN şey ekranın ÇIKIŞLARIDIR (21.14 ikinci dilim): profil
  düzenleme, taleplerim, bize yazın ve adres düğmeleri artık gerçek sayfalara gidiyor. Testin
  koruduğu değişmez de bu: bir gün biri bu satırları yer tutucuya geri bağlarsa kırmızı yanar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

const t = messages.tr;

beforeEach(() => {
  mockPush.mockReset();
});

describe('AccountScreen', () => {
  it('profil "Düzenle" düzenleme sayfasına gider', async () => {
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByTestId('account-edit'));

    expect(mockPush).toHaveBeenCalledWith('/account/edit');
  });

  it('menüdeki "Taleplerim" ve "Bize yazın" destek sayfalarına gider', async () => {
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByTestId('account-menu-tickets'));
    expect(mockPush).toHaveBeenCalledWith('/support');

    await fireEvent.press(screen.getByTestId('account-menu-write'));
    expect(mockPush).toHaveBeenCalledWith('/support/new');
  });

  it('adres satırları düzenleme sayfasına gider; adres metni parçalarından kurulur', async () => {
    await render(<AccountScreen />);

    expect(screen.getByText('12 Quai des Bateliers, 67000 Strasbourg')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('account-address-add'));
    expect(mockPush).toHaveBeenCalledWith('/account/edit');

    await fireEvent.press(screen.getByTestId('account-address-home-edit'));
    expect(mockPush).toHaveBeenLastCalledWith('/account/edit');
  });

  it('"varsayılan yap" rozeti taşır (ekranın kendi durumu)', async () => {
    await render(<AccountScreen />);

    expect(screen.getByText(t.addresses.default)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('account-address-work-default'));

    expect(screen.getByTestId('account-address-home-default')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-address-work-default')).toBeNull();
  });

  it('misafirde doğrulama kapısı çıkar, menü çıkmaz', async () => {
    await render(<AccountScreen signedIn={false} />);

    expect(screen.getByTestId('account-guest')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-menu-tickets')).toBeNull();

    await fireEvent.press(screen.getByTestId('account-login'));

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
