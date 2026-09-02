import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { OperationsKeypadPanel } from './keypad-panel';
import { OperationsStepperGroup } from './stepper-group';
import {
  breakdownRows,
  breakdownText,
  caseKey,
  quantityTotal,
  setCaseCount,
  EXTRA_CASE_SIZES,
  LOOSE_RULER,
  type CaseSize,
  type QuantityBreakdown,
} from './quantity-value';

/*
  ADET ÇEKMECESİ (Operasyon Mobil v3 · `00-ortak` — `sheetAdet`).

  ── BU BİR TUŞ TAKIMI DEĞİLDİR ──────────────────────────────────────────────
  Tasarımda İKİ ayrı çekmece var ve ikisi karıştırılmamalı: `keypadAcik` PARANIN tuş takımıdır
  (€ işareti, 12 tuş, virgül, "beklenen" çipi — tahsilat ve gün sonu sayımı), `sheetAdet` ise
  ADEDİN çekmecesidir ve içinde HİÇ tuş yoktur. Bir kez `OperationsAmountKeypad` ile yazıldı ve
  yanlıştı (kullanıcı bulgusu 30.08): depocu rampada 27 paketi rakam rakam yazmaz, "iki koli, üç
  tek" der.

  ── SORU "KAÇ PAKET" DEĞİL, "KAÇ KOLİ" ──────────────────────────────────────
  Çarpma işini EKRAN yapar. Kolinin kaç paket olduğu bir veridir (`variant_barcode`ın koli kodu),
  depocunun zihinden çarpması gereken bir sayı değil — ve zihinden çarpım, sayımın en sık hata
  kaynağıdır. Toplam koyu kartta canlı yazar ve altında hesabın kendisi durur
  (*"2 × 12 + 3 tek paket = 27 paket"*): depocu sonucu değil YOLU doğrular.

  ── DEĞER CANLI YAZILIR, ONAYA BEKLEMEZ ─────────────────────────────────────
  Tasarımın "Tamam"ı bir onay değil bir KAPATMA düğmesidir (`closeSheet`) — her ± anında satır
  zaten güncellenmiştir. Kontrollü komponent: değer çağıranda durur, buradaki her dokunuş
  `onChange` ile yukarı gider. Yerel bir taslak tutulsaydı, çekmece açıkken satırın kendisi
  eskimiş kalırdı ve depocu arkadaki toplamı yanlış görürdü.

  ── "BAŞKA KOLİ BOYU" AYRI KATMAN DEĞİL, İKİNCİ ADIM ────────────────────────
  Tasarım onu kendi örtüsü olan ikinci bir çekmece gibi çiziyor (`sheetKutuTip`, z-index 62) ve
  örtüsüne basmak ADET çekmecesine GERİ döndürüyor — yani zaten bir alt adım. Burada aynı panelin
  içeriği değişiyor: iç içe iki `Modal`, `BottomSheet` künyesindeki Fabric söküm arızasının
  (21.121) tam olarak tetikleyicisidir ve ikinci bir örtünün tek kazancı görsel.

  ── LİSTE BOŞSA UYDURULMAZ — AMA KAPI KAPANMAZ (düzeltildi 30.08) ───────────
  Varsayılan bir 12'lik koli KONMAZ: ölçülmemiş bir çarpanı ölçülmüş gibi göstermek stoğu sessizce
  bozar (CLAUDE §1). Bu kural yerinde.

  Eskiden aynı gerekçeyle bölümün TAMAMI gizleniyordu ve o fazlaydı: "Başka koli boyu" kapısı da
  bölümün içinde olduğu için, kayıtlı boyu olmayan üründe depocu koli SAYAMIYOR, 30 paketi tek tek
  sayıyordu (cihazda görüldü: Fıstıklı Baklava 2500 g). Oysa boy eklemek bir varsayım değil bir
  ÖLÇÜMDÜR — depocu elindeki koliye bakıp listeden seçer ve seçim ürün kartına kaydedilir.
  Bugün bölüm hep çizilir; liste boşken yalnız başlık ve ekleme satırı görünür.
*/

interface QuantitySheetCopy {
  /** Künye satırı — "Fıstıklı Baklava · 450 g · barkod okutulmadı". */
  subject: string;
  reset: string;
  /** Koyu kartta sayının yanındaki birim — "paket · toplam". */
  unit: string;
  /** Hesap satırının parçaları; `{n}`/`{parts}` yer tutucu. */
  sumLoose: string;
  sumTotal: string;
  sumEmpty: string;
  casesTitle: string;
  casesHint: string;
  /** Koli satırının başlığı — "Koli — {n} paket". */
  caseLabel: string;
  /** Alt satır: sayılmışsa toplam, sayılmamışsa ne sorulduğu. */
  caseTotal: string;
  caseIdle: string;
  /** Sahada eklenen boyun kod yerine yazdığı şey — "YENİ · ürüne kaydedilecek". */
  caseNew: string;
  addTitle: string;
  addHint: string;
  looseTitle: string;
  looseHint: string;
  confirm: string;
  /** İkinci adım: koli boyu seçimi. */
  extra: { title: string; hint: string; footnote: string; cancel: string };
  /** Üçüncü adım: rakamla giriş — koyu kartın ipucu metni de burada (`open`). */
  keypad: { open: string; title: string; hint: string; confirm: string; cancel: string; delete: string };
}

interface OperationsQuantitySheetProps {
  visible: boolean;
  /** Panel başlığı — "Adet". */
  title: string;
  value: QuantityBreakdown;
  /** Ürünün kayıtlı koli boyları; boş dizi = yalnız tek paket sayılır. */
  caseSizes: CaseSize[];
  onChange: (next: QuantityBreakdown) => void;
  copy: QuantitySheetCopy;
  onClose: () => void;
  testID?: string;
}

export function OperationsQuantitySheet({
  visible,
  title,
  value,
  caseSizes,
  onChange,
  copy,
  onClose,
  testID,
}: OperationsQuantitySheetProps) {
  /**
   * Adımlar: `count` (koli + tek) · `sizes` ("başka koli boyu") · `keypad` (rakamla gir).
   * Çekmece her açılışta ADET adımıyla başlar.
   */
  const [step, setStep] = useState<'count' | 'sizes' | 'keypad'>('count');
  /** Boy ızgarasının ölçülen genişliği — hücre genişliği bundan türer (künyesi ızgarada). */
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    if (visible) setStep('count');
  }, [visible]);

  const rows = breakdownRows(value, caseSizes);
  const total = quantityTotal(value);
  const id = (suffix: string) => (testID === undefined ? undefined : `${testID}-${suffix}`);

  /*
    ── RAKAMLA GİR (kullanıcı kararı 02.09) ──────────────────────────────────
    Kullanıcının sorusu haklıydı: *"ortaya tıklandığı zaman doğrudan sayı klavyesi açılsa daha mı
    hızlı olur?"* Ölçüm ikisinin de haklı olduğu yeri gösterdi — cetvel 0–24 arasını TEK dokunuşla
    veriyor ve klavyesiz; ama cetvel 24'te bitiyor ve ötesi yalnız ±1. Rafta 40 açık paket varsa
    cetvelden 24, sonra on altı kez artı; tuş takımında iki tuş.

    Bu yüzden ikisinden biri değil, İKİSİ: koli ve küçük sayı cetvelden, büyük ve tek sayı
    rakamdan. 30.08'in bulgusu (*"depocu 27 paketi rakam rakam yazmaz"*) yerinde duruyor — o bulgu
    tuş takımının çekmecenin YERİNE geçmesine karşıydı, yanında durmasına değil.

    Sistem klavyesi DEĞİL kendi tuş takımımız: eldivenli el ve — burada özellikle — çekmecenin
    üstüne açılan bir klavye, yazılan sayıyı ve toplamı görüş alanından çıkarırdı.

    YAZILAN SAYI TOPLAMDIR ve döküm SIFIRLANIR: "2 koli + 3 tek" iken 30 yazan depocu 54 değil 30
    demek istiyor. Dökümü koruyup üstüne eklemek, hiç kimsenin beklemediği bir sayı üretirdi.
  */
  if (step === 'keypad') {
    return (
      <BottomSheet visible={visible} title={copy.keypad.title} onClose={onClose} testID={testID}>
        <Text style={styles.subject}>{copy.subject}</Text>
        <OperationsKeypadPanel
          value={total === 0 ? '' : String(total)}
          unit={copy.unit}
          allowDecimals={false}
          confirmLabel={copy.keypad.confirm}
          hint={copy.keypad.hint}
          deleteLabel={copy.keypad.delete}
          onConfirm={(text) => {
            /* Boş onay DEĞERİ SİLMEZ, adımı kapatır: "yazmaktan vazgeçtim" ile "sıfır say" ayrı
               şeyler ve ikincisinin kendi yolu var (başlıktaki "sıfırla"). */
            const typed = Number.parseInt(text.replace(/\D/g, ''), 10);
            if (Number.isSafeInteger(typed)) onChange({ cases: [], loose: typed });
            setStep('count');
          }}
          testID={id('keypad')}
        />
        <SecondaryButton
          label={copy.keypad.cancel}
          onPress={() => setStep('count')}
          elevation="flat"
          testID={id('keypad-cancel')}
        />
      </BottomSheet>
    );
  }

  if (step === 'sizes') {
    return (
      <BottomSheet visible={visible} title={copy.extra.title} onClose={onClose} testID={testID}>
        <Text style={styles.subject}>{copy.extra.hint}</Text>
        <View
          style={styles.sizeGrid}
          /* KAP ÖLÇÜLÜR, YÜZDE KULLANILMAZ (üç turda ölçüldü 30.08). `flexBasis: '22%'` bu panelde
             hiç çözülmüyor: hücreler içeriğe göre daralıp SEKİZİ DE tek satıra diziliyor
             (`alignSelf: 'stretch'` ve `flexGrow: 0` de çözmedi). Genişliği `onLayout`tan alıp
             dörde bölmek varsayımsız tek yol — tasarımın 2×4 ızgarası buradan çıkıyor. */
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        >
          {EXTRA_CASE_SIZES.map((size) => (
            <PressableSurface
              key={size}
              onPress={() => {
                /* Seçilen boy DOĞRUDAN bir koli sayılır (tasarım: `kk[key] = (kk[key]||0) + 1`) ve
                   adet adımına dönülür — depocu boyu "tanımlamak" için değil, elindeki koliyi
                   saymak için giriyor; ayrıca bir kez daha "+"a bastırmak fazladan bir adım. */
                onChange(setCaseCount(value, { code: null, qtyPerCode: size }, countOf(value, size) + 1));
                setStep('count');
              }}
              feedback="scale"
              style={[styles.sizeCell, gridWidth === 0 ? null : { width: (gridWidth - 3 * operationsTheme.space.md) / 4 }]}
              accessibilityLabel={copy.caseLabel.replace('{n}', String(size))}
              testID={id(`size-${size}`)}
            >
              <Text style={styles.sizeLabel}>{size}</Text>
            </PressableSurface>
          ))}
        </View>
        <Text style={styles.footnote}>{copy.extra.footnote}</Text>
        <SecondaryButton label={copy.extra.cancel} onPress={() => setStep('count')} elevation="flat" testID={id('size-cancel')} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      title={title}
      /* "SIFIRLA" BAŞLIKLA AYNI HİZADA (kullanıcı bulgusu 30.08 · tasarım karesi
         `02b-Adet-Klavyesi`): eskiden künye satırındaydı, yani bir kademe aşağıda ve ürün adının
         yanında duruyordu. Sıfırlanan şey bir alan değil çekmecenin TAMAMI; yeri de panelin
         başlığıdır. */
      titleAction={
        <PressableSurface
          onPress={() => onChange({ cases: [], loose: 0 })}
          feedback="scale"
          compact
          style={styles.reset}
          accessibilityLabel={copy.reset}
          testID={id('reset')}
        >
          <Text style={styles.resetLabel}>{copy.reset}</Text>
        </PressableSurface>
      }
      onClose={onClose}
      testID={testID}
    >
      <Text style={styles.subject}>{copy.subject}</Text>

      {/* TOPLAM KOYU KARTTA: ekranın tek konusu bu sayı ve krem bir yüzeyde krem bir kartla
          ayrışmazdı. Altındaki hesap satırı sonucu DOĞRULATIR — depocu 27'yi değil, 27'nin
          nereden geldiğini okur. */}
      <PressableSurface
        onPress={() => setStep('keypad')}
        feedback="scale"
        style={styles.total}
        accessibilityLabel={copy.keypad.open}
        accessibilityHint={copy.keypad.title}
        testID={id('keypad-open')}
      >
        <View style={styles.totalHead}>
          <Text style={styles.totalValue} testID={id('total')}>
            {total}
          </Text>
          <Text style={styles.totalUnit}>{copy.unit}</Text>
          {/* KARTIN BASILABİLİR OLDUĞUNU KART SÖYLER: ipucu metni sağda, tuş takımı işaretiyle.
              Görünmez bir dokunma alanı, olmayan bir özelliktir. */}
          <Text style={styles.totalKeypad}>{copy.keypad.open}</Text>
        </View>
        <Text style={styles.totalSum} testID={id('sum')}>
          {breakdownText(value, { loose: copy.sumLoose, total: copy.sumTotal, empty: copy.sumEmpty })}
        </Text>
      </PressableSurface>

      {/* BÖLÜM HER ZAMAN ÇİZİLİR, AMA VARSAYILAN KOLİ YOKTUR (düzeltildi 30.08, kullanıcı bulgusu).
          Eskiden kayıtlı boyu olmayan üründe bölüm hiç çizilmiyordu ve künyesi bunu şöyle
          gerekçelendiriyordu: *"varsayılan bir 12'lik koli koymak, ölçülmemiş bir çarpanı ölçülmüş
          gibi gösterip stoğu bozardı."* Gerekçe DOĞRU ama kapattığı şey fazlaydı: bölümle birlikte
          "Başka koli boyu" kapısı da kayboluyordu, yani kayıtlı boyu olmayan üründe depocu koli
          SAYAMIYOR, yalnız tek tek sayabiliyordu (cihazda görüldü: Fıstıklı Baklava 2500 g).
          Boy eklemek bir varsayım değil bir ÖLÇÜM: depocu elindeki koliye bakıp listeden seçiyor
          (`sheetKutuTip`) ve seçim ürün kartına kaydediliyor. Liste boşken yalnız başlık ve ekleme
          satırı görünür — hiçbir koli önceden sayılmaz. */}
      {
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.eyebrow}>{copy.casesTitle}</Text>
            <Text style={styles.hint}>{copy.casesHint}</Text>
          </View>
          {rows.map((row) => (
            <View
              key={caseKey(row)}
              style={[styles.caseRow, row.count > 0 ? styles.caseRowActive : null]}
              testID={id(`case-${caseKey(row)}`)}
            >
              <View style={styles.caseBody}>
                <Text style={row.count > 0 ? styles.caseLabelActive : styles.caseLabel}>
                  {copy.caseLabel.replace('{n}', String(row.qtyPerCode))}
                </Text>
                <Text style={styles.caseMeta}>
                  {`${row.code ?? copy.caseNew} · ${
                    row.count > 0 ? copy.caseTotal.replace('{n}', String(row.count * row.qtyPerCode)) : copy.caseIdle
                  }`}
                </Text>
              </View>
              <OperationsStepperGroup
                value={row.count}
                onChange={(next) => onChange(setCaseCount(value, row, next))}
                label={copy.caseLabel.replace('{n}', String(row.qtyPerCode))}
                tone={row.count > 0 ? 'positive' : 'neutral'}
                testID={id(`case-${caseKey(row)}-step`)}
              />
            </View>
          ))}
          <PressableSurface
            onPress={() => setStep('sizes')}
            feedback="scale"
            style={styles.addRow}
            accessibilityLabel={copy.addTitle}
            testID={id('add-size')}
          >
            <View style={styles.addBadge}>
              <Text style={styles.addGlyph}>+</Text>
            </View>
            <View style={styles.caseBody}>
              <Text style={styles.addTitle}>{copy.addTitle}</Text>
              <Text style={styles.addHint}>{copy.addHint}</Text>
            </View>
          </PressableSurface>
        </View>
      }

      <View style={styles.section}>
        <View style={styles.looseHead}>
          <View style={styles.sectionHead}>
            <Text style={styles.eyebrow}>{copy.looseTitle}</Text>
            <Text style={styles.hint}>{copy.looseHint}</Text>
          </View>
          <OperationsStepperGroup
            value={value.loose}
            onChange={(loose) => onChange({ ...value, loose })}
            label={copy.looseTitle}
            testID={id('loose-step')}
          />
        </View>
        {/* CETVEL PANELİN KENARINA KADAR AKAR: son çip ekranın dışına taşınca kaydırılabilir
            olduğu söylenmeden anlaşılır. Panelin kendi yan dolgusu negatif kenarla geri alınıp
            içeriğe veriliyor — ilk çip yine hizada başlar. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.rulerBleed}
          contentContainerStyle={styles.ruler}
          testID={id('ruler')}
        >
          {LOOSE_RULER.map((n) => (
            <PressableSurface
              key={n}
              onPress={() => onChange({ ...value, loose: n })}
              feedback="scale"
              compact
              style={[styles.rulerCell, n === value.loose ? styles.rulerCellActive : null]}
              accessibilityLabel={`${copy.looseTitle}: ${n}`}
              testID={id(`ruler-${n}`)}
            >
              <Text style={n === value.loose ? styles.rulerLabelActive : styles.rulerLabel}>{n}</Text>
            </PressableSurface>
          ))}
        </ScrollView>
      </View>

      {/* "Tamam" ONAY DEĞİL KAPATMADIR — değerler zaten yazıldı (künye). Bu yüzden hiçbir hâlde
          pasif değil: sayılmamış bir satırı kapatmak da meşrudur. */}
      <PrimaryButton label={copy.confirm} onPress={onClose} tone="ink" elevation="flat" testID={id('confirm')} />
    </BottomSheet>
  );
}

/** Sahada eklenen bir çarpanın mevcut sayısı — ikinci kez eklenince üstüne biner, sıfırlanmaz. */
function countOf(value: QuantityBreakdown, qtyPerCode: number): number {
  return value.cases.find((item) => item.code === null && item.qtyPerCode === qtyPerCode)?.count ?? 0;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: operationsTheme.space.xl,
  },
  subject: {
    flexShrink: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  reset: { paddingVertical: operationsTheme.space.xs },
  resetLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },

  total: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space.sm,
  },
  totalHead: { flexDirection: 'row', alignItems: 'flex-end', gap: operationsTheme.space.md },
  totalValue: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text['page-title'],
    lineHeight: operationsTheme.text['page-title'],
    color: operationsTheme.colors['on-image'],
  },
  totalUnit: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-ink-label'],
    paddingBottom: operationsTheme.space.sm,
  },
  /** "rakamla gir" ipucu — kartın sağ ucunda, birimden ayrı: biri ne olduğunu, öteki ne
      yapabileceğini söylüyor. */
  totalKeypad: {
    marginLeft: 'auto',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-ink-label'],
    paddingBottom: operationsTheme.space.sm,
  },
  /* Hesap satırı tasarımda #e8dcc9 — koyu zeminin SÖNÜK kremi ve sette karşılığı YOK
     (`on-image` #f5f1e6 bir kademe parlak, `on-ink-muted` #a49f8f çok koyu). Rolü doğru olan
     durağa bağlandı; eksik durak envantere bildirildi (`docs/talep`). */
  totalSum: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-image'],
  },

  section: { gap: operationsTheme.space.md },
  sectionHead: { flex: 1, gap: operationsTheme.space['2xs'] },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
  },

  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    paddingLeft: operationsTheme.space['3xl'],
    paddingRight: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  /** Sayılmış koli ZEYTİNE döner — listede hangi boydan geçtiğin tek bakışta görünsün. */
  caseRowActive: {
    borderColor: operationsTheme.colors.olive,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  caseBody: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  caseLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  caseLabelActive: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  caseMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  addBadge: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.card,
  },
  addGlyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['sheet-title'],
    lineHeight: operationsTheme.text['sheet-title'],
    color: operationsTheme.colors.olive,
  },
  addTitle: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  addHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.body,
  },

  looseHead: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  rulerBleed: {
    marginHorizontal: -operationsTheme.space['5xl'],
    flexGrow: 0,
  },
  ruler: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingVertical: operationsTheme.space['2xs'],
  },
  rulerCell: {
    minWidth: operationsTheme.size.controlMd,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  /* Seçili durak MÜREKKEP dolar (tasarımın `chip(aktif)`i): cetvel uzun ve zeytin bir vurgu tonu
     olarak 25 çipin içinde kayboluyordu — dolu koyu kutu uzaktan da bulunur. */
  rulerCellActive: {
    borderColor: operationsTheme.colors.ink,
    backgroundColor: operationsTheme.colors.ink,
  },
  rulerLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.ink,
  },
  rulerLabelActive: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors['on-image'],
  },

  /* `alignSelf: 'stretch'` ZORUNLU (cihazda ölçüldü 30.08, kullanıcı bulgusu): satır kabı kendi
     genişliğini almadan `flexBasis: '22%'` çözülemiyor — yüzde neyin yüzdesi olduğunu bilmediği
     için `0` gibi davranıyor, hücreler içeriğe göre daralıyor ve SEKİZİ DE tek satıra diziliyor.
     Tasarım 2×4 ızgara istiyor (`02e-Kutu-Tipi-Cekmecesi`); ekranda dar, dikey elipsler çıkıyordu. */
  sizeGrid: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.md },
  /* DÖRT SÜTUN: `%25` boşlukları saymaz, `%22` sayar. `flexShrink: 0` ZORUNLU — Yoga sarmadan
     ÖNCE küçültür, yani küçülebilen hücreler hiç alt satıra inmez, hepsi tek satırda ince
     dilimlere döner (aynı arıza tuş takımında ölçüldü 30.08). */
  sizeCell: {
    /* SARMAYI `minWidth` ZORLUYOR, yüzde değil (iki turda ölçüldü 30.08).
       `flexBasis: '22%'` tek başına sarmıyordu: sekiz hücre tek satırda dikey elipslere dönüyordu
       ve `alignSelf: 'stretch'` de çözmedi — yüzde temel bu kapta çözülmüyor. İlk alt genişlik
       (52) altı hücreyi bir satıra sığdırdı; tasarım 2×4 istiyor (`02e-Kutu-Tipi-Cekmecesi`).
       68 dp'de beşinci hücre satıra sığmıyor (5×68+4×10 > 320), dördü sığıyor. Değer token'lardan
       türetildi, ham sayı yazılmadı. */
    /* Genişlik ÖLÇÜLEN kaptan geliyor (ızgaradaki künye); burada yalnız küçülmeye kapı kapalı —
       Yoga sarmadan ÖNCE küçültür, yani küçülebilen hücreler hiç alt satıra inmez. */
    flexShrink: 0,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  sizeLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * 1.5,
    color: operationsTheme.colors['tab-inactive'],
  },
});
