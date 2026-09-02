import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import { OperationsStepperGroup } from './stepper-group';

/*
  ADET SOLDA, SEBEP SAĞDA — operasyonun "ne kadar ve niçin" satırı (kullanıcı kararı 02.09).

  ── NEREDEN GELDİ ───────────────────────────────────────────────────────────
  Kalıbı mal kabulün HASAR kartı doğurdu (30.08, kullanıcı kararı): şablon dört sebep çipini karta
  seriyordu; kullanıcı sayacın sağındaki boş alanı bir düğmeye verdi ve listeyi aşağıdan açılan
  çekmeceye aldı. Kart kısaldı, seçim tek cümleye indi. Kullanıcı 02.09'da aynı kalıbın başka
  yerlerde de işe yarayacağını söyledi ve haklıydı — kalıp `intake-screen.tsx` içinde 2200 satırın
  arasına gömülüydü, yani ikinci kullanıcı onu ancak kopyalayarak alabilirdi (CLAUDE §1).

  ── SORU HEP AYNI: "TOPLAMIN İÇİNDEN NE KADARI, VE NİÇİN" ───────────────────
  · **D2 · Mal kabul** — kabul edilen 12 paketin kaçı hasarlı, sebebi ne (kırık koli · ıslanmış…).
  · **D4b · Stok düşümü** — partideki 6 adetten kaçı düşüyor, sebebi ne (hasar · kayıp).
  İkisi de bir TAVANIN içinden işaretliyor; ikisinde de adet tek başına anlamsız, sebep tek başına
  eksik. Bu yüzden ikisi TEK satırda ve tek bileşende duruyor.

  ── ÇİP Mİ, ÇEKMECE Mİ (ayrım bilinçli) ─────────────────────────────────────
  Uygulamada iki "sebep seçme" dili var ve ikisi de kalıyor, çünkü iki ayrı yerde duruyorlar:
  · **Çip** — sebep kendi UYARI bloğunun içindeyse ve liste kısaysa (D4 sayımın "FARK VAR — SEBEP
    GEREKLİ" kutusu). Orada seçim bloğun konusu; gizlemek bir dokunuş eklerdi.
  · **Alan + çekmece** — BURASI: sebep bir sayacın yanında, satırın ikinci sütunu. Çipler o satıra
    sığmaz, sığdırılırsa sayacı ezer.

  ── TAVAN SAYAÇTA ───────────────────────────────────────────────────────────
  `max` kitin sayacına gider ve artı orada söner. "12 paketin 15'i hasarlı" bir sayım değil, bir
  çelişkidir; kapının reddedeceği bir işi hiç yaptırmamak ekranın görevi.

  ── SAYAÇ KİTİN TEK ADET DESENİDİR ──────────────────────────────────────────
  Soldaki sayaç `OperationsStepperGroup`un kendisi (kullanıcı kararı 02.09: her yerde aynı
  `− 3 +`), ortadaki rakam `onPressQty` ile ADET ÇEKMECESİNİ açar — çekmece çağıranda durur.
*/

interface OperationsQtyReasonRowProps {
  qty: number;
  onQtyChange: (qty: number) => void;
  /** Sayacın ekran-okuyucu adı ("hasarlı 2") — ZORUNLU, rakam ad yerine geçmez. */
  qtyLabel: string;
  min?: number;
  /** Tavan; verilmezse sınırsız. Sayaç buna dayanınca artı söner. */
  max?: number;
  tone?: 'neutral' | 'positive' | 'error';
  /**
   * Sayacın ORTASINDAKİ rakama basılınca — çağıran ADET ÇEKMECESİNİ açar (kullanıcı kararı
   * 02.09, kitin tek adet deseni). Çekmece BURADA değil çağıranda durur: kit i18n bilmez ve bu
   * satır zaten bir çekmece (sebep) taşıyor — ikincisini de taşısaydı, sözlerinin tamamını prop
   * olarak alması gerekirdi.
   */
  onPressQty?: () => void;
  /** Rakama basınca ne olacağının ekran-okuyucu ipucu ("adet çekmecesini açar"). */
  qtyHint?: string;
  /** Seçili sebep; `null` = henüz seçilmedi ve alan yer tutucusunu gösterir. */
  reason: string | null;
  reasons: readonly string[];
  /** `null` = seçim KALDIRILDI (aynı sebebe ikinci dokunuş). */
  onReasonChange: (reason: string | null) => void;
  /** Boş alanın metni ("sebep seç"). */
  reasonPlaceholder: string;
  sheetTitle: string;
  sheetHint?: string;
  testID: string;
}

export function OperationsQtyReasonRow({
  qty,
  onQtyChange,
  qtyLabel,
  min = 0,
  max,
  tone = 'error',
  onPressQty,
  qtyHint,
  reason,
  reasons,
  onReasonChange,
  reasonPlaceholder,
  sheetTitle,
  sheetHint,
  testID,
}: OperationsQtyReasonRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.row} testID={testID}>
      {/* Tavan SAYAÇTA (kit): artı orada söner. Sınırın kendisi çağıranın gerçeğinden geliyor
          (kabul edilen adet, partideki mal); kit yalnız duvarı çizer. */}
      <OperationsStepperGroup
        value={qty}
        min={min}
        max={max}
        label={qtyLabel}
        tone={tone}
        onChange={onQtyChange}
        onPressValue={onPressQty}
        valueHint={qtyHint}
        testID={`${testID}-qty`}
      />

      <PressableSurface
        onPress={() => setOpen(true)}
        feedback="scale"
        grow
        selected={reason !== null}
        style={[styles.field, reason === null ? null : styles[`${tone}Field`]]}
        accessibilityLabel={reason ?? reasonPlaceholder}
        testID={`${testID}-reason`}
      >
        <Text style={reason === null ? styles.idleLabel : styles[`${tone}Label`]}>{reason ?? reasonPlaceholder}</Text>
      </PressableSurface>

      <BottomSheet visible={open} title={sheetTitle} onClose={() => setOpen(false)} testID={`${testID}-sheet`}>
        {sheetHint === undefined ? null : <Text style={styles.hint}>{sheetHint}</Text>}
        {reasons.map((option) => (
          <PressableSurface
            key={option}
            onPress={() => {
              /* Aynı sebebe ikinci dokunuş SEÇİMİ KALDIRIR: yanlış seçilen sebebin geri
                 alınabilmesi için ayrı bir "temizle" düğmesi koymaya gerek yok. */
              onReasonChange(reason === option ? null : option);
              setOpen(false);
            }}
            feedback="scale"
            selected={reason === option}
            style={[styles.option, reason === option ? styles[`${tone}Option`] : null]}
            accessibilityLabel={option}
            testID={`${testID}-option-${option}`}
          >
            <Text style={reason === option ? styles[`${tone}Label`] : styles.idleLabel}>{option}</Text>
          </PressableSurface>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Sayaç solda, sebep sağda — tasarımın iki sütunu; sebep kalan genişliği alır (`grow`). */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space['3xl'],
  },
  /* SEBEP ALANI boşken kum çerçeveli ve gri metinli bir DAVETTİR; dolduğunda satırın tonuna geçer
     — seçim yapıldığını renk söyler, ayrıca bir onay işareti gerekmez. */
  field: {
    height: operationsTheme.size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  neutralField: { borderColor: operationsTheme.colors['sand-500'] },
  positiveField: { borderColor: operationsTheme.colors['olive-line'] },
  errorField: { borderColor: operationsTheme.colors['error-line'] },
  idleLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  neutralLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  positiveLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors['olive-dark'],
  },
  errorLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.error,
  },
  /** Çekmecedeki sebep satırı — tam genişlik; seçili olan satırın tonuna geçer. */
  option: {
    height: operationsTheme.size.controlLg,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  neutralOption: { borderColor: operationsTheme.colors['sand-500'] },
  positiveOption: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  errorOption: {
    borderColor: operationsTheme.colors['error-line'],
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.body,
  },
});
