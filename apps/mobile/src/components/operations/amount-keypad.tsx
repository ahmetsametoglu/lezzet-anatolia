import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import {
  keypadDelete,
  keypadDisplay,
  keypadFill,
  keypadFrom,
  keypadPress,
  type KeypadValue,
} from './keypad-value';

/*
  PARA TUŞ TAKIMI (Operasyon Mobil v3 · `00-ortak`) — tutar CİHAZ KLAVYESİYLE yazılmaz.

  ── NİÇİN AYRI BİR TUŞ TAKIMI ───────────────────────────────────────────────
  Tasarımın kendi cümlesi ekranın altında yazılı: *"Cihaz klavyesi açılmaz — eldivenle de
  basılabilecek büyük tuşlar."* Bu bir üslup tercihi değil, sahanın şartı: kapıda ve rampada
  telefon eldivenle tutuluyor ve sistem klavyesinin tuşları o parmakla güvenilir basılmıyor.
  İkinci sebep: sistem klavyesi ekranın yarısını kaplayıp yazılan tutarı ve "beklenen"i görüş
  alanından çıkarıyordu — burada ikisi de tuşların ÜSTÜNDE durur.

  ── "BEKLENEN" BİR TUŞTUR, BİR ETİKET DEĞİL ─────────────────────────────────
  Motorun tutarı çipin içinde yazar ve dokunulunca alana geçer. En sık yapılan iş "beklenen kadar
  tahsil ettim"dir; onu elle yazdırmak, her teslimde beş tuş demekti.

  ── DEĞER SADECE ONAYLANINCA ÇIKAR ──────────────────────────────────────────
  Panel kendi taslağını tutar; çağıran ancak "Yaz"a basılınca haber alır. Her tuşta dışarı haber
  vermek, alanın altındaki hesapları (fark sütunu, CTA etiketi) yarım tutarlarla titretirdi.
*/

/** Tuş dizilişi v3'ün ızgarası: üç sütun, on iki tuş — son satır virgül · 0 · çift sıfır. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '00'] as const;

interface OperationsAmountKeypadProps {
  visible: boolean;
  /** Panelin üstündeki küçük başlık — hangi kasa/tutar yazılıyor ("NAKİT SAYIMI"). */
  title: string;
  /** Alanın açılış değeri (`"60,00"`); ilk rakam onu EZER. */
  value: string;
  /**
   * Motorun/kasanın beklediği tutar — çipe yazılır ve dokunulunca alana geçer. `null` ise çip
   * ÇİZİLMEZ: beklenen bilinmiyorsa uydurma bir sayı sunmak, kuryeye yanlış tutarı tek dokunuşla
   * yazdırmaktı.
   */
  expected: string | null;
  /** Çipin etiketi — "beklenen {amount}" gibi; i18n çağıranın işidir. */
  expectedLabel?: string;
  /**
   * Değerin YANINDA yazan birim — para için `€`, sayım için `adet`.
   *
   * Tuş takımı para için doğdu (21.159) ve birimi gömülüydü. Mal kabulün ADET kutusu da onu
   * açmalı (görsel ajanı ölçümü 30.08 · fark #1): tasarımın kendi cümlesi *"Cihaz klavyesi
   * açılmaz — eldivenle de basılabilecek büyük tuşlar"* diyor ve bu bir para kararı değil, bir
   * ELDİVEN kararı — depocunun eli de eldivenli.
   */
  unit: string;
  /**
   * Ondalık girilebilir mi. Para için EVET (`12,50`), ADET için HAYIR — yarım paket diye bir şey
   * yok ve virgül tuşunu açık bırakmak, kabul edilemeyecek bir değeri yazılabilir gösterirdi.
   */
  allowDecimals?: boolean;
  confirmLabel: string;
  hint: string;
  footnote: string;
  deleteLabel: string;
  onConfirm: (text: string) => void;
  onClose: () => void;
  testID?: string;
}

export function OperationsAmountKeypad({
  visible,
  title,
  value,
  expected,
  expectedLabel,
  unit,
  allowDecimals = true,
  confirmLabel,
  hint,
  footnote,
  deleteLabel,
  onConfirm,
  onClose,
  testID,
}: OperationsAmountKeypadProps) {
  const [draft, setDraft] = useState<KeypadValue>(() => keypadFrom(value));

  /* Panel her AÇILIŞTA çağıranın değerini yeniden alır: kapatılıp yeniden açılan bir tuş takımı,
     bir önceki denemenin yarım kalan tutarını göstermemeli. */
  useEffect(() => {
    if (visible) setDraft(keypadFrom(value));
  }, [visible, value]);

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <View style={styles.head}>
        <View style={styles.headText}>
          {/* ÜSTBAŞLIK KALDIRILDI (cihazda görüldü 30.08): `title` hem çekmecenin başlığına hem
              buraya basılıyordu ve ekranda AYNI cümle iki kez, üst üste duruyordu. Çekmecenin
              kendi başlığı zaten "hangi tutar/adet yazılıyor"u söylüyor; ikinci kopya bilgi
              taşımıyor, yalnız değeri aşağı itiyordu. */}
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
      <View style={styles.grid}>
        {KEYS.filter((key) => allowDecimals || key !== ',').map((key) => (
          <PressableSurface
            key={key}
            onPress={() => setDraft((current) => keypadPress(current, key))}
            feedback="scale"
            style={styles.key}
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

      <Text style={styles.footnote}>{footnote}</Text>
    </BottomSheet>
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
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
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
  key: {
    flexBasis: '30%',
    flexGrow: 1,
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
    boxShadow: operationsTheme.shadow['hard-on-ink'],
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
