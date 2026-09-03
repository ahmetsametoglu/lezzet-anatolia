import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  ADET SAYACI — uygulamanın TEK adet deseni: `− 3 +` tek çerçevenin içinde (kullanıcı kararı
  02.09).

  ── NİÇİN TEK DESEN ─────────────────────────────────────────────────────────
  Kullanıcının cümlesi: *"adet arttırma azaltma için klasik bir desenimiz olması lazım her yerde;
  bir input var, sonra başında artı eksi var ama yerleri değişiyor, bu hoş değil."* Ölçüldü: kitte
  BEŞ ayrı adet kontrolü vardı (çerçeveli metin alanı · bağlı sayaç · tek başına ± düğmesi · büyük
  rakam + sağda ± çifti · kaydırıcı) ve aynı soru ekrandan ekrana başka bir kalıpla soruluyordu.
  Depocu her ekranda "burada nasıl sayılıyor"u yeniden öğreniyordu.

  Artık üç ihtiyacı TEK kontrol karşılıyor:
  · ince ayar → `−`/`+` hücreleri ("bir tane daha buldum"),
  · hızlı ayar → ortadaki rakama basınca açılan ADET ÇEKMECESİ (cetvel + koli çarpanı),
  · kesin giriş → çekmecenin "rakamla gir" adımı.
  Ne AÇILACAĞINI çağıran bilir (`onPressValue`): kit i18n bilmez ve açılanın sözleri ekranın.
  Kural (kullanıcı 02.09): koli sorulan yerde ADET ÇEKMECESİ (kabul · transfer · sayım · araç
  yükleme), sorulmayan yerde TUŞ TAKIMI; zaten bir çekmecenin içindeyse tuş takımı aynı çekmecenin
  bir adımı. Kaydırıcı (`qty-slider`) ve tek başına ± düğmesi (`stepper-button`) aynı gün silindi
  — istisna kalmadı.

  ── BOŞ İLE SIFIR AYRIMI KORUNUR ────────────────────────────────────────────
  `value: null` = HİÇ SAYILMADI, sıfır değil. Transferde boş "saymadım", 0 "koli geldi, mal yok"
  demektir; sayımda "—" henüz rafa bakılmadığını söyler. Eski metin alanı bu ayrımı boş dizeyle
  taşıyordu; sayaç `null` ile taşır ve boş hâlde rakamın yerine `emptyLabel` yazar (soluk). Boştan
  `+` tabanın bir üstüne çıkar (0 tabanında 1): "bir tane var" demenin en kısa yolu.

  ── TAVAN KİTTE ─────────────────────────────────────────────────────────────
  `max` verilirse `+` tavanda söner. Fiziksel duvarlar için (partide olmayan mal düşülemez,
  kabul edilenden fazlası hasarlı olamaz); "istenenden fazla" gibi YUMUŞAK sınırlar buraya
  yazılmaz, çağıran uyarır. Eskiden üç çağıran aynı kırpmayı kendi `onChange`inde yapıyordu ve
  düğme sönmüyordu: dokunulup hiçbir şey olmayan bir `+`, bozuk bir `+`dır.

  ── İKİ BOY, TEK ŞEKİL ──────────────────────────────────────────────────────
  `md` satır içi sayaç (42×46 hücre — tasarımın ölçüsü); `lg` ekranın KONUSU olan sayı (sayım
  ekranının büyük rakamı, okutma çekmecesinin adedi): tam genişlik, 52'lik hücreler, ortada
  Lora'yla büyük rakam. Şekil aynı, yalnız ölçek büyüyor — depocu ikisini aynı şey olarak okur.

  ── TON BİR RENK DEĞİL, SAYININ ANLAMIDIR ───────────────────────────────────
  `neutral` sayılan mal, `positive` sıfırdan büyük koli (tasarım kutuyu zeytine çeviriyor),
  `error` hasarlı paket. Çağıran rengi değil ANLAMI seçer.
*/

/** Sayının anlamı — renk değil, DURUM. */
type StepperTone = 'neutral' | 'positive' | 'error';

interface OperationsStepperGroupProps {
  /** `null` = HİÇ SAYILMADI (sıfır değil — ayrım kaydın kendisi). */
  value: number | null;
  onChange: (next: number) => void;
  /** Ekran okuyucuya giden ad — ZORUNLU; "−"/"+" işaretleri ad yerine geçmez. */
  label: string;
  tone?: StepperTone;
  /** Taban; altına inilemez. Sayım negatif olamaz, varsayılan 0. */
  min?: number;
  /** Fiziksel tavan; verilirse `+` orada söner. Yumuşak sınır buraya yazılmaz. */
  max?: number;
  /** `md` satır içi (varsayılan) · `lg` ekranın konusu olan sayı — tam genişlik, büyük rakam. */
  size?: 'md' | 'lg';
  /** Boş hâlde rakamın yerine yazılan işaret — bir kelime değil, bir boşluk işareti. */
  emptyLabel?: string;
  /**
   * **ORTADAKİ RAKAMA BASILINCA** (kullanıcı kararı 02.09) — verilirse sayı da bir düğme olur ve
   * çağıran ADET ÇEKMECESİNİ açar. Gerekçe rampanın kendisi: 12 adet koyacak kurye artı düğmesine
   * on iki kez basıyor; sayı zaten ekranın ortasında ve parmağın düştüğü yer.
   *
   * Verilmezse rakam düz metin kalır: çekmecenin İÇİNDEKİ sayaçlar (koli satırı, tek paket) ve
   * başka bir çekmecenin içinde duran sayaçlar böyle — çekmece çekmece açamaz (`bottom-sheet`
   * künyesi, Fabric söküm arızası 21.121).
   */
  onPressValue?: () => void;
  /** Rakama basınca ne olacağını söyleyen ekran-okuyucu ipucu ("adet çekmecesini açar"). */
  valueHint?: string;
  testID?: string;
}

export function OperationsStepperGroup({
  value,
  onChange,
  label,
  tone = 'neutral',
  min = 0,
  max,
  size = 'md',
  emptyLabel = '—',
  onPressValue,
  valueHint,
  testID,
}: OperationsStepperGroupProps) {
  const atFloor = value === null || value <= min;
  const atCeiling = max !== undefined && value !== null && value >= max;
  const shown = value === null ? emptyLabel : String(value);

  /* Rakam iki hâlde de AYNI görünür: basılabilir olması bir çerçeve ya da renk değişikliği
     getirmiyor. Ayrım dokunuşta ortaya çıkıyor — sayaç zaten bir girdi yüzeyi, içindeki her hücre
     dokunulabilir görünüyor. Boş hâl SOLUK: "—" bir değer değil, bir eksikliktir. */
  const deger = (
    <Text
      style={[styles.value, styles[`${size}Value`], value === null ? styles.emptyValue : styles[`${tone}Value`]]}
      accessibilityLabel={`${label}: ${shown}`}
      testID={testID === undefined ? undefined : `${testID}-value`}
    >
      {shown}
    </Text>
  );
  return (
    <View style={[styles.group, styles[`${size}Group`], styles[`${tone}Border`]]}>
      <PressableSurface
        onPress={() => onChange(Math.max(min, (value ?? min) - 1))}
        disabled={atFloor}
        feedback="scale-small"
        compact
        style={[styles.cell, styles[`${size}Cell`]]}
        accessibilityLabel={`${label} — azalt`}
        testID={testID === undefined ? undefined : `${testID}-decrease`}
      >
        {/* Eksi İŞARETİ (U+2212), tire değil: rakamla aynı genişlikte durur. */}
        <Text style={[styles.glyph, styles[`${size}Glyph`], atFloor ? styles.glyphDisabled : styles.glyphMinus]}>−</Text>
      </PressableSurface>
      {onPressValue === undefined ? (
        <View style={[styles.valueHit, styles[`${size}ValueHit`], size === 'lg' ? styles.lgPlainValue : null]}>{deger}</View>
      ) : (
        <PressableSurface
          onPress={onPressValue}
          feedback="scale-small"
          compact
          /* Büyük boyda rakamın hücresi kalan genişliğin tamamını alır — esneme `grow` ile,
             stile flex yazarak değil (`pressable-surface` kuralı; cihazda ölçüldü 02.09: stildeki
             `flex: 1` dış kabuğa ulaşmıyor ve üç hücre sola yığılıyor). */
          grow={size === 'lg'}
          style={[styles.valueHit, styles[`${size}ValueHit`]]}
          accessibilityLabel={`${label}: ${shown}`}
          accessibilityHint={valueHint}
          testID={testID === undefined ? undefined : `${testID}-value-hit`}
        >
          {deger}
        </PressableSurface>
      )}
      <PressableSurface
        /* Boştan artı TABANIN BİR ÜSTÜNE çıkar: "saymadım"dan "bir tane var"a tek dokunuş. */
        onPress={() => onChange((value ?? min) + 1)}
        disabled={atCeiling}
        feedback="scale-small"
        compact
        style={[styles.cell, styles[`${size}Cell`]]}
        accessibilityLabel={`${label} — artır`}
        testID={testID === undefined ? undefined : `${testID}-increase`}
      >
        <Text style={[styles.glyph, styles[`${size}Glyph`], atCeiling ? styles.glyphDisabled : styles[`${tone}Plus`]]}>
          +
        </Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    // Girdi yüzeyi: kartın İÇİNDE ve ondan parlak (operations-app.ts §2 yüzey hiyerarşisi).
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
    // Grup ESNEMEZ: yanındaki metin uzadıkça sayaç daralsaydı dokunma hedefi kısalırdı.
    flexShrink: 0,
  },
  mdGroup: {},
  /** Büyük boy satırı BOYDAN BOYA alır: ekranın konusu olan sayı kenara sıkışmaz. */
  lgGroup: { alignSelf: 'stretch' },
  /* Hücre 42×46 — tasarımın ölçüsü. Genişlik dokunma hedefinin altında (44) ama YÜKSEKLİK onu
     aşıyor ve hedef alanı ikisinin çarpımıdır: 42×46, 44×44'ten geniştir. */
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mdCell: {
    width: operationsTheme.size.iconButtonOnPhoto,
    height: operationsTheme.size.controlSm,
  },
  /** Büyük boyda hücre 52×52 — sayfanın büyük rakamıyla aynı yükseklikte bir kare hedef. */
  lgCell: {
    width: operationsTheme.size.controlLg,
    height: operationsTheme.size.controlLg,
  },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
  },
  mdGlyph: {
    fontSize: operationsTheme.text['icon-sm'],
    lineHeight: operationsTheme.text['icon-sm'],
  },
  lgGlyph: {
    fontSize: operationsTheme.text.icon,
    lineHeight: operationsTheme.text.icon,
  },
  glyphMinus: { color: operationsTheme.colors.muted },
  glyphDisabled: { color: operationsTheme.colors['disabled-text'] },
  /* Rakamın HÜCRESİ — düz metin hâlinde de, düğme hâlinde de aynı kutu: hücrenin kendisi kadar
     yüksek, `md`de sayının sabit kolonu kadar, `lg`de kalan genişliğin tamamı kadar geniş. İki hâl
     aynı kutuyu paylaşmasaydı, `onPressValue` eklemek rakamı bir piksel kaydırırdı. */
  valueHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Orta hedef ± düğmelerinden GENİŞ (kullanıcı bulgusu 03.09): rakam bir tuş değil, çekmeceyi
     açan alandır. Genişlik hücrede DE duruyor — metnin kendi kolonu (`mdValue`) dokunma alanını
     büyütmez, `PressableSurface` içeriğine göre daralır. */
  mdValueHit: { width: operationsTheme.size.stepValue, height: operationsTheme.size.controlSm },
  /* İç yüzey dış kabuğu ENİNE doldurur (`alignSelf`), esnemeyi dış kabuk yapar (`grow`). İçe
     `flex: 1` yazılmaz: sütun ekseninde yükseklik hesabını çökertiyor (`pressable-surface`). */
  lgValueHit: { alignSelf: 'stretch', height: operationsTheme.size.controlLg },
  /** Düz metin hâlinde kabuk yok, hücre satırın DOĞRUDAN çocuğu: esnemeyi kendisi yapar. */
  lgPlainValue: { flexGrow: 1 },
  value: {
    textAlign: 'center',
  },
  mdValue: {
    // Sayının kendi kolonu SABİT: 1 ile 10 arasında geçerken düğmeler yer değiştirmemeli.
    width: operationsTheme.size.stepValue,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
  },
  /** Tasarımın Lora'lı büyük rakamı (sayım ekranı v3:08): sayfanın en büyük sayısı, konusu o. */
  lgValue: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text.h2,
    lineHeight: operationsTheme.text.h2,
  },
  emptyValue: { color: operationsTheme.colors.muted },
  neutralBorder: { borderColor: operationsTheme.colors['sand-300'] },
  positiveBorder: { borderColor: operationsTheme.colors['olive-line'] },
  errorBorder: { borderColor: operationsTheme.colors['error-line'] },
  neutralValue: { color: operationsTheme.colors.ink },
  positiveValue: { color: operationsTheme.colors['olive-dark'] },
  errorValue: { color: operationsTheme.colors.error },
  neutralPlus: { color: operationsTheme.colors.olive },
  positivePlus: { color: operationsTheme.colors.olive },
  errorPlus: { color: operationsTheme.colors.error },
});
