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
  backdropComponent?: (props: { animatedIndex: { value: number }; style: undefined }) => ReactNode;
  backgroundStyle?: StyleProp<ViewStyle>;
}

export class BottomSheetModal extends Component<ModalProps, { open: boolean }> {
  override state = { open: false };

  present(): void {
    this.setState({ open: true });
  }

  dismiss(): void {
    if (!this.state.open) return;
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

  override render(): ReactNode {
    if (!this.state.open) return null;
    const { children, handleComponent, backdropComponent, backgroundStyle } = this.props;
    return createElement(
      View,
      { style: backgroundStyle },
      backdropComponent?.({ animatedIndex: { value: 0 }, style: undefined }),
      handleComponent?.(),
      children,
    );
  }
}

/* Yüzey DAR ve bilinçli: yalnız gerçekten ithal edilen üçü. Kullanılmayan bir sahte, bir gün
   kütüphane o adı değiştirdiğinde sessizce yanlış kalır — `knip` de göremez. */
export const BottomSheetModalProvider = ({ children }: { children?: ReactNode }): ReactNode => children;
export const BottomSheetScrollView = ScrollView;
