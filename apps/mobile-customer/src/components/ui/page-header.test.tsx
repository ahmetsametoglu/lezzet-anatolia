import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';

import { PageHeaderBar, PageHeaderHero, usePageHeader } from './page-header';

/*
  Küçük ad büyük başlık satırın altına tamamen girmeden belirirse aynı kelime ekranda iki kez durur; girdikten sonra belirmezse
  ekranın adı görünmez olur.
*/

function Harness() {
  const page = usePageHeader();
  return (
    <>
      <PageHeaderBar title="Siparişlerim" collapsed={page.collapsed} backLabel="Geri" onBack={() => undefined} />
      <Text testID="collapsed">{String(page.collapsed)}</Text>
      <ScrollView testID="scroller" onScroll={page.onScroll}>
        <PageHeaderHero eyebrow="HESABIM" title="Siparişlerim" onTitleLayout={page.onTitleLayout} />
      </ScrollView>
    </>
  );
}

const scrollTo = (y: number) => fireEvent.scroll(screen.getByTestId('scroller'), { nativeEvent: { contentOffset: { x: 0, y } } });

describe('usePageHeader', () => {
  it('küçük ad yalnız büyük başlığın alt kenarı kaydırılıp geçilince belirir, geri kaydırınca kaybolur', async () => {
    await render(<Harness />);
    await fireEvent(screen.getByRole('header'), 'layout', { nativeEvent: { layout: { x: 0, y: 20, width: 300, height: 34 } } });

    await scrollTo(40);
    expect(screen.getByTestId('collapsed')).toHaveTextContent('false');

    await scrollTo(54);
    expect(screen.getByTestId('collapsed')).toHaveTextContent('true');

    await scrollTo(10);
    expect(screen.getByTestId('collapsed')).toHaveTextContent('false');
  });
});
