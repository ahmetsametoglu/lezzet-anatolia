import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  FORM KAYDIRICISI — tam ekran formların kabı. İki korumayı BİRLİKTE taşır, çünkü ikisi de klavye
  açıkken ortaya çıkar ve biri olmadan öteki yarım kalır:

  1. **Odaklanan alan klavyenin altında kalmaz** (`KeyboardAvoidingView`).
  2. **Klavye açıkken düğmeye ilk dokunuş yutulmaz** (`keyboardShouldPersistTaps="handled"`).

  ── NEDEN KİTTE (bottom-sheet'in 08.08'de verdiği kararın aynısı) ───────────
  Çekmecelerde tam bu iki arıza yaşanmış ve çare oraya değil KİTE konmuştu: *"kaçınma burada,
  KİTTE durur — girdili her çekmece aynı korumayı otomatik alır, ekranlar tek tek uğraşmaz"*
  (`bottom-sheet.tsx` künyesi). Tam ekran formlar o korumadan yararlanamıyordu çünkü çekmece
  değiller; aynı ilkeyi burada tekrarlıyoruz. Prop'u ekran ekran dağıtmak, bir gün birinde
  unutulacak bir kural olurdu (nitekim `(21.33)`te on ekrana tek tek yazıldı).

  ── SEBEP ÖLÇÜLDÜ, VARSAYILMADI (cihazda, 11.08 — MB-02) ────────────────────
  `AndroidManifest`te `android:windowSoftInputMode="adjustResize"` YAZILI ama İŞLEMİYOR. Üç ölçüm:
  · klavye açılınca içerik hiç kaymadı (SIRET satırı klavyeli/klavyesiz aynı Y'de),
  · klavye açıkken kaydırma denendi — pikseller birebir aynı kaldı, yani kaydırıcı içeriği
    "sığmış" sayıyor, kaydıracak yeri yok,
  · `res/values/styles.xml` → `AppTheme` **`Theme.EdgeToEdge`**'den türüyor (`react-native-edge-to-edge`).
  Kenardan kenara modda Android pencereyi klavye için küçültmez; klavye boşluğunu uygulamanın
  KENDİSİ tüketmek zorundadır. Yani `adjustResize`e güvenen her tam ekran form, alanı klavyenin
  altında bırakır.

  ── YENİ BAĞIMLILIK EKLENMEDİ ───────────────────────────────────────────────
  Kenardan kenara için yaygın çare `react-native-keyboard-controller`dır; eklenmedi çünkü depoda
  ÇALIŞAN bir emsal zaten var (`bottom-sheet`, RN'in kendi `KeyboardAvoidingView`ı ile). Önce
  mevcut olanı kullan (`WORKFLOW §6`); emsal yetmezse o zaman paket tartışılır — o gün gelirse
  değişecek tek yer burasıdır.

  ── KAPSAM: FORM EKRANLARI, HER KAYDIRICI DEĞİL ─────────────────────────────
  Bu kap, üzerinde metin alanı olan tam ekran formlara konur. Kaydırıcısı olan ama klavyesi
  açılmayan ekranlar (vitrin, ürün, sipariş detayı…) sarılMAZ: klavye kaçınması olmayan bir yerde
  bedava değildir, ölçüm ve yerleşim hesabı ekler. 30 kaydırıcılık geniş göç ayrı bir iştir
  (`BACKLOG-musteri.md` MB-34).
*/

interface FormScrollProps {
  children: ReactNode;
  /** Kaydırılan içeriğin kendi yerleşimi — ekranın `styles.content`u olduğu gibi geçer. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Kaydırıcının kimliği — testler ve ekran görüntüsü araçları bunu arıyor, ekrandan gelir. */
  testID?: string;
}

export function FormScroll({ children, contentContainerStyle, testID }: FormScrollProps) {
  return (
    /* `behavior="padding"`: çekmecede ölçülmüş olan davranış. Android'de `height` de bir seçenek
       ama panelin yüksekliğini zorlar; `padding` yalnız altına boşluk ekler ve kaydırıcı o boşluğu
       kullanarak odaklanan alanı yukarı taşır. */
    <KeyboardAvoidingView behavior="padding" style={styles.layer}>
      <ScrollView contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled" testID={testID}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* Kabuğun kalan yüksekliğini doldurur — üstündeki başlık çubuğu kendi yerini alır, kaydırıcı
     gerisini. Sabit yükseklik VERİLMEZ: klavye kaçınması bu ölçüyü çalışma anında değiştiriyor. */
  layer: { flex: 1 },
});
