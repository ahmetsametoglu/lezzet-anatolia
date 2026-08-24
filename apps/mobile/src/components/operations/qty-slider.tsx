import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStepperButton } from '@/components/operations/stepper-button';
import { operationsTheme } from '@/theme/unistyles';

/*
  ELASTİK ADET SEÇİCİ — okutma çekmecesinin adet sorusu (kullanıcı tasarımı 23.08).

  ── NEDEN SLIDER, NEDEN ELASTİK ─────────────────────────────────────────────
  Okutma bir SAYIM değil TANITIMDIR: depocu her koliyi ayrı okutmaz, bir kez okutur ve "kaç geldi"yi
  burada söyler. Adetin doğal bir tavanı yok (10 koli da gelir, 40 da) — sabit uçlu bir ray ya kısa
  kalır ya da hassasiyeti öldürür. Kullanıcının kendi deseni: ray makul bir pencereyle açılır,
  kullanıcı UCA YAKLAŞTIKÇA pencere büyür. Buradaki mekanik `route-hours.tsx`ün kaba/ince adım
  fikrinin adet karşılığıdır: sürükleme KABA adımla (okutulan birimin çarpanı) atlar, ± düğmeleri
  1'er oynatır.

  ── ZEMİN PARMAĞIN ALTINDA KAYMAZ ───────────────────────────────────────────
  Sürükleme sırasında ölçek SABİTTİR: 40'ı tutup bırakmak hiçbir yeniden ölçekleme tetiklemez.
  Eksen yalnız iki anda değişir: (1) topuz SAĞ UCA dayalı TUTULURKEN değer akar ve pencere onunla
  kayar (harita kenarında kaydırma deseni; tuttukça hızlanır — `growthFactor`), (2) bırakınca
  pencere değerin etrafına oturur (`axisWindow`). Büyüme bilinçli bir jesttir, sürüklemenin yan
  etkisi değil.

  ── ÇAPA SAYIDIR, RAY DEĞİL ─────────────────────────────────────────────────
  Değer üstte büyük puntoyla yazar; ray elin aracı, gözün referansı o sayı. Eksen yeniden
  ölçeklense de okunan şey şaşmaz. Açıklama satırı (`caption` — "10 koli + 3 adet") EKRANDAN
  gelir: komponent metin gömmez (kit disiplini, `choice-chip` künyesi).

  ── BEKLENEN BİR TAVAN DEĞİL, BİR İŞARETTİR ─────────────────────────────────
  PO'lu kabulde eksen beklenen adetle açılır ve beklenenin yerinde bir çentik durur; ama değer
  beklenende KİLİTLENMEZ — fazla mal gelir ve fark raporu tam da bunu görmek ister. Kenar jesti
  beklenenin ötesine büyütür.
*/

/** Kenarda tutma turunun süresi — her turda bir kaba adım (hızlanarak) eklenir. */
const HOLD_TICK_MS = 260;

/** Sürükleme kaba adımı ele: ham değeri adımın katına yuvarlar. */
export function snapToStep(raw: number, step: number): number {
  return Math.round(raw / step) * step;
}

/**
 * Eksenin oturduğu pencere.
 *
 * **Beklenen adet varsa eksenin tabanı ODUR** (en az iki kaba adım, yoksa ray tek duraklı kalır);
 * beklenen yoksa 10 kaba adım. Cihazda ölçüldü (24.08): taban her hâlde `step*10` alınınca 24'lük
 * koli için ray 240'a kadar uzuyordu, oysa beklenen 54'tü — hassasiyetin dörtte üçü kullanılmayan
 * bir bölgeye gidiyordu. Beklenen bir TAVAN değil, eksenin makul açılışıdır: fazlası kenar
 * jestiyle gelir.
 *
 * Değer tabanı aşıyorsa pencere değerin %25 üstüne oturur: topuz uçtan içeri döner, bir sonraki
 * sürüklemede oynayacak yer kalır.
 */
export function axisWindow(value: number, step: number, expected: number | null): number {
  const floor = expected !== null && expected > 0 ? Math.max(expected, step * 2) : Math.max(step * 10, 10);
  const target = value <= floor ? floor : value * 1.25;
  return Math.ceil(target / step) * step;
}

/** Kenarda tutma ivmesi: ilk turlar 1'er kaba adım, sonra 2'şer, 4'er, 8'er — uzun basış hızlanır. */
export function growthFactor(tick: number): number {
  if (tick < 4) return 1;
  if (tick < 8) return 2;
  if (tick < 12) return 4;
  return 8;
}

interface OperationsQtySliderProps {
  value: number;
  onChange: (next: number) => void;
  /** Kaba adım — okutulan birimin çarpanı (koli 12, tekil 1). Sürükleme bu adımla atlar. */
  step: number;
  /** Beklenen adet (PO satırı) — eksenin açılış tavanı + ray üstündeki çentik; plansızda null. */
  expected?: number | null;
  /** Rayın ekran okuyucu adı ("Gelen adet"). */
  accessibilityLabel: string;
  /** ± ince ayar düğmelerinin ekran okuyucu adları — metin ekrandan gelir. */
  fineLabels: { increase: string; decrease: string };
  /** Değerin altındaki açıklama satırı ("10 koli + 3 adet") — ekran kurar. */
  caption?: string;
  testID?: string;
}

export function OperationsQtySlider({
  value,
  onChange,
  step,
  expected = null,
  accessibilityLabel,
  fineLabels,
  caption,
  testID,
}: OperationsQtySliderProps) {
  const [axisMax, setAxisMax] = useState(() => axisWindow(value, step, expected));
  const [trackWidth, setTrackWidth] = useState(0);

  /* Jest ve kenar-tutma zamanlayıcısı render dışından okur; ref'ler her turda tazelenir. */
  const valueRef = useRef(value);
  const axisRef = useRef(axisMax);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTicks = useRef(0);
  useEffect(() => {
    valueRef.current = value;
    axisRef.current = axisMax;
  });

  const stopHold = useCallback(() => {
    if (holdTimer.current !== null) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    holdTicks.current = 0;
  }, []);

  /* Zamanlayıcı bileşenle birlikte ölmeli: çekmece kapanırken süren bir büyüme turu, sökülmüş
     bir bileşenin state'ine yazmaya çalışırdı. */
  useEffect(() => stopHold, [stopHold]);

  const startHold = useCallback(() => {
    if (holdTimer.current !== null) return;
    holdTimer.current = setInterval(() => {
      holdTicks.current += 1;
      const next = valueRef.current + step * growthFactor(holdTicks.current);
      // Topuz uçta KALIR: eksen değerle birlikte büyür — büyüme jesti sürdükçe pencere kayar.
      setAxisMax(next);
      onChange(next);
    }, HOLD_TICK_MS);
  }, [onChange, step]);

  const thumb = operationsTheme.size.dotButton;
  const usable = Math.max(1, trackWidth - thumb);

  const moveTo = useCallback(
    (x: number) => {
      if (trackWidth <= 0) return;
      const ratio = Math.min(1, Math.max(0, (x - thumb / 2) / usable));
      if (ratio >= 1) {
        // Uca dayandı: önce eksenin ucuna oturt, tutmaya devam ederse büyüme turu başlasın.
        if (valueRef.current !== axisRef.current) onChange(axisRef.current);
        startHold();
        return;
      }
      stopHold();
      const snapped = Math.min(axisRef.current, Math.max(0, snapToStep(ratio * axisRef.current, step)));
      if (snapped !== valueRef.current) onChange(snapped);
    },
    [onChange, startHold, step, stopHold, thumb, trackWidth, usable],
  );

  /* Bırakınca pencere değerin etrafına oturur — bir sonraki sürüklemenin hassasiyeti geri gelir. */
  const settle = useCallback(() => {
    stopHold();
    setAxisMax(axisWindow(valueRef.current, step, expected));
  }, [expected, step, stopHold]);

  /* `runOnJS`: seçim ayrık adımlarla ilerliyor, her olayda UI thread hassasiyeti gerekmez —
     karşılığında state ve zamanlayıcı doğrudan JS'te yaşar (worklet köprüsü yok). */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => moveTo(event.x))
        .onChange((event) => moveTo(event.x))
        .onFinalize(() => settle()),
    [moveTo, settle],
  );

  const fine = useCallback(
    (delta: number) => {
      const next = Math.max(0, value + delta);
      if (next === value) return;
      if (next > axisMax) setAxisMax(axisWindow(next, step, expected));
      onChange(next);
    },
    [axisMax, expected, onChange, step, value],
  );

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const thumbLeft = (Math.min(value, axisMax) / axisMax) * usable;
  const expectedLeft = expected !== null && expected <= axisMax ? thumb / 2 + (expected / axisMax) * usable : null;

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.readout}>
        <Text style={styles.value} testID={testID === undefined ? undefined : `${testID}-value`}>
          {value}
        </Text>
        {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
      </View>
      <View style={styles.row}>
        <OperationsStepperButton
          direction="decrease"
          size="sm"
          onPress={() => fine(-1)}
          accessibilityLabel={fineLabels.decrease}
          disabled={value <= 0}
          testID={testID === undefined ? undefined : `${testID}-decrease`}
        />
        <GestureDetector gesture={pan}>
          <View
            style={styles.trackZone}
            onLayout={onTrackLayout}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ min: 0, max: axisMax, now: value }}
            // Ekran okuyucu KABA adımla gezer; 1'er ayar ± düğmelerinin kendi hedefleri.
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') fine(step);
              if (event.nativeEvent.actionName === 'decrement') fine(-Math.min(step, value));
            }}
            testID={testID === undefined ? undefined : `${testID}-track`}
          >
            <View style={styles.track} />
            <View style={[styles.fill, { width: thumb / 2 + thumbLeft }]} />
            {expectedLeft === null ? null : <View style={[styles.expectedTick, { left: expectedLeft }]} />}
            <View style={[styles.thumb, { left: thumbLeft }]} />
          </View>
        </GestureDetector>
        <OperationsStepperButton
          direction="increase"
          size="sm"
          onPress={() => fine(1)}
          accessibilityLabel={fineLabels.increase}
          testID={testID === undefined ? undefined : `${testID}-increase`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: operationsTheme.space.lg,
  },
  readout: {
    alignItems: 'center',
    gap: operationsTheme.space['2xs'],
  },
  value: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  caption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  /** Rayın dokunma bölgesi — çizgiden büyük: parmak 4 px'lik bir hatta isabet ettiremez. */
  trackZone: {
    flex: 1,
    height: operationsTheme.size.touchTarget,
    justifyContent: 'center',
  },
  track: {
    height: operationsTheme.space.xs,
    borderRadius: operationsTheme.space.xs / 2,
    backgroundColor: operationsTheme.colors['sand-400'],
  },
  /** Dolu bölüm — 0'dan topuza; seçimin "ne kadarı" bir bakışta. */
  fill: {
    position: 'absolute',
    left: 0,
    height: operationsTheme.space.xs,
    borderRadius: operationsTheme.space.xs / 2,
    backgroundColor: operationsTheme.colors.ink,
  },
  /** Beklenen adedin çentiği — raydan taşan ince dikey çizgi; tavan değil, işaret. */
  expectedTick: {
    position: 'absolute',
    width: operationsTheme.space['2xs'],
    height: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.space['2xs'] / 2,
    backgroundColor: operationsTheme.colors.muted,
  },
  thumb: {
    position: 'absolute',
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.size.dotButton / 2,
    backgroundColor: operationsTheme.colors.ink,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.card,
  },
});
