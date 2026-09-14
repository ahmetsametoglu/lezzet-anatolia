import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsQuantityBox } from './quantity-box';

/*
  ADET KUTUSU (21.254) — D2 ve D5'in ortak sağ ucu. İki hâlin dördü de metinden ölçülür: dolu rakam,
  kesikli davet rakamı, rakamsız davet ve "henüz yok" çizgisi. Altyazı görsel kademe, ekran
  okuyucuya düğmenin adı gider.
*/
describe('OperationsQuantityBox', () => {
  it('dolu kutu rakamı ve altyazıyı yazar, dokunuş çağıranındır', async () => {
    const onPress = jest.fn();
    await render(<OperationsQuantityBox value={6} caption="ADET" onPress={onPress} accessibilityLabel="Mantı için gelen adet" testID="box" />);

    expect(screen.getByTestId('box-value')).toHaveTextContent('6');
    expect(screen.getByTestId('box-caption', { includeHiddenElements: true })).toHaveTextContent('ADET');
    await fireEvent.press(screen.getByTestId('box'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('kesikli kutu DAVET rakamını gösterir — beyan edilmemiş sayı, "—" değil', async () => {
    await render(
      <OperationsQuantityBox value={null} placeholderValue={30} caption="BEKLENEN" dashed tone="muted" onPress={() => {}} accessibilityLabel="say" testID="box" />,
    );

    expect(screen.getByTestId('box-value')).toHaveTextContent('30');
    expect(screen.getByTestId('box-caption', { includeHiddenElements: true })).toHaveTextContent('BEKLENEN');
  });

  it('davet rakamı yoksa etiket yazar ("say →"); etiket de yoksa "—"', async () => {
    await render(
      <>
        <OperationsQuantityBox value={null} label="say →" dashed onPress={() => {}} accessibilityLabel="say" testID="a" />
        <OperationsQuantityBox value={null} caption="ADET" onPress={() => {}} accessibilityLabel="adet" testID="b" />
      </>,
    );

    expect(screen.getByTestId('a-label')).toHaveTextContent('say →');
    expect(screen.getByTestId('b-value')).toHaveTextContent('—');
  });
});
