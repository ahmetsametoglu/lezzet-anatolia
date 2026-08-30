import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  TEK SEÇİMLİK ÇİP — Operasyon Mobil v2'nin iki yerde AYNI iskeletle çizdiği öğe:
  · tahsilat yöntemi segmenti (v2:179, `seg()`) — üç düğme, EŞİT genişlikte, seçili MÜREKKEP dolu
  · sonuç notu çipleri (v2:204) — içerik genişliğinde sarmalı ray, seçili KIRMIZI dolu
  Fark yalnız iki eksende: dolgunun tonu ve genişleme davranışı. İkisi de prop.

  MÜŞTERİ KİTİNDEKİ `Chip` KULLANILMADI ve bu bir kopya değil: o çipin seçili tonu ZEYTİNDİR
  (kategori rayının kararı), boşluğu `alignSelf:flex-start` ile sabittir, kenarlığı `hairline` ve
  boştaki çerçevesi MÜREKKEPtir. v2'nin segmenti bunların dördünü de başka söylüyor (mürekkep/kırmızı
  dolgu · `flex:1` · 1,5 px · kum çerçeve). `Chip`e dört prop eklemek, tek bir komponenti iki ayrı
  tasarım kararının ortak paydası hâline getirirdi — o noktadan sonra hangi yüzeyin ne göreceği
  çağıranın elinde olurdu, tasarımın değil.

  SEÇİLİLİK a11y'ye de gider (`selected`): renk farkı ekran okuyucuya ulaşmaz.

  Renkler `operationsTheme` sabitinden — gerekçe `theme/unistyles.ts` künyesinde.
*/

/** Dolgunun anlamı: `ink` nötr seçim (yöntem), `error` olumsuz sonuç (ulaşılamadı/red notu). */
type ChoiceTone = 'ink' | 'error';

interface OperationsChoiceChipProps {
  /** Çip metni — sözlükten gelir, komponent metin gömmez. */
  label: string;
  onPress: () => void;
  selected: boolean;
  tone?: ChoiceTone;
  /** Satırı eşit paylaşan segment mi (v2'nin `flex:1`i), yoksa içerik genişliğinde çip mi. */
  fill?: boolean;
  testID?: string;
}

export function OperationsChoiceChip({ label, onPress, selected, tone = 'ink', fill = false, testID }: OperationsChoiceChipProps) {
  return (
    <PressableSurface
      onPress={onPress}
      selected={selected}
      feedback="scale"
      compact
      // Segment eşitliği `grow` ile — stile `flex` yazmak dış Pressable'ı esnetmiyor ve iç
      // yükseklik hesabını çökertiyordu (23.08 ölçümü — `PressableSurface.grow` künyesi).
      grow={fill || undefined}
      style={[styles.base, fill ? undefined : styles.hug, selected ? styles[tone] : styles[`idle_${tone}`]]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.label, selected ? styles.selectedLabel : styles[`idleLabel_${tone}`]]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // v2: `padding:10px 0` (segment) / `8px 12px` (çip) — yatay dolgu `hug`dan gelir.
    paddingVertical: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
  },
  hug: { paddingHorizontal: operationsTheme.space.xl },
  ink: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  error: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  /* Boştaki çip ZEMİNSİZDİR (v2: `background:transparent`) — palete sahte bir "saydam" rengi
     eklemek yerine zemin hiç verilmiyor (katalog süzgeç düğmesinin aynı kararı).

     BOŞTAKİ ÇİP DE TONUNU TAŞIR (düzeltildi 30.08, kullanıcı bulgusu). Eskiden `idle` tek tondu:
     `tone="error"` yalnız SEÇİLİ hâli kırmızıya çeviriyordu, boştaki çip nötr kalıyordu. Tasarımın
     hasar bloğunda (v3:05) dört sebep çipi seçilmemişken de kırmızı çerçeve ve kırmızı metin
     taşıyor — çünkü çipin ailesi neyi sorduğunu söylüyor, seçili olup olmaması değil. */
  idle_ink: { borderColor: operationsTheme.colors['sand-500'] },
  idle_error: { borderColor: operationsTheme.colors['error-line'] },
  label: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    textAlign: 'center',
  },
  selectedLabel: { color: operationsTheme.colors.card },
  idleLabel_ink: { color: operationsTheme.colors.ink },
  idleLabel_error: { color: operationsTheme.colors.error },
});
