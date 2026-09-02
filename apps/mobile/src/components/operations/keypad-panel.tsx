import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import { keypadDelete, keypadDisplay, keypadFill, keypadFrom, keypadPress, type KeypadValue } from './keypad-value';

/*
  TUŞ TAKIMININ GÖVDESİ — çekmecesiz (02.09).

  ── NİÇİN ÇEKMECEDEN AYRILDI ────────────────────────────────────────────────
  Gövde `OperationsAmountKeypad`ın içindeydi ve o bir `BottomSheet`. İkinci kullanıcısı
  (`OperationsQuantitySheet`in "rakamla gir" adımı) onu olduğu gibi çağırsaydı ÇEKMECE İÇİNDE
  ÇEKMECE açardı — `bottom-sheet` künyesindeki Fabric söküm arızasının (21.121) tam tetikleyicisi.
  Bu yüzden gövde kendi başına duruyor: kim isterse kendi kabına koyar.

  ── CİHAZ KLAVYESİ AÇILMAZ ──────────────────────────────────────────────────
  Tasarımın cümlesi: *"Cihaz klavyesi açılmaz — eldivenle de basılabilecek büyük tuşlar."* Bu bir
  üslup tercihi değil sahanın şartı; ikinci sebep de görüş alanı: sistem klavyesi ekranın yarısını
  kaplayıp yazılan değeri örtüyordu, burada değer tuşların ÜSTÜNDE durur.

  ── DEĞER SADECE ONAYLANINCA ÇIKAR ──────────────────────────────────────────
  Panel kendi taslağını tutar; çağıran ancak onaya basılınca haber alır. Her tuşta dışarı haber
  vermek, alanın altındaki hesapları yarım değerlerle titretirdi.
*/

/** Tuş dizilişi v3'ün ızgarası: üç sütun, on iki tuş — son satır virgül · 0 · çift sıfır. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '00'] as const;

interface OperationsKeypadPanelProps {
  /** Alanın açılış değeri (`"60,00"`); ilk rakam onu EZER. */
  value: string;
  /**
   * Motorun/kasanın beklediği değer — çipe yazılır ve dokunulunca alana geçer. `null` ise çip
   * ÇİZİLMEZ: beklenen bilinmiyorsa uydurma bir sayı sunmak, tek dokunuşla yanlış değer yazdırmaktı.
   */
  expected?: string | null;
  expectedLabel?: string;
  /** Değerin YANINDA yazan birim — para için `€`, sayım için `adet`. */
  unit: string;
  /**
   * Ondalık girilebilir mi. Para için EVET (`12,50`), ADET için HAYIR — yarım paket diye bir şey
   * yok ve virgül tuşunu açık bırakmak, kabul edilemeyecek bir değeri yazılabilir gösterirdi.
   */
  allowDecimals?: boolean;
  confirmLabel: string;
  hint: string;
  footnote?: string;
  deleteLabel: string;
  onConfirm: (text: string) => void;
  /**
   * Değiştiğinde taslak DIŞARIDAN sıfırlanır. Çekmecesinde kalıcı duran çağıran (para tuş takımı)
   * bunu `visible` ile besler: kapatılıp yeniden açılan bir tuş takımı, bir önceki denemenin yarım
   * kalan değerini göstermemeli. Her açılışta yeniden monte olan çağıran vermez.
   */
  resetKey?: string | number | boolean;
  testID?: string;
}

export function OperationsKeypadPanel({
  value,
  expected = null,
  expectedLabel,
  unit,
  allowDecimals = true,
  confirmLabel,
  hint,
  footnote,
  deleteLabel,
  onConfirm,
  resetKey,
  testID,
}: OperationsKeypadPanelProps) {
  const [draft, setDraft] = useState<KeypadValue>(() => keypadFrom(value));
  /** Izgaranın ölçülen genişliği — tuş genişliği bundan türer (künyesi ızgarada). */
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    setDraft(keypadFrom(value));
  }, [value, resetKey]);

  return (
    <>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.value} testID={testID === undefined ? undefined : `${testID}-value`}>
            {`${keypadDisplay(draft)} ${unit}`}
          </Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {expected === null || expectedLabel === undefined ? null : (
          <PressableSurface
            onPress={() => setDraft(keypadFill(expected))}
            feedback="scale"
            compact
            style={styles.expected}
            accessibilityLabel={expectedLabel}
            testID={testID === undefined ? undefined : `${testID}-expected`}
          >
            <Text style={styles.expectedLabel}>{expectedLabel}</Text>
          </PressableSurface>
        )}
      </View>

      {/* VİRGÜL TUŞU ONDALIKSIZ ALANDA HİÇ ÇİZİLMEZ, engelli çizilmez: engelli bir tuş "burada bir
          şey var ama olmuyor" der; olmayan bir tuş "burada öyle bir şey yok" der. Yarım paket diye
          bir şey olmadığı için doğrusu ikincisi. */}
      {/*
        KAP ÖLÇÜLÜR, YÜZDE KULLANILMAZ (cihazda ölçüldü 02.09).

        Izgara `flexBasis: '30%'` ile yazılmıştı ve para çekmecesinde çalışıyordu; ADET
        çekmecesinin içine adım olarak konunca on bir tuşun HEPSİ tek satıra ince şeritler hâlinde
        dizildi. Aynı arıza bu dosyanın komşusunda zaten ölçülmüştü — `quantity-sheet`in koli boyu
        ızgarası da yüzdeyle çözülmüyor ve orada da kap `onLayout` ile ölçülüyor. Yüzde, kabın
        genişliği KESİN olduğunda çözülür; çekmecenin kaydırma kabında her zaman öyle değil.

        Ölçüm varsayımsız tek yol: genişliği al, iki boşluğu düş, üçe böl.
      */}
      <View style={styles.grid} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
        {KEYS.filter((key) => allowDecimals || key !== ',').map((key) => (
          <PressableSurface
            key={key}
            onPress={() => setDraft((current) => keypadPress(current, key))}
            feedback="scale"
            style={[styles.key, gridWidth === 0 ? null : { width: (gridWidth - 2 * operationsTheme.space.md) / 3 }]}
            accessibilityLabel={key}
            testID={testID === undefined ? undefined : `${testID}-key-${key}`}
          >
            <Text style={styles.keyLabel}>{key}</Text>
          </PressableSurface>
        ))}
      </View>

      <View style={styles.actions}>
        <PressableSurface
          onPress={() => setDraft(keypadDelete)}
          feedback="scale"
          style={styles.delete}
          accessibilityLabel={deleteLabel}
          testID={testID === undefined ? undefined : `${testID}-delete`}
        >
          <Icon name="backspace" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
        </PressableSurface>
        <PressableSurface
          onPress={() => onConfirm(draft.text)}
          feedback="shadow"
          grow
          style={styles.confirm}
          accessibilityLabel={confirmLabel}
          testID={testID === undefined ? undefined : `${testID}-confirm`}
        >
          <Text style={styles.confirmLabel}>{confirmLabel}</Text>
        </PressableSurface>
      </View>

      {footnote === undefined ? null : <Text style={styles.footnote}>{footnote}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: operationsTheme.space.xl,
  },
  headText: { gap: operationsTheme.space['2xs'] },
  value: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['page-title'],
    color: operationsTheme.colors.ink,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  expected: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  expectedLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xl,
  },
  /* Üç sütun: genişlik yüzdeyle değil, ARALIKTAN düşülerek hesaplanır — yüzde + boşluk üçüncü
     tuşu alt satıra atıyordu (`flexWrap` ile ölçüldü). */
  /*
    ÜÇ SÜTUNLUK IZGARA — `flexShrink` SIFIR olmak ZORUNDA (arıza, cihazda görüldü 30.08).

    Eski hâl `width: 33.33% + flexBasis: 33.33% + flexShrink: 1`di ve tuşlar SARMIYOR, tek satıra
    sıkışıyordu: on iki tuş ekran boyunca ince şeritler hâlinde diziliyordu. Sebep Yoga'nın
    kuralı — sarmalı bir kapsayıcıda **küçülebilen öğe önce küçülür, sonra sarar**; `flexShrink: 1`
    verildiği sürece satır hiçbir zaman taşmaz, dolayısıyla sarma hiç tetiklenmez.

    `%33`ten `%30`a da inildi çünkü aradaki boşluk (gap) yüzdeye dahil değil: üç tuş %100'ü tam
    doldurunca iki boşluk taşırıyordu. %30 üçlüyü sığdırır, `flexGrow` kalan payı bölüştürür —
    yani ızgara ekran genişliğinden bağımsız olarak üç sütun kalır.

    Arıza para ekranlarını da etkiliyordu (aynı komponent); orada kimse bakmamıştı.
  */
  /* Genişlik ÖLÇÜLEN kaptan gelir (yukarıdaki künye); burada yalnız kalan nitelikler durur.
     `flexShrink: 0` yerinde kalıyor: ölçüm gelene kadarki ilk karede tuşlar içeriğe daralmasın. */
  key: {
    flexShrink: 0,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  keyLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  actions: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xl,
  },
  delete: {
    width: operationsTheme.size.circleSm,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  confirm: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.ink,
    // Gölge YOK: v3'te sert gölge sıfır kez geçiyor (ölçüldü — v2'de 3, v3'te 0).
  },
  confirmLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  footnote: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
});
