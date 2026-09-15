import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SuggestionList } from './suggestion-list';

/*
  ÖNERİ LİSTESİ — satırın rozet yuvası ve künyenin iki biçimi (21.313). Rozetin KARARI çağıranda;
  burada sınanan liste onu yerine koyuyor mu. Künye metin ya da öğe olabilir (BAN'ın cümlesi, Google'ın
  logosu) ve ikisi de kaydırma alanının DIŞINDA çizilir.
*/

const ROW = { id: 'a', title: '12 rue des Fleurs', subtitle: '67000 Strasbourg' };

describe('SuggestionList', () => {
  it('satırın rozetini çizer ve seçimi kimlikle bildirir', async () => {
    const onSelect = jest.fn();
    await render(
      <SuggestionList
        items={[{ ...ROW, badge: <Text>kapıya teslim</Text> }]}
        onSelect={onSelect}
        icon="pin"
        accessibilityLabel="Adres önerileri"
        testID="list"
      />,
    );

    expect(screen.getByText('kapıya teslim')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('list-0'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('künye metin de öğe de olabilir', async () => {
    const { rerender } = await render(
      <SuggestionList items={[ROW]} onSelect={jest.fn()} footnote="Adresler: BAN" accessibilityLabel="Adres önerileri" />,
    );
    expect(screen.getByText('Adresler: BAN')).toBeOnTheScreen();

    await rerender(
      <SuggestionList items={[ROW]} onSelect={jest.fn()} footnote={<Text>Google Maps</Text>} accessibilityLabel="Adres önerileri" />,
    );
    expect(screen.getByText('Google Maps')).toBeOnTheScreen();
  });

  it('boş listede hiçbir şey çizmez — künye de', async () => {
    await render(<SuggestionList items={[]} onSelect={jest.fn()} footnote="Adresler: BAN" accessibilityLabel="Adres önerileri" />);
    expect(screen.queryByText('Adresler: BAN')).toBeNull();
  });
});
