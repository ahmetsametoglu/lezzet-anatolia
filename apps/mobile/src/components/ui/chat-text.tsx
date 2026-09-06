import { Fragment } from 'react';
import { Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { appFont } from '@/theme/fonts';
import { type ChatSpan, parseChatFormatting } from '@lezzet/domain-core';

/*
  SOHBET METNİ — mesajlaşma söz dizimini ÇİZEN metin (kullanıcı kararı 06.09).

  ── NİÇİN VAR ───────────────────────────────────────────────────────────────
  Yapay zekâ cevaplarını her zaman biçimlendirilmiş yazıyor (`*kalın*` · `_italik_` ·
  `~üstü çizili~` · `•` maddeleri) ve söz dizimi WhatsApp'ın grameri — bizim tasarım kararımız
  değil. Bugüne dek çizemeyen her yüzeyde işaretler SÖKÜLÜYORDU (`stripChatFormatting`);
  kullanıcı bu turda çizilmesini istedi. Ayrıştırıcı `@lezzet/domain-core`de ve saf; bu dosya
  yalnız onun ürettiği ağacı React Native'e basıyor.

  ── KİTTE, ÇÜNKÜ DÖRT YÜZEY OKUYOR ──────────────────────────────────────────
  Operasyonun talep ve sosyal yazışmaları ile MÜŞTERİNİN kendi talep defteri aynı gövdeyi
  gösteriyor. Operasyona koysaydım müşteri yüzeyi ikinci bir kopya yazardı ve ikisi bir gün
  ayrışırdı (CLAUDE §1) — üstelik ayrışma yalnız tek yüzeyde görünürdü.

  ── TEMAYA DOKUNMUYOR: BİÇİM ÇAĞIRANIN, VURGU BURANIN ───────────────────────
  Punto, renk ve satır yüksekliği `style` ile ÇAĞIRANDAN gelir — operasyon statik
  `operationsTheme` okuyor, müşteri çalışma zamanı temasını; ikisini burada birleştirmek
  yüzeylerden birini yanlış paletle çizerdi. Bu dosyanın eklediği tek şey VURGU: hangi ailenin
  hangi kesitine geçileceği ve üstü çizili kararı.

  ── AĞIRLIK AİLE ADININ İÇİNDE (RN gerçeği, `theme/fonts` künyesi) ──────────
  `fontWeight` ve `fontStyle` YAZILMIYOR: özel bir ailede ikisi de ya yok sayılıyor ya sahte
  bir kesit üretiyor. Kalın ve italik AİLE DEĞİŞTİREREK çiziliyor; italik kesitler bu iş için
  06.09'da yüklendi.

  ── ÇAĞIRAN HAM METİN VERİR ────────────────────────────────────────────────
  Ayrıştırma burada yapılıyor, çağıranda değil: sözleşme gövdeyi ham taşıyor ve her ekranın
  ayrı ayrı `parseChatFormatting` çağırması, aynı kararı dört yerde tekrarlamaktı.
*/

interface ChatTextProps {
  /** Ham gövde — işaretleriyle birlikte; ayrıştırma burada yapılır. */
  children: string;
  /** Punto · renk · satır yüksekliği — çağıranın kendi metin stili. */
  style?: StyleProp<TextStyle>;
  /**
   * Kalın parçalar için aile ağırlığı. Varsayılan 700; koyu baloncukta 600 istenebilir
   * (küçük puntoda 700 zeminden taşıyor).
   */
  boldWeight?: 700 | 600;
  testID?: string;
}

/** İşaretsiz metin de tek paragraf döner — çağıran hiçbir hâli özel olarak ele almaz. */
export function ChatText({ children, style, boldWeight = 700, testID }: ChatTextProps) {
  const blocks = parseChatFormatting(children);

  /* Boş gövde ayrıştırıcıda `[]` — metin bileşeni yine çizilir ki çağıranın yerleşimi
     (satır yüksekliği, hizalama) tek metinli hâlle aynı kalsın. */
  if (blocks.length === 0) {
    return (
      <Text style={style} testID={testID}>
        {children}
      </Text>
    );
  }

  /* TEK PARAGRAFLIK METİN KAPSAYICI ALMAZ: mesajların çoğu böyle ve fazladan bir `View`,
     baloncuğun genişlik hesabına giriyor (RN'de `View` satır kırmasını `Text` gibi yapmaz). */
  if (blocks.length === 1 && blocks[0]?.kind === 'paragraph') {
    return (
      <Text style={style} testID={testID}>
        {spansOf(blocks[0].spans, style, boldWeight)}
      </Text>
    );
  }

  return (
    <View style={styles.stack} testID={testID}>
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <Text key={index} style={style}>
            {spansOf(block.spans, style, boldWeight)}
          </Text>
        ) : (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              /* Madde işareti METNİN İÇİNDE değil, kendi sütununda: saran bir maddenin ikinci
                 satırı işaretin altına değil, metnin hizasına gelmeli. */
              <View key={itemIndex} style={styles.item}>
                <Text style={style}>•</Text>
                <Text style={[style, styles.itemBody]}>{spansOf(item, style, boldWeight)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/** Parçaları iç içe `Text` olarak dizer — RN'de iç içe metin stili miras alır ve satır kırar. */
function spansOf(spans: readonly ChatSpan[], style: StyleProp<TextStyle>, boldWeight: 700 | 600) {
  return spans.map((span, index) => (
    <Fragment key={index}>
      {span.bold === true || span.italic === true || span.strike === true ? (
        <Text style={emphasisOf(span, boldWeight)}>{span.text}</Text>
      ) : (
        span.text
      )}
    </Fragment>
  ));
}

/**
 * Bir parçanın vurgusu — aile + üstü çizili.
 *
 * İşaretler BİRLEŞEBİLİR (`*_ikisi_*` ayrıştırıcıda tek parçadır) ve dördü de aynı anda gelebilir;
 * bu yüzden aile dört ihtimalden seçiliyor, iç içe `Text` kurulmuyor.
 */
function emphasisOf(span: ChatSpan, boldWeight: 700 | 600): TextStyle {
  const bold = span.bold === true;
  const italic = span.italic === true;

  /* Aile ANAHTARI hiç yazılmıyorsa çağıranın ailesi mirasla gelir; `undefined` yazmak RN'de
     bazı sürümlerde mirası kesiyor — yalnız üstü çizili bir parça ailesini kaybetmemeli. */
  const family = italic
    ? bold
      ? appFont.bodyItalic[700]
      : appFont.bodyItalic[400]
    : bold
      ? appFont.body[boldWeight]
      : null;

  return {
    ...(family === null ? {} : { fontFamily: family }),
    ...(span.strike === true ? { textDecorationLine: 'line-through' as const } : {}),
  };
}

const styles = StyleSheet.create((theme) => ({
  stack: { gap: theme.space.md },
  list: { gap: theme.space.xs },
  item: { flexDirection: 'row', gap: theme.space.md },
  /* Metin sütunu ARTAN alanı alır; işaret sütunu içeriği kadar kalır. */
  itemBody: { flex: 1 },
}));
