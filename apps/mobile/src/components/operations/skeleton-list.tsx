import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  LİSTE YÜKLENİYOR — Operasyon Mobil v3'ün ilk-yük kalıbı (ölçüldü 30.08; toplama kuyruğu ·
  mal kabul · transfer üçünde birden aynı iskelet):
      kutu   `#f0ede3` zemin + `1.5px solid #e7e2d2` + kart yarıçapı, satır yüksekliğinde
      sıra    opaklık merdiveni (1 → .7 → .4): liste aşağı doğru "henüz gelmedi"ye solar
      künye  `700 11.5px 'Karla'` · `#a8a191` · ortalı — "Kuyruk yükleniyor…"

  NEDEN HALKA DEĞİL: v2 boyunca operasyon ekranları ilk yükü `ActivityIndicator` ile geçiyordu ve
  o gösterge YERLEŞİM TUTMAZ — halka söndüğü an sayfa zıplar. v3'ün kutuları gelecek satırların
  ölçüsünü tutar; kullanıcı listeyi görmeden önce listenin BİÇİMİNİ görür.

  NEDEN MÜŞTERİ KİTİNDEKİ `Skeleton` DEĞİL: o komponent NABIZ atar (opaklık .45 ⟷ .9, 1,1 sn) ve
  tek bir blok çizer; buradaki desen nabız değil MERDİVEN — üç kutu sabit ve birbirinden farklı
  opaklıkta durur, çünkü söylediği şey "yükleniyor" değil "liste buradan aşağı uzayacak".
  İkisini tek komponente sıkıştırmak, iki ayrı tasarım kararını tek prop'un arkasına saklardı.

  ÖLÇÜ ÇAĞIRANDAN: kaç kutu ve her birinin yüksekliği, yerini tuttuğu satırın bilgisidir — kuyruk
  satırı 74, sevkiyat kartı 80, transfer paneli 140 ölçüldü. Kit onu bilemez, ekran bilir.
*/

/**
 * Opaklık merdiveninin basamağı. Şablon üç kutuda 1/.7/.4, iki kutuda 1/.6 çiziyor; tek bir oran
 * ikisini birden vermiyor. PARAMETRİK varsayılan (CLAUDE §4) olarak .3 seçildi — üç kutuluk hâli
 * BİREBİR verir, iki kutuluk hâlde .1 sapar ve o fark ekranda ölçülemez. Sabiti kutu sayısına
 * göre değiştirmek, ölçülemeyen bir farkı iki kurala bölmek olurdu.
 */
const OPACITY_STEP = 0.3;

interface OperationsSkeletonListProps {
  /** Yer tutucu YÜKSEKLİKLERİ (dp) — sırayla çizilir; uzunluk kutu sayısıdır. */
  heights: number[];
  /** Altındaki künye ("Kuyruk yükleniyor…"); operasyon yüzeyi tek dilli, metin üstte çözülür. */
  label: string;
  testID?: string;
}

export function OperationsSkeletonList({ heights, label, testID }: OperationsSkeletonListProps) {
  return (
    <View style={styles.list} testID={testID}>
      {heights.map((height, index) => (
        <View
          // Liste STATİK ve sırası hiç değişmiyor (yeniden sıralanan bir veri değil, yer tutucu);
          // dizin burada kararlı bir anahtardır.
          key={`placeholder-${index}`}
          style={[styles.box, { height, opacity: Math.max(0, 1 - index * OPACITY_STEP) }]}
          /* İskelet içerik değil, yer tutucu: ekran okuyucuya "yükleniyor" bilgisini altındaki
             künye satırı veriyor; kutuların da okunması aynı şeyi dört kez söylerdi. */
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ))}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

/* GERİ ÇAĞRISIZ (statik): hiçbir değer ETKİN temadan gelmiyor, hepsi `operationsTheme` sabitinden
   — gerekçe `theme/unistyles.ts` künyesinde. */
const styles = StyleSheet.create({
  list: {
    // Şablon 9–10 px arasında geziniyor; `lg` (10) baskın değer.
    gap: operationsTheme.space.lg,
  },
  box: {
    /* Ölçülen dolgu `#f0ede3`, `sand-50`e (#f3efe2) Δ3/2/1 — eşiğin altında, kendi durağı yok.
       Kenarlık `neutral-bg` ile BİREBİR aynı (#e7e2d2). */
    backgroundColor: operationsTheme.colors['sand-50'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.card,
  },
  label: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    // Dipnot grisi — `muted` değil: bu satır listenin içeriği değil, listenin durumu.
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
    marginTop: operationsTheme.space.xs,
  },
});
