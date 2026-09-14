import { Component, createElement, type ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

/*
  `@gorhom/bottom-sheet` TEST İKİZİ — paketin KENDİ mock'u bilerek kullanılmıyor.

  Resmî mock (`@gorhom/bottom-sheet/mock`) çocukları HER ZAMAN çiziyor: `present`/`dismiss` yalnız
  bir alana yazıyor, yeniden çizim tetiklemiyor ve `onDismiss` hiç çağrılmıyor. Bizim hattımızda
  bu bir güvenceyi yok ederdi — testlerin epeyi "çekmece KAPALIYKEN içeriği görünmemeli" ya da
  "kapanınca şu kanca çalışmalı" diye ölçüyor; hepsi sessizce yeşile dönerdi (`kapalıyken içeriğini
  HİÇ çizmez` testi doğrudan bunun bekçisi).

  Bu ikiz gerçek davranışın ÖLÇÜLEN yüzeyini taşıyor, fazlasını değil:
    · `present()` çocukları çizer, `dismiss()` söker ve `onDismiss`i çağırır
    · `handleComponent` ve `backdropComponent` çizilir — tutamak, başlık ve örtü testlerde vardır
    · `animatedIndex` düz bir nesne: reanimated'ın kendi mock'u `useAnimatedStyle` içinde okuyor

  ANİMASYON YOK ve olmamalı: testin ölçtüğü şey sözleşme (ne zaman çizilir, hangi kanca çalışır),
  kaç milisaniyede kaydığı değil. Süreyi ölçmek isteyen cihazda ölçer.
*/

interface ModalProps {
  children?: ReactNode;
  onDismiss?: () => void;
  handleComponent?: () => ReactNode;
  backgroundStyle?: StyleProp<ViewStyle>;
}

export class BottomSheetModal extends Component<ModalProps, { open: boolean }> {
  override state = { open: false };

  /*
    SÖKÜLMÜŞ ÇEKMECE ÖLÜDÜR — gerçeğin en pahalı davranışı ve ikizin taklit etmesi ŞART.

    Kütüphane, panel zaten kapalıyken gelen `dismiss()`te kendini portaldan çıkarıyor
    (`unmount()` → `unmountSheet` + `unmountPortal`); ondan sonra gelen `present()` çekmeceyi geri
    getirmiyor. 01.09'da cihazdaki iki arıza da bundandı: `visible={false}` ile monte olan çekmece
    daha doğmadan ölüyordu, ve elle kapatılan çekmece ikinci `dismiss()` yüzünden bir daha
    açılmıyordu. İkiz bunu modellemezse testler ikisini de yeşil geçer — nitekim geçmişti.
  */
  private dead = false;

  present(): void {
    if (this.dead) return;
    this.setState({ open: true });
  }

  dismiss(): void {
    if (!this.state.open) {
      this.dead = true;
      this.props.onDismiss?.();
      return;
    }
    this.setState({ open: false }, () => this.props.onDismiss?.());
  }

  close(): void {
    this.dismiss();
  }

  forceClose(): void {
    this.dismiss();
  }

  snapToIndex(): void {}
  snapToPosition(): void {}
  expand(): void {}
  collapse(): void {}

  /*
    KULLANICININ KAPATMASI İÇİN DİKİŞ — gerçekte bu, tutamaktan aşağı sürüklemedir
    (`enablePanDownToClose`): çekmece KENDİ kapanır ve `onDismiss` çağırır; çağıranın `visible`ı
    henüz düşmemiştir. Bileşenin en kırılgan yolu bu ve testin ona ulaşabilmesi gerekiyor.
  */
  private selfDismiss = (): void => {
    if (!this.state.open) return;
    this.setState({ open: false }, () => this.props.onDismiss?.());
  };

  override render(): ReactNode {
    if (!this.state.open) return null;
    const { children, handleComponent, backgroundStyle } = this.props;
    return createElement(
      View,
      { style: backgroundStyle },
      createElement(View, { key: 'self-dismiss', testID: 'gorhom-self-dismiss', onTouchEnd: this.selfDismiss }),
      handleComponent?.(),
      children,
    );
  }
}

export const BottomSheetModalProvider = ({ children }: { children?: ReactNode }): ReactNode => children;
export const BottomSheetScrollView = ScrollView;
/* Örtü artık KÜTÜPHANENİN (bileşen künyesi) — testte çizilmesi gerekmiyor, yalnız var olması. */
export const BottomSheetBackdrop = (): ReactNode => null;
