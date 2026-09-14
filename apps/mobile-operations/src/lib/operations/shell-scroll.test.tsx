import { act, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { useOperationsShellScroll, OperationsShellScrollProvider } from './shell-scroll';

/*
  KABUĞUN KAYDIRMA DURUMU — ekran değişiminde hizalama (21.290).

  Sınanan şey `syncTo`: kaydırma durumu KABUKTA yaşıyor, kaydırıcı ekranda. Ekran değişince
  kimse kabuğa haber vermezse durum sızıyor ve cihazda görülen arıza doğuyor — en üstteki ekranda
  yapışkan başlık inik, sekme çubuğu gizli kalıyor.

  Bir tur bu işi yapacak olan `reset` yazılmış ama HİÇBİR YERDEN çağrılmamıştı; sözleşmeye test
  konmasının sebebi de bu — çağrılmayan bir kapı, olmayan bir kapıdır ve künyedeki söz onu
  ayakta tutmuyor.
*/

/** Kaydırma olayının test karşılığı — yalnız kabuğun okuduğu üç alan. */
function kaydirma(top: number, contentHeight = 2000, viewHeight = 800) {
  return {
    nativeEvent: {
      contentOffset: { y: top },
      contentSize: { height: contentHeight },
      layoutMeasurement: { height: viewHeight },
    },
  } as never;
}

let kabuk: ReturnType<typeof useOperationsShellScroll>;

function Sonda() {
  kabuk = useOperationsShellScroll();
  return (
    <View>
      <Text testID="micro">{String(kabuk.microVisible)}</Text>
      <Text testID="tab">{String(kabuk.tabBarHidden)}</Text>
    </View>
  );
}

async function kur() {
  await render(
    <OperationsShellScrollProvider>
      <Sonda />
    </OperationsShellScrollProvider>,
  );
}

const hal = () => ({ micro: screen.getByTestId('micro').props.children, tab: screen.getByTestId('tab').props.children });

describe('kabuğun kaydırma durumu', () => {
  it('eşik geçilince başlık iner, tepeye dönünce kalkar (M1b)', async () => {
    await kur();
    expect(hal().micro).toBe('false');

    await act(async () => kabuk.onScroll(kaydirma(300)));
    expect(hal().micro).toBe('true');

    await act(async () => kabuk.onScroll(kaydirma(10)));
    expect(hal().micro).toBe('false');
  });

  it('EKRAN DEĞİŞİMİNDE durum yeni ekranın konumuna hizalanır — sızmaz', async () => {
    /*
      Cihazda arıza (kullanıcı bulgusu 08.09): kampanya kartına gir, aşağı kay, native geri ile dön
      → karar kutusu EN ÜSTTEYKEN yapışkan başlık inik kalıyor ve sekme çubuğu görünmüyordu. Durum
      kabukta yaşıyor, ekran değişince kimse ona dokunmuyordu.
    */
    await kur();
    await act(async () => kabuk.onScroll(kaydirma(600)));
    expect(hal().micro).toBe('true');

    await act(async () => kabuk.syncTo(0));

    expect(hal().micro).toBe('false');
    expect(hal().tab).toBe('false');
  });

  it('hizalama KÖRLEMESİNE sıfırlama DEĞİL — kaydırılmış ekrana dönüşte başlık kalır', async () => {
    /*
      Geri dönülen ekran yığında sökülmüyor, yani kaydırma konumunu KORUYOR. Sıfırlamak bu arızanın
      aynadaki eşini üretirdi: başlık gerektiği yerde kaybolurdu.
    */
    await kur();
    await act(async () => kabuk.syncTo(900));

    expect(hal().micro).toBe('true');
    /* Çubuk yine de GERİ GELİR: gizleme aşağı kaydırmanın göstergesidir (M1c) ve odak anında
       kaydırma yönü diye bir şey yoktur — üstelik çubuk gezinmenin kendisi. */
    expect(hal().tab).toBe('false');
  });

  it('hizalama YÖN BİRİKİMİNİ de sıfırlar — yeni ekranın ilk kaydırması eskisinin devamı sayılmaz', async () => {
    await kur();
    /* Önceki ekranda aşağı kayılmış ve çubuk gizlenmişti. */
    await act(async () => kabuk.onScroll(kaydirma(300)));
    await act(async () => kabuk.onScroll(kaydirma(400)));
    expect(hal().tab).toBe('true');

    await act(async () => kabuk.syncTo(0));
    /* Yeni ekranda eşiğin ALTINDA küçük bir kaydırma: birikim taşınsaydı çubuk gizli kalırdı. */
    await act(async () => kabuk.onScroll(kaydirma(20)));
    expect(hal().tab).toBe('false');
    expect(hal().micro).toBe('false');
  });
});
