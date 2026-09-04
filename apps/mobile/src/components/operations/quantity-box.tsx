import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';

/*
  ADET KUTUSU — adet girilen satırın SAĞ ucu (v3:05 mal kabul satırı; kullanıcı kararı 04.09, 21.254).

  ── NİÇİN KİTTE ─────────────────────────────────────────────────────────────
  Mal kabul (D2) bu kutuyu kendi içinde iki parça olarak taşıyordu: dolu `qtyBox` ("30 · ADET") ve
  kesikli `countCta` ("30 · BEKLENEN" / "say →"). Transfer kabulü (D5) ise sağda −/+ sayaç
  çiziyordu ve kullanıcı ikisini yan yana görünce sordu: *"adet girilen satır depoda birçok yerde
  var, bu ötekinden farklı."* Aynı iş aynı kutuyla yapılır; kutu bu yüzden tek yerde durur, iki
  ekran çağırır. Ölçüler D2'nin ölçüldüğü değerler (74×52, `radius.control`, `step` rakam).

  ── İKİ HÂL, TEK KUTU ─────────────────────────────────────────────────────────
  · KESİKLİ (`dashed`): sayı henüz BEYAN EDİLMEDİ, bir davet — içinde ya beklenen/sevk edilen adet
    durur ("30 · BEKLENEN", dokunuş = "bu kadar geldi" beyanı) ya da rakamsız bir davet ("say →").
    Kesikli çerçeve `sand-500`: ölçülen #c4bda9 → Δ9/7/1, kesikli çizgide görülmez, yeni kum durağı
    açılmadı.
  · DOLU: beyan edilmiş adet, mürekkep çerçeve. Tonu çağıran söyler — beklentiden/sevk edilenden
    farklıysa kiremit (`diff`), henüz yoksa "—" soluk (`muted`).

  Rakamın ALTYAZISI ekran okuyucudan gizli: düğmenin adı (`accessibilityLabel`) zaten cümleyi
  söylüyor, altyazı görsel bir kademe. Cihaz klavyesi açılmaz — dokunuş çekmeceyi açar ya da
  beyanı yazar; hangisi olduğu çağıranın `onPress`i (v3'ün eldiven kararı: büyük tuşlar çekmecede).
*/

type QuantityBoxTone = 'ink' | 'muted' | 'diff';

/** İç metinlerin kimliği kutunun kimliğinden türer (`…-value` · `…-caption` · `…-label`) — testler rakamı oradan okur. */
function sub(testID: string | undefined, part: 'value' | 'caption' | 'label'): string | undefined {
  return testID === undefined ? undefined : `${testID}-${part}`;
}

interface OperationsQuantityBoxProps {
  /** Beyan edilmiş adet; `null` = henüz yok. */
  value: number | null;
  /**
   * Kesikli kutunun içindeki DAVET rakamı (beklenen / sevk edilen) — `value` yokken gösterilir.
   * Yoksa ve `label` da yoksa kutu "—" der.
   */
  placeholderValue?: number | null;
  /** Rakamın altındaki eyebrow: "ADET" · "BEKLENEN" · "SEVK EDİLEN". */
  caption?: string;
  /** Rakamsız davet ("say →") — yalnız kesikli hâlde, `placeholderValue` yokken. */
  label?: string;
  dashed?: boolean;
  tone?: QuantityBoxTone;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}

export function OperationsQuantityBox({
  value,
  placeholderValue = null,
  caption,
  label,
  dashed = false,
  tone = 'ink',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: OperationsQuantityBoxProps) {
  const shown = value ?? placeholderValue;
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.box, dashed ? styles.dashed : styles.solid]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {shown === null && label !== undefined ? (
        <Text style={styles.label} testID={sub(testID, 'label')}>
          {label}
        </Text>
      ) : (
        <>
          <Text style={[styles.value, styles[`value_${tone}`]]} testID={sub(testID, 'value')}>
            {shown === null ? '—' : String(shown)}
          </Text>
          {caption === undefined ? null : (
            /* Altyazı TEK SATIR: kutu sabit ende (sayılınca sağ kenar zıplamasın), uzun kelime
               ikinci satıra kırılıp çerçeveden taşıyordu (ölçüldü 04.09: "SEVK EDİLEN"). Çağıran
               kutuya sığan kelimeyi seçer — "ADET" · "BEKLENEN". */
            <Text
              style={styles.caption}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no"
              testID={sub(testID, 'caption')}
            >
              {caption}
            </Text>
          )}
        </>
      )}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  box: {
    width: operationsTheme.size.avatarLg + operationsTheme.space['2xl'],
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  /* `borderStyle` iki hâlde de AÇIKÇA yazılır (ölçüldü 04.09, Oppo): kesikliden doluya geçen kutu
     Android'de kesikli kalıyordu — yerli görünüm önceki çizgi biçimini koruyor, yalnız verilen
     özellikler ezer. */
  solid: { borderStyle: 'solid', borderColor: operationsTheme.colors.ink },
  dashed: { borderStyle: 'dashed', borderColor: operationsTheme.colors['sand-500'] },
  value: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.step,
    lineHeight: operationsTheme.text.step,
  },
  value_ink: { color: operationsTheme.colors.ink },
  value_muted: { color: operationsTheme.colors.muted },
  value_diff: { color: operationsTheme.colors.terracotta },
  caption: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text['badge-sm']),
    color: operationsTheme.colors['tab-inactive'],
  },
  label: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
});
