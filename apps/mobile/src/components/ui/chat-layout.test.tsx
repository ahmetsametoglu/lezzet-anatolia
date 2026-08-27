import { render, screen } from '@testing-library/react-native';
import { Text, TextInput, View } from 'react-native';

import { ChatLayout } from './chat-layout';

/*
  YAZIŞMA KABI — çivilenen karar TEK: **kaydırılan yalnız yazışmadır.**

  Üst şeritler (mod satırı, pencere bandı, etiketler) ve alttaki yazma çubuğu kaçınmanın İÇİNDE ama
  kaydırıcının DIŞINDA durur. Bu ayrım bozulursa arıza sessizdir ve yalnız cihazda görünür: çubuk
  kaydırma alanına girerse "yapışkan" olmaktan çıkar, yazarken ekrandan kayar.

  Ölçülen şey AĞACIN ŞEKLİ, piksel değil: hangi düğüm kaydırıcının altında, hangisi kardeşi.
  Klavyenin gerçekten alanı ittiği cihazda ölçülür ve `chat-layout.tsx` künyesinde ölçülmüş hâlde
  duruyor — jest stil işlemez, o iddiayı buradan kuramayız.
*/

function renderLayout() {
  return render(
    <ChatLayout
      above={<Text testID="band">Pencere açık</Text>}
      composer={
        <View testID="composer">
          <TextInput accessibilityLabel="Cevap" testID="reply" />
        </View>
      }
      testID="thread"
    >
      <Text testID="message">Merhaba</Text>
    </ChatLayout>,
  );
}

/** `testID`si verilen düğümün ATASI mı — ağaçta yukarı yürüyerek. */
function isInside(childTestId: string, ancestorTestId: string): boolean {
  let node = screen.getByTestId(childTestId).parent;
  while (node !== null) {
    if (node.props?.testID === ancestorTestId) return true;
    node = node.parent;
  }
  return false;
}

describe('ChatLayout', () => {
  it('üç parçayı da çizer', async () => {
    await renderLayout();

    expect(screen.getByTestId('band')).toBeOnTheScreen();
    expect(screen.getByTestId('message')).toBeOnTheScreen();
    expect(screen.getByTestId('composer')).toBeOnTheScreen();
  });

  it('yazışma kaydırıcının İÇİNDE', async () => {
    await renderLayout();

    expect(isInside('message', 'thread')).toBe(true);
  });

  it('yazma çubuğu kaydırıcının DIŞINDA — yapışkanlığın kendisi budur', async () => {
    await renderLayout();

    expect(isInside('composer', 'thread')).toBe(false);
  });

  it('üst şeritler de kaydırıcının DIŞINDA — yazışmayla birlikte kaymazlar', async () => {
    await renderLayout();

    expect(isInside('band', 'thread')).toBe(false);
  });

  it('üst şerit isteğe bağlı — vermeyen ekran boş bir kutu çizmez', async () => {
    await render(
      <ChatLayout composer={<View testID="composer" />} testID="thread">
        <Text testID="message">Merhaba</Text>
      </ChatLayout>,
    );

    expect(screen.queryByTestId('band')).toBeNull();
    expect(screen.getByTestId('message')).toBeOnTheScreen();
  });
});
