import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View, type LayoutChangeEvent } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Svg, { Path } from 'react-native-svg';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { captureSignaturePng, type SignatureCanvas } from './signature-capture';

/*
  İMZA PANELİ (v2:125-137) — uygulama İÇİNDE çizim, kütüphanesiz.

  ── NEDEN ELDE ÇİZİM ────────────────────────────────────────────────────────
  Hazır bir imza bileşeni (`react-native-signature-canvas` ve akrabaları) bir WebView taşır:
  yeni bir yerel bağımlılık, dev-client'ın yeniden derlenmesi ve kapıda bir tarayıcı örneği.
  Gereken şey ise bir parmağın izini yakalamak — `PanResponder` (RN çekirdeği) + `react-native-svg`
  (ZATEN kurulu, ikonlar onu kullanıyor) bunu birlikte veriyor. Yeni paket YOK.

  ── GEOMETRİ: KIRIK ÇİZGİ, EĞRİ DEĞİL ───────────────────────────────────────
  Her dokunuş bir `M x y L x y …` yolu üretir. Bézier yumuşatma bilerek yapılmadı: parmağın ürettiği
  nokta yoğunluğunda (60 Hz) kırık çizgi zaten pürüzsüz görünür, yumuşatma ise imzanın ŞEKLİNİ
  değiştirir — kanıt olarak saklanan bir çizimde "bizim yorumumuz" olmamalı.

  ── TUVAL ÖLÇÜLDÜKTEN SONRA ÇİZİLİR ─────────────────────────────────────────
  `viewBox` tuvalin GERÇEK ölçüsüyle birebir olmalı; aksi hâlde `toDataURL` çıktısı kaydırılmış ya
  da kırpılmış olurdu. Ölçü `onLayout`tan gelir, o gelene kadar yalnız ipucu metni durur.

  ── ONAYLA = YAKALA + ÇAĞIRANA VER ──────────────────────────────────────────
  Panel yüklemeyi KENDİ yapmaz: kanıtın nereye gideceği (izin ucu, kova, sipariş) teslimat akışının
  bilgisidir. Panel yalnız base64 PNG üretir; yakalanamazsa çağırana `null` gitmez, panel kendi
  hatasını gösterir — yarım bir kanıtla akışa devam edilmez.
*/

const t = courierCopy;

interface SignaturePadProps {
  /** İpucu satırındaki ad — "buraya imzalayın — Hakan B." (v2:129). */
  hintName: string;
  /** Yakalanan base64 PNG (veri öneki YOK) — çağıran yüklemeyi üstlenir. */
  onConfirm: (pngBase64: string) => void;
  onCancel: () => void;
  /** Çağıranın yükleme göstergesi; açıkken onay tekrar basılamaz. */
  busy: boolean;
  /** Çağıranın (yükleme) hatası — panelin kendi yakalama hatasıyla aynı yerde görünür. */
  error: string | null;
  testID?: string;
}

export function SignaturePad({ hintName, onConfirm, onCancel, busy, error, testID }: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas | null>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  /** Süren çizgi — her karede durum yazmak yerine `ref`te birikir, bırakınca listeye geçer. */
  const current = useRef<string>('');

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          current.current = `M${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          setStrokes((list) => [...list, current.current]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          current.current = `${current.current} L${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          const drawn = current.current;
          setStrokes((list) => [...list.slice(0, -1), drawn]);
        },
      }),
    [],
  );

  const empty = strokes.length === 0;

  const confirm = useCallback(() => {
    if (empty || busy) return;
    setCaptureError(null);
    void captureSignaturePng(canvasRef.current).then((png) => {
      if (png === null) {
        setCaptureError(t.delivery.proof.uploadFailed);
        return;
      }
      onConfirm(png);
    });
  }, [busy, empty, onConfirm]);

  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.panel} testID={testID}>
      <View style={styles.canvas} onLayout={measure} {...responder.panHandlers} testID={`${testID ?? 'signature'}-canvas`}>
        {size === null ? null : (
          <Svg
            ref={(node) => {
              canvasRef.current = node as SignatureCanvas | null;
            }}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
          >
            {strokes.map((stroke, index) => (
              <Path
                key={`stroke-${index}`}
                d={stroke}
                stroke={operationsTheme.colors.ink}
                strokeWidth={operationsTheme.border.spinnerSm}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        )}
        {empty ? (
          <Text style={styles.hint} pointerEvents="none">
            {t.delivery.proof.canvasHint.replace('{name}', hintName)}
          </Text>
        ) : null}
      </View>

      {captureError ?? error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {captureError ?? error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <PressableSurface
          onPress={() => {
            setStrokes([]);
            setCaptureError(null);
          }}
          feedback="scale"
          style={[styles.action, styles.actionOutline]}
          accessibilityLabel={t.delivery.proof.clear}
          testID="courier-signature-clear"
        >
          <Text style={[styles.actionLabel, styles.clearLabel]}>{t.delivery.proof.clear}</Text>
        </PressableSurface>
        <PressableSurface
          onPress={confirm}
          disabled={empty || busy}
          feedback="scale"
          style={[styles.action, empty || busy ? styles.actionDisabled : styles.actionFilled]}
          accessibilityLabel={busy ? t.delivery.proof.uploading : t.delivery.proof.confirm}
          testID="courier-signature-confirm"
        >
          <Text style={[styles.actionLabel, styles.filledLabel]}>
            {busy ? t.delivery.proof.uploading : t.delivery.proof.confirm}
          </Text>
        </PressableSurface>
        <PressableSurface
          onPress={onCancel}
          feedback="scale"
          style={[styles.action, styles.actionOutline]}
          accessibilityLabel={t.delivery.proof.cancel}
          testID="courier-signature-cancel"
        >
          <Text style={[styles.actionLabel, styles.cancelLabel]}>{t.delivery.proof.cancel}</Text>
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: operationsTheme.space.md,
    padding: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  canvas: {
    height: operationsTheme.size.controlMultiline,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  error: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
  },
  actionOutline: {
    borderColor: operationsTheme.colors['sand-500'],
  },
  actionFilled: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  /** v2:899 — çizim yokken onay `disabled-fill`; gölgesiz/soluk yüzey "basılamaz" der. */
  actionDisabled: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
    borderColor: operationsTheme.colors['disabled-fill'],
  },
  actionLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
  },
  clearLabel: { color: operationsTheme.colors.muted },
  filledLabel: { color: operationsTheme.colors.card },
  cancelLabel: { color: operationsTheme.colors.ink },
});
