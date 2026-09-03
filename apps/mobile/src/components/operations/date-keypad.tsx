import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { dateDigitsDelete, dateDigitsFrom, dateDigitsPress, dateFromDigits, dateMask, DATE_DIGITS } from './date-keypad-value';
import { OperationsKeyGrid, OperationsKeypadDelete } from './key-grid';

/*
  TARİH TUŞ TAKIMI — SKT altı rakamla yazılır (kullanıcı kararı 03.09).

  ── ÇEKMECE AİLESİNİN DESENİ, AYNEN (kullanıcı kararı 03.09) ────────────────
  Tekerlekli tarih çekmecesiyle (`date-sheet`) aynı iskelet: künye satırı · hızlı çipler (zeytin,
  yatay) · gövde · altta "Vazgeç" + "{tarih} · yaz" (yeşil, büyüyen). Gövde tuş takımı ailesinden
  (`keypad-panel`): büyük değer solda, ipucu altında, SİL sağda, ızgara `key-grid`ten. Yeni bir
  şekil doğmadı — iki desen üst üste kondu.

  ── NEDEN TEKERLEK DEĞİL ────────────────────────────────────────────────────
  Üç sütunlu seçici olmayan günü doğurmuyordu ama rampada YAVAŞTI: kullanıcı *"bunu seçmesi çok
  zor… elle hızlı, gün ay yıl iki hane, altı rakam"* dedi. İncelediği kolilerde tarih zaten
  gün.ay.yıl basılı; depocu okuduğunu yazar. Tekerlek duruyor — gövdenin altındaki bağlantı onu
  açar ("takvimden seç"): tarihi okunamayan koli için yol kapanmıyor.

  ── ESKİ KLAVYE GİRİŞİNİN İKİ ARIZASI BURADA DOĞMUYOR ───────────────────────
  Serbest klavye "31.02" ve "2.6.26 mi 6.2.26 mı" üretiyordu. Maske biçimi sabitliyor
  (`gg.aa.yy`, alt çizgiler eksiği gösteriyor), altı rakam dolunca takvim denetimi yapılıyor ve
  olmayan gün onaylanamıyor — yazılır, kırmızı satır "böyle bir gün yok" der, düğme kapalı kalır.

  ── HIZLI ÇİPLER: AYNI KABULDEKİ TARİHLER ───────────────────────────────────
  Lot önerisinin aynı kuralı (kullanıcı 03.09: *"aynı partideki tarihler de lot gibi öneri olarak
  gelmeli"*): bir sevkiyatın satırları çoğunlukla bir iki tarihten gelir; depocu bir kez yazar,
  ötekilerde çipe dokunur. Çip TASLAĞI doldurur, tekerleğin hızlı çipleri gibi — onay yine "yaz"
  düğmesinde, düğme hangi tarihi yazacağını söyler. Kaynak formun kendi durumu, hiçbir uç sorulmaz.
*/

/** Tarih tuşları: dokuz rakam ve sıfır; virgül ve çift sıfır yok. */
const DATE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

interface OperationsDateKeypadProps {
  visible: boolean;
  title: string;
  /** Künye satırı — "Fıstıklı Baklava · 450 g · seçili: 30.08.26". */
  subject: string;
  /** Açılış değeri (ISO) ya da boş. */
  value: string;
  /** Aynı kabuldeki öteki satırların tarihleri (ISO) — hızlı çipler; boşsa sıra çizilmez. */
  suggestions: readonly string[];
  copy: {
    hint: string;
    deleteLabel: string;
    /** Altı rakam dolu ama takvimde yok. */
    invalid: string;
    /** `{date}` yer tutucusu — "12.09.27 · yaz". */
    confirmLabel: string;
    cancelLabel: string;
    /** Tekerlekli seçiciye geçiş bağlantısı. */
    wheelLabel: string;
  };
  onConfirm: (iso: string) => void;
  /** Tekerleğe geçiş — çağıran bu çekmeceyi kapatıp ötekini açar. */
  onWheel: () => void;
  onClose: () => void;
  testID?: string;
}

export function OperationsDateKeypad({
  visible,
  title,
  subject,
  value,
  suggestions,
  copy,
  onConfirm,
  onWheel,
  onClose,
  testID,
}: OperationsDateKeypadProps) {
  const [digits, setDigits] = useState(() => dateDigitsFrom(value));
  const [keyWidth, setKeyWidth] = useState<number | null>(null);
  /* İlk rakam açılış değerini EZER (para tuş takımının kuralı): dolu bir tarihe yeni tarih yazan
     depocu önce altı kez silmek zorunda kalmaz. Çipten gelen değer de "taze" sayılır. */
  const [fresh, setFresh] = useState(true);

  /* Her AÇILIŞTA çağıranın değeri yeniden alınır: kapatılıp yeniden açılan tuş takımı, bir önceki
     satırın tarihini ya da yarım kalan denemeyi göstermemeli (tekerleğin aynı kuralı). */
  useEffect(() => {
    if (visible) {
      setDigits(dateDigitsFrom(value));
      setFresh(true);
    }
  }, [visible, value]);

  const iso = dateFromDigits(digits);
  const invalid = digits.length === DATE_DIGITS && iso === null;
  const id = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <Text style={styles.subject}>{subject}</Text>

      {suggestions.length === 0 ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picks}>
          {suggestions.map((date) => (
            <PressableSurface
              key={date}
              onPress={() => {
                setDigits(dateDigitsFrom(date));
                setFresh(true);
              }}
              feedback="scale"
              compact
              style={styles.pick}
              accessibilityLabel={dateMask(dateDigitsFrom(date))}
              testID={id(`pick-${date}`)}
            >
              <Text style={styles.pickLabel}>{dateMask(dateDigitsFrom(date))}</Text>
            </PressableSurface>
          ))}
        </ScrollView>
      )}

      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.value, invalid ? styles.valueInvalid : null]} testID={id('value')}>
            {dateMask(digits)}
          </Text>
          <Text style={[styles.hint, invalid ? styles.hintInvalid : null]} testID={id('hint')}>
            {invalid ? copy.invalid : copy.hint}
          </Text>
        </View>
        <OperationsKeypadDelete
          onPress={() => {
            setDigits(dateDigitsDelete);
            setFresh(false);
          }}
          label={copy.deleteLabel}
          width={keyWidth}
          testID={id('delete')}
        />
      </View>

      <OperationsKeyGrid
        keys={DATE_KEYS}
        onKey={(key) => {
          setDigits((current) => dateDigitsPress(fresh ? '' : current, key));
          setFresh(false);
        }}
        onKeyWidth={setKeyWidth}
        testID={testID}
      />

      <View style={styles.wheelLink}>
        <TextAction label={copy.wheelLabel} onPress={onWheel} testID={id('wheel')} />
      </View>

      <View style={styles.actions}>
        <PressableSurface onPress={onClose} feedback="scale" style={styles.cancel} accessibilityLabel={copy.cancelLabel} testID={id('cancel')}>
          <Text style={styles.cancelLabel}>{copy.cancelLabel}</Text>
        </PressableSurface>
        {/* DÜĞME NE YAZACAĞINI SÖYLER (tekerleğin kararı): "12.09.27 · yaz". Gerçek tarih yoksa
            KAPALI — eksik haneyi maske, yanlış günü kırmızı satır söylüyor, düğme susuyor. */}
        <PressableSurface
          onPress={() => {
            if (iso !== null) onConfirm(iso);
          }}
          disabled={iso === null}
          feedback="shadow"
          grow
          style={[styles.confirm, iso === null ? styles.confirmIdle : null]}
          accessibilityLabel={fillCopy(copy.confirmLabel, { date: dateMask(digits) })}
          testID={id('confirm')}
        >
          <Text style={styles.confirmLabel}>{fillCopy(copy.confirmLabel, { date: dateMask(digits) })}</Text>
        </PressableSurface>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subject: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  picks: { gap: operationsTheme.space.md, paddingVertical: operationsTheme.space.lg },
  pick: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  pickLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  headText: { flex: 1, gap: operationsTheme.space['2xs'] },
  /** Değer SERİF ve büyük — para/adet tuş takımının aynı kademesi. */
  value: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['page-title'],
    color: operationsTheme.colors.ink,
  },
  valueInvalid: {
    color: operationsTheme.colors.terracotta,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  hintInvalid: {
    color: operationsTheme.colors.terracotta,
  },
  wheelLink: {
    marginTop: operationsTheme.space.lg,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xl,
  },
  cancel: {
    width: operationsTheme.size.circleSm,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
  },
  cancelLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  /** YEŞİL: çekmecenin tek "olur"u (tekerleğin `02c` kararı); kapalıyken kum. */
  confirm: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.olive,
  },
  confirmIdle: {
    backgroundColor: operationsTheme.colors['sand-500'],
  },
  confirmLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
