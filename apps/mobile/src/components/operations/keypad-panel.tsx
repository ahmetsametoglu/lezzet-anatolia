import { useEffect, useRef, useState } from 'react';
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

  ── İKİ KİP: CANLI (adet) · ONAYLI (para) — kullanıcı kararı 02.09 ─────────
  Kullanıcının sorusu: *"Alttaki iki düğmeye neden gerek var? Değiştirdiğim an yazılmaz mı?"*
  Adet için haklı: her tuş çağırana ANINDA gider (`onChange`), çekmece kapandığında değer zaten
  yazılmıştır; onay satırı hiç çizilmez. Arkadaki sayacın canlı değişmesi ayrıca bir doğrulama —
  yazdığını ekranda görürsün. Para ise ONAYLI kalır (`onConfirm`): tutar tuş tuş dışarı sızarsa
  fark sütunu ve CTA "1 → 12 → 12,50" diye titrer. Kip, hangi geri çağırmanın verildiğinden
  çıkar; ikisi birden verilmez.

  ── SİL TUŞU DEĞERİN SAĞINDA ────────────────────────────────────────────────
  Kullanıcı kararı 02.09: *"silme tuşunu adet yazısının sağına koyalım, daha doğal bir yer."*
  Silinen şey değerin son rakamıdır; tuşun yeri de o değerin yanı. Alt satırda "Yaz"ın yanında
  durması, onun bir onay adımıymış gibi okunmasına yol açıyordu. Kendi tuş takımımızda başka geri
  alma yolu yok — sistem klavyesinin backspace'i bu.

  ── TAVAN TUŞTA DURUR ───────────────────────────────────────────────────────
  `max` verilirse tavanı aşacak tuş HİÇ İŞLEMEZ: "partide 4 var" iken "6" basılınca değer 6 olup
  sonra 4'e kırpılmaz, 6 hiç yazılmaz. Kırpma iki değer gösterirdi (tuş takımında 6, sayaçta 4);
  reddetmek tek gerçeği gösterir. Yalnız tam sayı kipinde anlamlı (adet); para tavan bilmez.
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
  /** Tam sayı tavanı — aşacak tuş işlemez (künye). Ondalıklı kipte yok sayılır. */
  max?: number;
  hint: string;
  footnote?: string;
  deleteLabel: string;
  /** CANLI kip: her tuşta çağrılır, onay satırı çizilmez. `onConfirm` ile birlikte verilmez. */
  onChange?: (text: string) => void;
  /** ONAYLI kip: değer ancak düğmeye basılınca çıkar. `confirmLabel` ile birlikte gelir. */
  onConfirm?: (text: string) => void;
  confirmLabel?: string;
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
  max,
  hint,
  footnote,
  deleteLabel,
  onChange,
  onConfirm,
  confirmLabel,
  resetKey,
  testID,
}: OperationsKeypadPanelProps) {
  const [draft, setDraft] = useState<KeypadValue>(() => keypadFrom(value));
  /** Izgaranın ölçülen genişliği — tuş genişliği bundan türer (künyesi ızgarada). */
  const [gridWidth, setGridWidth] = useState(0);
  /** Bir tuşun genişliği: ölçülen kap eksi iki boşluk, üçe bölünmüş. Sil tuşu da bu boyda. */
  const keyWidth = gridWidth === 0 ? null : (gridWidth - 2 * operationsTheme.space.md) / 3;

  /*
    DIŞARIDAN GELEN DEĞER TASLAĞI YALNIZ FARKLIYSA EZER (ölçüldü 02.09, birim testte).

    Canlı kipte her tuş çağırana gider, çağıran değeri geri verir ve o değer zaten taslağın
    kendisidir. Eski efekt her `value` değişiminde taslağı "taze" (ilk rakam ezer) diye
    sıfırlıyordu: "4" yazılıyor → çağıran "4" veriyor → taslak tazeleniyor → "0" basılınca "40"
    değil "0" oluyordu. Eşitse dokunulmaz; yalnız gerçekten dışarıdan değişen değer (sıfırla,
    başka satır) taslağı yeniler. `resetKey` ise her açılışta KOŞULSUZ tazeler: kapatılıp
    yeniden açılan tuş takımında ilk rakam yine eskisini ezmeli.
  */
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    setDraft(keypadFrom(valueRef.current));
  }, [resetKey]);
  useEffect(() => {
    setDraft((current) => (current.text === value ? current : keypadFrom(value)));
  }, [value]);

  /** Taslağı değiştirir ve canlı kipte çağırana haber verir — tek kapı, iki kip. */
  const apply = (next: (current: KeypadValue) => KeypadValue) => {
    setDraft((current) => {
      const updated = next(current);
      /* Tavanı aşan tuş HİÇ işlemez (künye): taslak değişmez, dışarı haber gitmez. */
      if (max !== undefined && !allowDecimals && Number(updated.text || '0') > max) return current;
      if (updated !== current) onChange?.(updated.text);
      return updated;
    });
  };

  return (
    <>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.value} testID={testID === undefined ? undefined : `${testID}-value`}>
            {`${keypadDisplay(draft)} ${unit}`}
          </Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {/* SİL değerin sağında (künye) — sildiği şeyin yanında durur; ızgaradaki tuşlarla AYNI
            genişlikte (kullanıcı 02.09: "diğer butonların genişliği kadar olsun"). */}
        <PressableSurface
          onPress={() => apply(keypadDelete)}
          feedback="scale"
          compact
          style={[styles.delete, keyWidth === null ? null : { width: keyWidth }]}
          accessibilityLabel={deleteLabel}
          testID={testID === undefined ? undefined : `${testID}-delete`}
        >
          <Icon name="backspace" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
        </PressableSurface>
        {expected === null || expectedLabel === undefined ? null : (
          <PressableSurface
            onPress={() => apply(() => keypadFill(expected))}
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
            onPress={() => apply((current) => keypadPress(current, key))}
            feedback="scale"
            style={[styles.key, keyWidth === null ? null : { width: keyWidth }]}
            accessibilityLabel={key}
            testID={testID === undefined ? undefined : `${testID}-key-${key}`}
          >
            <Text style={styles.keyLabel}>{key}</Text>
          </PressableSurface>
        ))}
      </View>

      {/* ONAY SATIRI yalnız onaylı kipte (künye): canlı kipte değer zaten yazılmıştır. */}
      {onConfirm === undefined || confirmLabel === undefined ? null : (
        <PressableSurface
          onPress={() => onConfirm(draft.text)}
          feedback="shadow"
          style={styles.confirm}
          accessibilityLabel={confirmLabel}
          testID={testID === undefined ? undefined : `${testID}-confirm`}
        >
          <Text style={styles.confirmLabel}>{confirmLabel}</Text>
        </PressableSurface>
      )}

      {footnote === undefined ? null : <Text style={styles.footnote}>{footnote}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  /** Değer + ipucu satırın solunu alır; sil tuşu ve "beklenen" çipi sağa yaslanır. */
  headText: { flex: 1, gap: operationsTheme.space['2xs'] },
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
  /*
    ÜÇ SÜTUNLUK IZGARA — `flexShrink` SIFIR olmak ZORUNDA (arıza, cihazda görüldü 30.08).

    Eski hâl `width: 33.33% + flexBasis: 33.33% + flexShrink: 1`di ve tuşlar SARMIYOR, tek satıra
    sıkışıyordu: on iki tuş ekran boyunca ince şeritler hâlinde diziliyordu. Sebep Yoga'nın
    kuralı — sarmalı bir kapsayıcıda **küçülebilen öğe önce küçülür, sonra sarar**; `flexShrink: 1`
    verildiği sürece satır hiçbir zaman taşmaz, dolayısıyla sarma hiç tetiklenmez.

    Genişlik ÖLÇÜLEN kaptan gelir (yukarıdaki künye); burada yalnız kalan nitelikler durur.
    `flexShrink: 0` yerinde kalıyor: ölçüm gelene kadarki ilk karede tuşlar içeriğe daralmasın.
  */
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
  /** Sil tuşu: değerle aynı satırda, tuş boyunda; ölçüm gelene kadar kare. */
  delete: {
    width: operationsTheme.size.controlLg,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  confirm: {
    marginTop: operationsTheme.space.xl,
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
