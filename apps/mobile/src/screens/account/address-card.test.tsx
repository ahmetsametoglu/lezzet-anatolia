import { render, screen } from '@testing-library/react-native';

import type { MeAddress } from '@/lib/api/addresses';
import { AddressCard } from './address-card';
import messages from './messages.json';

/*
  KARTIN DÜZEN KURALI — üçüncü eylem satıra sığmaz.

  Tasarımın satırında İKİ eylem var ("varsayılan yap · Düzenle") ve eylemler `flex:none`: yeri
  metin bloğu verir. Fatura rolü tasarımdan SONRA doğdu; rolsüz bir adreste eylem sayısı üçe
  çıkıyor ve cihazda ölçüldü (09.09) — adres satırı 111 px'e sıkışıp kelime ortasından
  bölünüyordu ("12 Quai des Ba / teliers").

  Kusur uzun süre GÖRÜNMEDİ çünkü fatura rolünün kapısı ölü bir alana bağlıydı; kapı canlı ölçüte
  taşınınca ortaya çıktı. Test o yüzden hem SAYIYI hem düzeni tutuyor.
*/

const copy = messages.tr.addresses;

const ADRES: MeAddress = {
  id: 'addr-1',
  label: 'Ev',
  recipient: 'Ayşe Demir',
  phone: '+33624510988',
  country: 'FR',
  line1: '12 Quai des Bateliers',
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  isDefault: false,
  isBilling: false,
};

/** Kartın kökündeki düzen — `flexDirection: 'row'` ise tasarımın tek satırı. */
const kartDuzeni = () => {
  const flat = ([] as unknown[]).concat(screen.getByTestId('kart').props.style ?? []);
  return Object.assign({}, ...flat.filter((entry) => entry !== null && entry !== undefined));
};

describe('AddressCard düzeni', () => {
  it('İKİ eylemde tasarımın TEK SATIRI korunur', async () => {
    // Bireysel hesap: fatura rolü hiç çizilmez → "teslimat adresi yap" + "Düzenle" = iki eylem.
    await render(
      <AddressCard
        address={ADRES}
        copy={copy}
        onMakeDefault={jest.fn()}
        onMakeBilling={null}
        onEdit={jest.fn()}
        testID="kart"
      />,
    );

    expect(screen.getByTestId('kart-default')).toBeOnTheScreen();
    expect(screen.getByTestId('kart-edit')).toBeOnTheScreen();
    expect(screen.queryByTestId('kart-billing')).toBeNull();
    expect(kartDuzeni().flexDirection).toBe('row');
  });

  it('ÜÇ eylemde eylemler metnin ALTINA iner — adres satırı ezilmez', async () => {
    // Şirket hesabı + hiçbir rolü olmayan adres: üç eylem birden çıkar.
    await render(
      <AddressCard
        address={ADRES}
        copy={copy}
        onMakeDefault={jest.fn()}
        onMakeBilling={jest.fn()}
        onEdit={jest.fn()}
        testID="kart"
      />,
    );

    expect(screen.getByTestId('kart-default')).toBeOnTheScreen();
    expect(screen.getByTestId('kart-billing')).toBeOnTheScreen();
    expect(screen.getByTestId('kart-edit')).toBeOnTheScreen();
    // Kök artık satır DEĞİL: metin tam genişlik alır, eylemler alt şeride geçer.
    expect(kartDuzeni().flexDirection).toBeUndefined();
  });

  /* Rolü OLAN adreste o rolün eylemi düşer — üçüncü eylem doğmaz, satır yine tasarımın hâlinde. */
  it('şirket hesabında rolleri TAŞIYAN adres yine tek satırda kalır', async () => {
    await render(
      <AddressCard
        address={{ ...ADRES, isDefault: true, isBilling: true }}
        copy={copy}
        onMakeDefault={jest.fn()}
        onMakeBilling={jest.fn()}
        onEdit={jest.fn()}
        testID="kart"
      />,
    );

    expect(screen.queryByTestId('kart-default')).toBeNull();
    expect(screen.queryByTestId('kart-billing')).toBeNull();
    expect(kartDuzeni().flexDirection).toBe('row');
  });
});
