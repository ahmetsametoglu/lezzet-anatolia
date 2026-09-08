import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text, type ScrollView } from 'react-native';

import { ChatLayout, shouldStickToBottom } from './chat-layout';

/*
  DİBE YAPIŞMA (21.291 · kullanıcı kararı 08.09) — *"Scroll aşağıya çok yakınsa aşağı doğru
  çekmeli… ama kullanıcı yukarılarda eski mesajlaşmaları okuyorsa yeni gelen mesaj aşağı doğru
  kaydırmamalı."*

  KURAL ile BAĞLANTI ayrı ayrı sınanıyor ve bu bilinçli: jest düzen hesaplamıyor, `scrollToEnd`
  çağrısını ref taklidiyle yakalamak ölçüldüğü kadarıyla kırılgan (dosyadaki ikinci render'dan
  sonra olaylar sessizce yutuluyor). Kuralın kendisi saf bir işlev olduğu için tam olarak
  sınanabiliyor; bağlantı için tek bir bütünleşik iddia yetiyor.
*/
const olcum = (offsetY: number, contentHeight = 2000) => ({
  layoutMeasurement: { height: 600 },
  contentOffset: { y: offsetY },
  contentSize: { height: contentHeight },
});

describe('kural: dibe yapış', () => {
  it('TAM DİPTE — yapışır', () => {
    expect(shouldStickToBottom(olcum(1400))).toBe(true);
  });

  it('EŞİĞİN İÇİNDE (20 dp kalmış) — yapışır; bir parmak ucu kayma davranışı kapatmamalı', () => {
    expect(shouldStickToBottom(olcum(1380))).toBe(true);
  });

  it('EŞİĞİN DIŞINDA (100 dp kalmış) — YAPIŞMAZ', () => {
    // 80 dp eşiği bir baloncuk boyundan biraz büyük; 100 dp okuma niyetidir.
    expect(shouldStickToBottom(olcum(1300))).toBe(false);
  });

  it('YAZIŞMANIN BAŞINDA — yapışmaz; operatör geçmişi okuyor', () => {
    expect(shouldStickToBottom(olcum(0))).toBe(false);
  });

  it('İÇERİK EKRANDAN KISA — hep yapışır (kaydırılacak bir şey yok)', () => {
    // Negatif uzaklık: içerik kaba sığıyor. Eşik testi bunu da doğru tarafa koymalı.
    expect(shouldStickToBottom(olcum(0, 300))).toBe(true);
  });
});

describe('bağlantı: kural kaydırıcıya bağlı', () => {
  it('AÇILIŞTA dibe iner — yazışma en yenisiyle açılmalı', async () => {
    /* Açılışta hiç kaydırma olayı gelmez; başlangıç değeri "dipteyim" olmasaydı yazışma en eski
       mesajla açılırdı — iki aylık bir sohbette "merhaba" ekranı. */
    const scrollRef = { current: null } as { current: ScrollView | null };
    await render(
      <ChatLayout composer={<Text>çubuk</Text>} scrollRef={scrollRef} testID="thread">
        <Text>mesaj</Text>
      </ChatLayout>,
    );

    const scrollToEnd = jest.fn();
    (scrollRef.current as unknown as { scrollToEnd: unknown }) = { scrollToEnd } as never;
    fireEvent(screen.getByTestId('thread'), 'contentSizeChange', 400, 2000);

    expect(scrollToEnd).toHaveBeenCalled();
  });
});
