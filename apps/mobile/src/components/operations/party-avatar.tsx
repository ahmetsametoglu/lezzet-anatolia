import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { monogramOf } from './monogram';

/*
  KARŞI TARAF AVATARI — yazışmanın öteki ucundaki kişinin baş harfleri (v3:30 · 31 · 32).

  ── NİÇİN AYRI, VE NİÇİN KİTTE ──────────────────────────────────────────────
  Tasarım aynı daireyi DÖRT yerde çiziyor: talep listesi satırı, talep ekranının başlığı, sosyal
  gelen kutusu satırı, konuşma başlığı. Bugün iki ayrı elle çizim var (sosyal gelen kutusunun
  `styles.avatar` karesi) ve üçüncüsünü yazmak yerine kutu buraya alındı.

  ── MÜŞTERİ KİTİNİN `AvatarThumb`'ı KULLANILMADI ────────────────────────────
  O komponent rengini `useUnistyles()` ile ÇALIŞMA ZAMANI temasından okuyor; operasyon stilleri ise
  statik (`operationsTheme` dosyanın tepesinden ithal edilir — `design/BACKLOG.md §5`'in yazı boyutu
  maddesi bu ayrımı ölçmüş). İkisini karıştıran bir avatar, operasyon ekranında MÜŞTERİ paletiyle
  çizilirdi. Baş harf kuralı yine de tek yerden geliyor (`monogramOf`) — çoğaltılan şey yalnız kutu.

  ── TON RENGİ ÇAĞIRANIN, ÇÜNKÜ ANLAMI ÇAĞIRANDA ─────────────────────────────
  Sosyal gelen kutusunda daire KANALI kodluyor (WhatsApp yeşil, Messenger mavi); talep ekranında
  öyle bir eksen yok, orada nötr sıcak ton duruyor. Renk komponentin kararı olsaydı ikisinden biri
  yanlış olurdu; `tint` verilmezse tasarımın talep başlığındaki sıcak tonu gelir.
*/

interface OperationsPartyAvatarProps {
  /** Kişinin/işletmenin adı — baş harfler buradan türer, çağıran ayrıca hesaplamaz. */
  name: string;
  /** Dolgu rengi; verilmezse tasarımın nötr sıcak tonu (talep başlığı). */
  tint?: string;
  /** Yazının rengi; `tint` verilirken birlikte verilir. */
  ink?: string;
  size?: 'sm' | 'md';
  testID?: string;
}

export function OperationsPartyAvatar({ name, tint, ink, size = 'md', testID }: OperationsPartyAvatarProps) {
  const initials = monogramOf(name);

  return (
    <View
      style={[styles.box, styles[size], tint === undefined ? styles.defaultTint : { backgroundColor: tint }]}
      /* Baş harfler adın KISALTMASI — ekran okuyucu zaten adın kendisini komşu satırda okuyor;
         "M A" diye harf harf okutmak aynı bilgiyi bozarak tekrar etmek olurdu. */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text style={[styles.text, styles[`${size}Text`], ink === undefined ? styles.defaultInk : { color: ink }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Ölçü kitin ikon düğmesiyle aynı duraklarda: başlıkta zil/geri düğmesiyle yan yana duruyor ve
     üçü aynı yükseklikte olmazsa satır kayıyor. */
  sm: {
    width: operationsTheme.size.iconButton - operationsTheme.space.lg,
    height: operationsTheme.size.iconButton - operationsTheme.space.lg,
    borderRadius: operationsTheme.size.iconButton,
  },
  md: {
    width: operationsTheme.size.iconButton,
    height: operationsTheme.size.iconButton,
    borderRadius: operationsTheme.size.iconButton,
  },
  defaultTint: { backgroundColor: operationsTheme.colors['terracotta-bg'] },
  defaultInk: { color: operationsTheme.colors.terracotta },
  text: {
    fontFamily: operationsTheme.font.body[700],
  },
  smText: { fontSize: operationsTheme.text.tag },
  mdText: { fontSize: operationsTheme.text['body-sm'] },
});
