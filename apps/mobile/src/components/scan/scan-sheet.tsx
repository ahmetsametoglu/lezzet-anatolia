import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
// YALNIZ TİP: değer importu değil — native modülün kendisi tembel yüklenir (aşağıdaki künye).
import type * as ExpoCamera from 'expo-camera';
import { hasCameraNativeModule } from './camera-availability';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { hapticCommit } from '@/lib/haptics/haptics';
import { operationsTheme } from '@/theme/unistyles';
import { DEV_SCAN_POOL } from './dev-scan-pool';

/*
  TARAMA SAYFASI — tek `onScan` sözleşmesi (Modül 23 · etüt 2.3).

  ── EKRAN KAYNAĞI BİLMEZ ────────────────────────────────────────────────────
  Bileşen HAM kodu verir, başka hiçbir şey yapmaz: çözüm (`/warehouse/codes/resolve`), öğrenme ve
  "bu satıra ne yazılır" kararı ÇAĞIRANIN işi. Mal kabul, toplama, transfer ve tezgâh aynı bileşeni
  kullanır; dördü kendi kamera kodunu yazsaydı izin akışı ve tekrar-okuma kilidi dört kez, dört
  farklı biçimde yazılırdı.

  ── İKİ KAYNAK, TEK YOL (kullanıcı kararı 22.08) ────────────────────────────
  Üretimde kod KAMERADAN gelir; geliştirmede ayrıca bir SİMÜLASYON havuzu çizilir (çipe bas → kod
  gelir). İkisi aynı teslim noktasından geçer (`deliver`: kilit + `onScan`) — fark yalnız kodun
  kaynağıdır, akışın geri kalanı bayt bayt aynıdır. Havuz `__DEV__` arkasında: release derlemesinde
  dal ölü koddur, bundler atar; "üretimde açık kalan simülasyon" sınıfı derleme sabitiyle kapanır.

  ── KAMERA MODÜLÜ TEMBEL YÜKLENİR, VE BU BİR ZORUNLULUK ─────────────────────
  `expo-camera` YENİ bir native modül: eski dev-client'ta (yeniden derlenene kadar) ve simülatörde
  native tarafı YOK — üst-düzey import, modül değerlendirilirken fırlar ve ScanSheet'i içeren HER
  ekranı çökertirdi. `require` try/catch içinde: modül yoksa kamera alanı yerine açıklama çizilir,
  geliştirmede simülasyon havuzu akışı taşımaya devam eder. Yeni derlemede aynı kod kamerayı bulur —
  iki dünya arasında kod farkı yoktur.

  ── TEKRAR-OKUMA KİLİDİ ─────────────────────────────────────────────────────
  Kamera aynı barkodu saniyede onlarca kez bildirir; kilitsiz bir `onScan` tek koliyi on kez
  saydırırdı. Kilit OKUMA BAŞINA: kod teslim edilir edilmez kapanır, sayfa yeniden açılınca
  sıfırlanır. "Aynı kod bir daha okutulamaz" DEĞİL — iki koli aynı kodu taşıyabilir. Simülasyon
  çipi de aynı kilitten geçer: arka arkaya iki çip, kameradaki çift okuma gibi, tek okuma sayılır.

  ── İZİN AKIŞI ──────────────────────────────────────────────────────────────
  İzin sayfa açılır açılmaz KENDİLİĞİNDEN sorulur — rampada önce boş ekran gösterip bir de düğmeye
  bastırmak fazladan bir adımdır. Ret kalıcıysa (`canAskAgain=false`) tekrar-sor düğmesi ÇİZİLMEZ:
  basılınca hiçbir şey olmayan düğme arızalı düğmedir; cihaz ayarına gidiş cümleyle söylenir.

  ── KOPYA BİLEŞENDE (messages.json'da değil) ────────────────────────────────
  İzin cümleleri bağlamdan bağımsızdır ve her çağıranda aynıdır; bölüm sözlüklerine kopyalansaydı
  dört nüsha doğardı. Bağlama ait olan tek metin başlık + yönerge ve İKİSİ DE çağırandan gelir.
*/

const MESSAGES = {
  permissionTitle: 'Kamera izni gerekiyor',
  permissionBody: 'Kod okutmak için kamera kullanılır; görüntü kaydedilmez.',
  permissionCta: 'İzin ver',
  permissionDenied: 'Kamera izni kapalı. Cihaz ayarlarından Lezzet Anatolia için kamerayı açın.',
  missingDev: 'Kamera bu derlemede yok — dev-client yeniden derlenince açılır. Alttaki simülasyon havuzu aynı akışı koşturur.',
  missingProd: 'Kamera modülü yüklenemedi — uygulamayı güncelleyin.',
  devPool: 'SİMÜLASYON · havuzdan okut (yalnız geliştirme)',
  close: 'Vazgeç',
} as const;

type CameraModule = typeof ExpoCamera;

/**
 * Tembel yükleme künyesi yukarıda — modül yoksa `null`, ve bu bir HÂL, hata değil.
 *
 * ── ÖNCE YOKLA, SONRA YÜKLE (cihazda ölçüldü 22.08) ─────────────────────────
 * Çıplak `require('expo-camera')` try/catch İÇİNDE bile yetmiyor: native modül yokken paket
 * değerlendirilirken fırlıyor ve Metro modül fabrikası hatalarını yakalansa DA redbox'a çeviriyor
 * (guarded require) — eski dev-client'ta sayfa tam ekran hatayla kapanıyordu. `requireOptionalNativeModule`
 * bunun için var: fırlatmaz, native taraf yoksa `null` döner; JS paketini ancak native mevcutsa
 * yükleriz. Yoklamanın kendisi ayrı dosyada (`camera-availability`) — jest dikişi, künyesi orada.
 */
function loadCameraModule(): CameraModule | null {
  if (!hasCameraNativeModule()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-camera') as CameraModule;
  } catch {
    return null;
  }
}

interface ScanSheetProps {
  open: boolean;
  /** Başlık çağırandan: "Koli okut" · "Kalemi kutuya okut" — bileşen bağlamı bilmez. */
  title: string;
  /** Vizörün altındaki kısa yönerge; verilmezse satır çizilmez. */
  hint?: string;
  onClose: () => void;
  /**
   * Pencere EKRANDAN TAMAMEN KALKTIĞINDA (iOS) — `Modal.onDismiss`.
   *
   * Okutmadan sonra ikinci bir `Modal` açan çağıranlar için var: iOS bir modal'ın kapanış
   * animasyonu sürerken ikincisini SUNMAZ; ikincisi monte olur, örtüsü çizilir ama panelin
   * yerleşimi hiç ölçülmez ve açılış animasyonu tetiklenmez (ölçüldü 30.08 — mal kabulde koli
   * okutulunca adet çekmecesi ekranın altında asılı kalıyordu). Android'de bu sınırlama yok ve
   * `onDismiss` de çağrılmaz; çağıran orada beklemeden açar.
   */
  onDismiss?: () => void;
  /** Ham kod — çözüm ve karar çağıranın. Teslimden sonra kilit kapanır (künye). */
  onScan: (code: string) => void;
  /**
   * ÇAĞIRANIN simülasyon çipleri (23.8) — verilirse varsayılan havuzun YERİNE geçer. Ürün
   * barkodları statik bir formülle taklit edilebiliyor (`dev-scan-pool`) ama kutu QR'ları
   * ÜRETİLMİŞ kayıtlardır: yükleme/teslim ekranı ancak elindeki gerçek kodları çip yapabilir.
   * Yalnız `__DEV__`de okunur — release'te bu dal zaten yok.
   */
  devCodes?: ReadonlyArray<{ label: string; code: string }>;
  testID?: string;
}

export function ScanSheet({ open, title, hint, onClose, onDismiss, onScan, devCodes, testID }: ScanSheetProps) {
  // Modül ömür boyu ya hep var ya hep yok — memo bir kez yüklenir, render dalları sabit kalır.
  const camera = useMemo(loadCameraModule, []);
  const locked = useRef(false);

  // Sayfa her açılışta temiz başlar: önceki turun kilidi yeni turu sağır bırakmasın.
  useEffect(() => {
    if (open) locked.current = false;
  }, [open]);

  /** İki kaynağın ORTAK teslim noktası — kamera da simülasyon çipi de buradan geçer. */
  const deliver = useCallback(
    (code: string) => {
      if (locked.current || code.length === 0) return;
      locked.current = true;
      // OKUMA ANININ fiziksel karşılığı (kullanıcı isteği 23.08): kod daha çözülmeden "okundu"
      // hissi — el okuyucunun bip'inin titreşim hâli. Sonucun tonu ayrıca titreşir (`useNotice`);
      // bu darbe onun yerine değil, öncesindedir: kamera-sunucu arası boşluk sağır kalmasın.
      hapticCommit();
      onScan(code);
    },
    [onScan],
  );

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} onDismiss={Platform.OS === 'ios' ? onDismiss : undefined} testID={testID}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <PressableSurface onPress={onClose} accessibilityLabel={MESSAGES.close} feedback="opacity" style={styles.closeHit}>
            <Text style={styles.close}>{MESSAGES.close}</Text>
          </PressableSurface>
        </View>

        {camera === null ? (
          <View style={styles.permissionBox} testID="scan-camera-missing">
            <Text style={styles.permissionBody}>{__DEV__ ? MESSAGES.missingDev : MESSAGES.missingProd}</Text>
          </View>
        ) : (
          <CameraArea camera={camera} open={open} onCode={deliver} />
        )}

        {/* Simülasyon YALNIZ geliştirmede: release derlemesinde bu dal yoktur (bundler atar). */}
        {__DEV__ ? (
          <View style={styles.devPool} testID="scan-dev-pool">
            <Text style={styles.devPoolTitle}>{MESSAGES.devPool}</Text>
            <View style={styles.devPoolChips}>
              {(devCodes ?? DEV_SCAN_POOL).map((entry) => (
                <PressableSurface
                  key={entry.code}
                  onPress={() => deliver(entry.code)}
                  feedback="opacity"
                  style={styles.devChip}
                  accessibilityLabel={entry.label}
                >
                  <Text style={styles.devChipLabel}>{entry.label}</Text>
                </PressableSurface>
              ))}
            </View>
          </View>
        ) : null}

        {hint === undefined || hint.length === 0 ? null : <Text style={styles.hint}>{hint}</Text>}
      </View>
    </Modal>
  );
}

/**
 * Kamera alanı AYRI bileşen ve bu bir zorunluluk: `useCameraPermissions` bir hook'tur ve modül
 * yokken çağrılamaz — koşullu hook yasağı ancak "hook'lu dal ayrı bileşen" ile aşılır. `camera`
 * memo'lu olduğu için bu bileşen ya hep çizilir ya hiç; hook sırası bozulmaz.
 */
function CameraArea({
  camera,
  open,
  onCode,
}: {
  camera: CameraModule;
  open: boolean;
  onCode: (code: string) => void;
}) {
  const [permission, requestPermission] = camera.useCameraPermissions();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (open && permission !== null && !permission.granted && permission.canAskAgain && !asked) {
      setAsked(true);
      void requestPermission();
    }
  }, [open, permission, asked, requestPermission]);

  if (!permission?.granted) {
    return (
      <View style={styles.permissionBox} testID="scan-permission">
        <Text style={styles.permissionTitle}>{MESSAGES.permissionTitle}</Text>
        <Text style={styles.permissionBody}>
          {permission !== null && !permission.canAskAgain ? MESSAGES.permissionDenied : MESSAGES.permissionBody}
        </Text>
        {permission !== null && permission.canAskAgain ? (
          <PressableSurface
            onPress={() => void requestPermission()}
            accessibilityLabel={MESSAGES.permissionCta}
            feedback="shadow"
            style={styles.permissionCta}
          >
            <Text style={styles.permissionCtaLabel}>{MESSAGES.permissionCta}</Text>
          </PressableSurface>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.cameraBox}>
      <camera.CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'itf14', 'upc_a', 'code128', 'qr', 'datamatrix'],
        }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
      {/* Vizör çerçevesi kameranın ÜSTÜNE çizilir — hedefleme ipucu, kırpma değil. İçindeki
          kırmızı çizgi el okuyucularının lazer dili (kullanıcı isteği 23.08): "kodu bu hizaya
          getir" — çizgiye hizalanan barkod çerçeveye de sığar. */}
      <View pointerEvents="none" style={styles.frame}>
        <View style={styles.scanLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((_theme, rt) => ({
  // Zemin koyu: vizör ekranıdır, krem bir çerçeve kamerayla yarışırdı.
  screen: { flex: 1, backgroundColor: operationsTheme.colors.ink, paddingTop: rt.insets.top },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: operationsTheme.space['2xl'],
    paddingVertical: operationsTheme.space.xl,
  },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.cream,
  },
  closeHit: { paddingVertical: operationsTheme.space.sm, paddingHorizontal: operationsTheme.space.md },
  close: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
    opacity: 0.85,
  },
  cameraBox: { flex: 1, overflow: 'hidden' },
  camera: { flex: 1 },
  // Dikeyde ORTALI ve küçük (kullanıcı isteği 23.08 — eski hâli %22'den başlıyor ve %30
  // yükseklikteydi: yukarıda ve iri duruyordu). Barkod yatay bir şerittir; çerçeve de yatay.
  frame: {
    position: 'absolute',
    top: '38%',
    left: '16%',
    right: '16%',
    height: '18%',
    borderWidth: 2,
    borderColor: operationsTheme.colors.cream,
    borderRadius: operationsTheme.radius.card,
    opacity: 0.9,
  },
  /** Okuyucu çizgisi — çerçevenin dikey ortasında, kenarlara değmeden. */
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: operationsTheme.space.xl,
    right: operationsTheme.space.xl,
    height: 2,
    backgroundColor: operationsTheme.colors.terracotta,
    opacity: 0.9,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['7xl'],
  },
  permissionTitle: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.cream,
  },
  permissionBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.cream,
    textAlign: 'center',
    opacity: 0.85,
  },
  permissionCta: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.olive,
    borderRadius: operationsTheme.radius.pill,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingVertical: operationsTheme.space.xl,
  },
  permissionCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
  devPool: {
    paddingHorizontal: operationsTheme.space['2xl'],
    paddingTop: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  devPoolTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.cream,
    opacity: 0.7,
    letterSpacing: 0.5,
  },
  devPoolChips: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.lg },
  devChip: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.cream,
    borderRadius: operationsTheme.radius.pill,
    paddingHorizontal: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.md,
    opacity: 0.9,
  },
  devChipLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.cream,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.cream,
    textAlign: 'center',
    opacity: 0.8,
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: rt.insets.bottom + operationsTheme.space['2xl'],
  },
}));
