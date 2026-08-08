import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileEditScreen } from './profile-edit-screen';
import { accountData } from './account-fixture';
import messages from './messages.json';

/*
  PROFİL DÜZENLEME EKRAN TESTİ — alanların yüklenmesi, kaydetme onayı, adres formunun iki hâli
  (yeni · düzenleme), doğrulama kapısı, posta kodu süzgeci, silme ve varsayılan yapma.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: unknown) => mockPush(href), back: () => mockBack() }),
}));

const t = messages.tr;
const data = accountData();

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
});

describe('ProfileEditScreen', () => {
  it('alanları hesabın bilgileriyle doldurur ve telefon notunu yazar', async () => {
    await render(<ProfileEditScreen />);

    expect(screen.getByTestId('profile-name').props.value).toBe(data.name);
    expect(screen.getByTestId('profile-email').props.value).toBe(data.email);
    expect(screen.getByTestId('profile-phone').props.value).toBe(data.phone);
    expect(screen.getByText(t.edit.phoneNote)).toBeOnTheScreen();
  });

  it('kaydetme onayı ekranda kalır; alan değişince onay düşer', async () => {
    await render(<ProfileEditScreen />);

    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Ayşe Demir-Yılmaz');
    await fireEvent.press(screen.getByTestId('profile-save'));

    expect(screen.getByTestId('profile-saved')).toHaveTextContent(t.edit.saved);

    await fireEvent.changeText(screen.getByTestId('profile-email'), 'yeni@example.fr');

    expect(screen.queryByTestId('profile-saved')).toBeNull();
  });

  it('adres listesi tek satır adresi PARÇALARINDAN kurar', async () => {
    await render(<ProfileEditScreen />);

    expect(screen.getByText('12 Quai des Bateliers, 67000 Strasbourg')).toBeOnTheScreen();
    // Varsayılan rozeti yalnız varsayılan adreste; öteki kartta "varsayılan yap" çıkar.
    expect(screen.getByText(t.addresses.default)).toBeOnTheScreen();
    expect(screen.getByTestId('profile-address-work-default')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-address-home-default')).toBeNull();
  });

  it('"varsayılan yap" rozeti taşır', async () => {
    await render(<ProfileEditScreen />);

    await fireEvent.press(screen.getByTestId('profile-address-work-default'));

    expect(screen.getByTestId('profile-address-home-default')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-address-work-default')).toBeNull();
  });

  it('adres düzenleme formu KAYITLI adresle açılır ve silme düğmesi taşır', async () => {
    await render(<ProfileEditScreen />);

    await fireEvent.press(screen.getByTestId('profile-address-home-edit'));

    expect(screen.getByText(t.edit.address.editTitle)).toBeOnTheScreen();
    expect(screen.getByTestId('profile-address-street').props.value).toBe('12 Quai des Bateliers');
    expect(screen.getByTestId('profile-address-delete')).toBeOnTheScreen();
  });

  it('yeni adres formu BOŞ açılır, silme düğmesi TAŞIMAZ ve eksik alanla kaydedilmez', async () => {
    await render(<ProfileEditScreen />);

    await fireEvent.press(screen.getByTestId('profile-address-add'));

    expect(screen.getByText(t.edit.address.newTitle)).toBeOnTheScreen();
    expect(screen.getByTestId('profile-address-label').props.value).toBe('');
    expect(screen.queryByTestId('profile-address-delete')).toBeNull();

    await fireEvent.press(screen.getByTestId('profile-address-save'));

    expect(screen.getByTestId('profile-address-error')).toHaveTextContent(t.edit.address.error);
  });

  it('yeni adres kaydedilince listeye girer ve onay yazılır', async () => {
    await render(<ProfileEditScreen />);
    await fireEvent.press(screen.getByTestId('profile-address-add'));

    await fireEvent.changeText(screen.getByTestId('profile-address-label'), 'Yazlık');
    await fireEvent.changeText(screen.getByTestId('profile-address-street'), '5 Rue Neuve');
    // Posta kodu SÜZGEÇTEN geçer: harf girilmez, beş haneden uzun olmaz.
    await fireEvent.changeText(screen.getByTestId('profile-address-zip'), '67AB0001');
    expect(screen.getByTestId('profile-address-zip').props.value).toBe('67000');
    await fireEvent.changeText(screen.getByTestId('profile-address-city'), 'Colmar');

    await fireEvent.press(screen.getByTestId('profile-address-save'));

    expect(screen.getByText('5 Rue Neuve, 67000 Colmar')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-address-feedback')).toHaveTextContent(t.edit.address.saved);
  });

  it('adres silinince listeden çıkar', async () => {
    await render(<ProfileEditScreen />);
    await fireEvent.press(screen.getByTestId('profile-address-work-edit'));

    await fireEvent.press(screen.getByTestId('profile-address-delete'));

    expect(screen.queryByTestId('profile-address-work')).toBeNull();
    expect(screen.getByTestId('profile-address-feedback')).toHaveTextContent(t.edit.address.deleted);
  });

  it('geri düğmesi yığından çıkar', async () => {
    await render(<ProfileEditScreen />);

    await fireEvent.press(screen.getByTestId('profile-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
