import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  BAĞLI SAYAÇ — `− 3 +` tek çerçevenin içinde (Operasyon Mobil v3, SEKİZ kullanım: adet
  çekmecesinin koli satırları ve "koli dışı tek paket" sayacı `00-ortak`ta dört, mal kabul ile
  plansız kabulün hasarlı paket sayacında ikişer).

  ── NİÇİN `OperationsStepperButton` DEĞİL ───────────────────────────────────
  O komponent AYRI DURAN bir ± düğmesidir: kendi çerçevesi, kendi karesi, aralarında boşluk. Bu ise
  TEK BİR KUTUDUR — çerçeve dışta, üç hücre içeride çerçevesiz, aralarında boşluk yok. İkisi aynı
  şeyin iki boyu değil, iki ayrı kalıp: v3'te ikisi de var ve yan yana duruyorlar. Ayrımın ölçüsü
  tasarımın kendi işaretlemesi — `stepper-button` v2'nin `34×34` dolgusuz düğmesi, bu v3'ün
  `42×46` hücreli grubu.

  ── ORTADAKİ SAYI: 02.09'DA DÜĞME OLABİLİR HÂLE GELDİ (kullanıcı kararı) ────
  Burada *"ortadaki sayı DOKUNULABİLİR DEĞİL ve bu bilinçli: yanlışlıkla açılan bir klavye, sayacın
  var olma sebebini (klavyesiz sayım) ortadan kaldırırdı"* yazıyordu. Kural kalktı çünkü DAYANDIĞI
  VARSAYIM yanlıştı: sayıya basmak klavye açmıyor, kitin kendi ADET ÇEKMECESİNİ açıyor — aynı
  sayacın büyük hâli (`OperationsScanQtySheet`). Klavyesiz sayım bozulmuyor, hızlanıyor.

  Kullanıcının gerekçesi rampanın kendisi: 12 adet koyacak kurye artı düğmesine on iki kez basıyor.
  Sayı zaten ekranın ortasında ve parmağın düştüğü yer.

  Dokunuş İSTEĞE BAĞLI (`onPressValue`) ve verilmezse sayı düz metin kalır — eski kural, onu
  isteyen çağıranlar için hâlâ geçerli. Hedef ± hücreleriyle AYNI yükseklikte (`controlSm`), yani
  eldivenli parmağın kaçırdığı dar bir şerit değil.

  ── TON BİR RENK DEĞİL, SAYININ ANLAMIDIR ───────────────────────────────────
  `neutral` sayılan mal, `positive` sıfırdan büyük koli (tasarım kutuyu zeytine çeviriyor),
  `error` hasarlı paket. Çağıran rengi değil ANLAMI seçer.
*/

/** Sayının anlamı — renk değil, DURUM. */
type StepperTone = 'neutral' | 'positive' | 'error';

interface OperationsStepperGroupProps {
  value: number;
  onChange: (next: number) => void;
  /** Ekran okuyucuya giden ad — ZORUNLU; "−"/"+" işaretleri ad yerine geçmez. */
  label: string;
  tone?: StepperTone;
  /** Taban; altına inilemez. Sayım negatif olamaz, varsayılan 0. */
  min?: number;
  /**
   * **ORTADAKİ RAKAMA BASILINCA** (kullanıcı kararı 02.09) — verilirse sayı da bir düğme olur.
   *
   * Gerekçe rampanın kendisi: 12 adet koyacak kurye artı düğmesine on iki kez basıyor. Sayı zaten
   * ekranın ortasında ve parmağın düştüğü yer; ona basmak "bu sayıyı değiştirmek istiyorum"
   * demenin en kısa yolu. Ne AÇILACAĞINI bilen taraf çağırandır (adet çekmecesi · klavye), o
   * yüzden burada yalnız dokunuş var.
   *
   * Verilmezse rakam düz metin kalır: yirmiye yakın çağıran var ve çoğunda basılacak bir şey yok —
   * her sayıyı düğmeye çevirmek, dokunulunca hiçbir şey yapmayan bir yüzey üretirdi.
   */
  onPressValue?: () => void;
  /**
   * Rakama basınca ne olacağını söyleyen ekran-okuyucu ipucu ("adet çekmecesini açar").
   *
   * Metin ÇAĞIRANDAN gelir, kitin içinde durmaz: kit i18n bilmez (kardeş bileşenlerin kuralı —
   * `scan-qty-sheet` de bütün cümlelerini prop olarak alıyor).
   */
  valueHint?: string;
  testID?: string;
}

export function OperationsStepperGroup({
  value,
  onChange,
  label,
  tone = 'neutral',
  min = 0,
  onPressValue,
  valueHint,
  testID,
}: OperationsStepperGroupProps) {
  /* Rakam iki hâlde de AYNI görünür: basılabilir olması bir çerçeve ya da renk değişikliği
     getirmiyor. Ayrım dokunuşta ortaya çıkıyor — sayaç zaten bir girdi yüzeyi, içindeki her hücre
     dokunulabilir görünüyor. */
  const deger = (
    <Text
      style={[styles.value, styles[`${tone}Value`]]}
      accessibilityLabel={`${label}: ${value}`}
      testID={testID === undefined ? undefined : `${testID}-value`}
    >
      {value}
    </Text>
  );
  return (
    <View style={[styles.group, styles[`${tone}Border`]]}>
      <PressableSurface
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        feedback="scale-small"
        compact
        style={styles.cell}
        accessibilityLabel={`${label} — azalt`}
        testID={testID === undefined ? undefined : `${testID}-decrease`}
      >
        {/* Eksi İŞARETİ (U+2212), tire değil: rakamla aynı genişlikte durur. */}
        <Text style={[styles.glyph, value <= min ? styles.glyphDisabled : styles.glyphMinus]}>−</Text>
      </PressableSurface>
      {onPressValue === undefined ? (
        deger
      ) : (
        <PressableSurface
          onPress={onPressValue}
          feedback="scale-small"
          compact
          style={styles.valueHit}
          accessibilityLabel={`${label}: ${value}`}
          accessibilityHint={valueHint}
          testID={testID === undefined ? undefined : `${testID}-value-hit`}
        >
          {deger}
        </PressableSurface>
      )}
      <PressableSurface
        onPress={() => onChange(value + 1)}
        feedback="scale-small"
        compact
        style={styles.cell}
        accessibilityLabel={`${label} — artır`}
        testID={testID === undefined ? undefined : `${testID}-increase`}
      >
        <Text style={[styles.glyph, styles[`${tone}Plus`]]}>+</Text>
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
  /* Hücre 42×46 — tasarımın ölçüsü. Genişlik dokunma hedefinin altında (44) ama YÜKSEKLİK onu
     aşıyor ve hedef alanı ikisinin çarpımıdır: 42×46, 44×44'ten geniştir. */
  cell: {
    width: operationsTheme.size.iconButtonOnPhoto,
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    lineHeight: operationsTheme.text['icon-sm'],
  },
  glyphMinus: { color: operationsTheme.colors.muted },
  glyphDisabled: { color: operationsTheme.colors['disabled-text'] },
  /* Rakamın DOKUNMA hücresi: hücrenin kendisi kadar yüksek, sayının kolonu kadar geniş — yani
     hedef, artı/eksi hücreleriyle aynı YÜKSEKLİKTE (`controlSm`). Genişliği rakamın kendi sabit
     kolonundan geliyor (aşağıda) — ikisi ayrı yazılsaydı bir gün ayrışırlardı. */
  valueHit: {
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    // Sayının kendi kolonu SABİT: 1 ile 10 arasında geçerken düğmeler yer değiştirmemeli.
    width: operationsTheme.size.stepButton,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
  },
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
