import { FRAME_RATIOS, IMAGE_WIDTHS, srcSetOf, type CatalogImage, type FrameKey, type ImageFrameSources } from '@lezzet/types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import { FrameImage } from './frame-image';

/*
  ÇERÇEVELİ GÖRSEL — native'in katalog görselini CDN'den HANGİ adresle istediği.

  Seçim kuralının kendisi (oran → çerçeve, boy → basamak, yukarı yuvarlama) merkezi kütüphanenin
  testinde ölçülüyor (`packages/types/src/primitives/image-frames.test.ts`); burada sorulan soru
  komponentin o kurala DOĞRU KUTUYU verip vermediği: çağıranın bildiği kutu ilk karede, bilinmeyen
  kutu ölçüldükten sonra — ve ölçüm gelmeden hiçbir adres istenmemesi (yanlış basamağı indirmek,
  bir kare beklemekten pahalı). Bir de BİÇİM: native ağ katmanı `Accept` göndermiyor ve başlıksız
  istek CDN'den JPEG döner (künye) — başlık düşerse her görsel ~%30 büyür ve hiçbir şey kırılmaz,
  yani yalnız test yakalar.
*/

/** Her çerçevenin her basamağı ayırt edilebilir bir adres taşır: `<taban>/<çerçeve>/<genişlik>`. */
function framesOf(base: string): ImageFrameSources {
  return Object.fromEntries(
    (Object.keys(FRAME_RATIOS) as FrameKey[]).map((key) => [
      key,
      {
        src: `${base}/${key}/800`,
        srcSet: srcSetOf(IMAGE_WIDTHS.map((width) => ({ url: `${base}/${key}/${width}`, width }))),
      },
    ]),
  ) as ImageFrameSources;
}

const CDN = 'https://cdn.test';
const ORIGINAL = 'https://r2.test/urun.jpg';
const CROP = { x: 50, y: 50, zoom: 100 };
const framed: CatalogImage = { url: ORIGINAL, crop: CROP, frames: framesOf(CDN) };

function sourceOf(testID: string) {
  return screen.getByTestId(testID).props.source as { uri: string; headers?: Record<string, string> } | undefined;
}

async function layout(testID: string, width: number, height: number) {
  await fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { width, height, x: 0, y: 0 } } });
}

describe('FrameImage', () => {
  beforeEach(() => {
    // Ölçüm cihazın yoğunluğuyla çarpılır; testte sabitlenir ki beklenen basamak hesaplanabilsin.
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('türev yoksa özgün dosyayı ister — ölçüm beklemeden', async () => {
    await render(<FrameImage image={{ url: ORIGINAL, crop: CROP, frames: null }} testID="photo" />);
    expect(sourceOf('photo')?.uri).toBe(ORIGINAL);
  });

  it('kutu çağırandan biliniyorsa ilk karede, kutuya YETEN basamaktan ister', async () => {
    // 46 dp daire × 3 = 138 px → kare çerçevenin 200'lük basamağı (altındaki 144 yok, yukarı yuvarlanır).
    await render(<FrameImage image={framed} box={{ width: 46, height: 46 }} testID="photo" />);
    expect(sourceOf('photo')?.uri).toBe(`${CDN}/square/200`);
  });

  it('kutu bilinmiyorsa ölçüm gelene kadar adres İSTENMEZ, sonra oranın çerçevesi gelir', async () => {
    await render(<FrameImage image={framed} testID="photo" />);
    expect(sourceOf('photo')).toBeUndefined();

    // 390 × 260 = 1,5 → özgün oranın çerçevesi; 390 × 3 = 1170 px → 1200'lük basamak.
    await layout('photo', 390, 260);
    expect(sourceOf('photo')?.uri).toBe(`${CDN}/source/1200`);
  });

  it("WebP ister — AVIF istemez (Android çözücüsü açmıyor), JPEG'e de düşmez", async () => {
    await render(<FrameImage image={framed} box={{ width: 46, height: 46 }} testID="photo" />);
    const accept = sourceOf('photo')?.headers?.Accept ?? '';
    expect(accept).toContain('image/webp');
    expect(accept).not.toContain('image/avif');
  });

  it('çağıranın kendi `onLayout`u ölçüm yüzünden kaybolmaz', async () => {
    const onLayout = jest.fn();
    await render(<FrameImage image={framed} onLayout={onLayout} testID="photo" />);
    await layout('photo', 200, 200);
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});
