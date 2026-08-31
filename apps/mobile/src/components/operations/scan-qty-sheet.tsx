import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { operationsTheme } from '@/theme/unistyles';
import { OperationsQtyStepperField } from './qty-stepper-field';

/*
  OKUTULAN KALEMİN ADET ÇEKMECESİ (v3:00-ortak · `sheetTopAdet`, 31.08).

  ── AKIŞIN EKSENİ BURADA DÖNÜYOR ────────────────────────────────────────────
  Kullanıcının anlattığı hareket (31.08): *"barkod okutuyor, adet giriyor. Barkod okutuyor, adet
  giriyor."* Depocu listeden ürün ARAMIYOR — okutuyor, satırı sistem buluyor, adet **kalanla dolu
  geliyor** ve o yalnız onaylıyor. Bu çekmece o döngünün ikinci yarısı.

  Eskiden okutma doğrudan +1 (koli barkodunda çarpanı kadar) ekliyordu ve çekmece her okutmada
  kapanıyordu: 6 adetlik bir kalem 6 okutma + 6 kamera açılışı demekti. Şimdi tek okutma + tek
  onay.

  ── BAĞLAM ÜÇ SORUYA CEVAP VERİR, DÖRDÜNCÜYE DEĞİL ──────────────────────────
  Başlık "ne okuttum", künye "nerede ve hangi parti", sayı çifti "ne kadar isteniyor / ne kadar
  kaldı". Fiyat, tutar, müşteri YOK — depo yüzeyinin tip sınırı (`preparation.ts` künyesi).

  ── SAYI ÇİFTİ SERBEST, ÇÜNKÜ SORU EKRANIN ──────────────────────────────────
  `stats` dizisi sabit iki alan değil: toplamada "istenen / kalan", imhada "partide / toplam stok".
  Çekmece hangi sayının sorulduğunu bilmez, yalnız nasıl gösterileceğini bilir.
*/

/** Bağlam sayısı — büyük rakam + altında ne olduğu. */
export interface ScanQtyStat {
  value: string;
  label: string;
  /** `warn` = dikkat çeken sayı (kalan, eksik) — terracotta. */
  tone?: 'neutral' | 'warn';
}

interface OperationsScanQtySheetProps {
  visible: boolean;
  /** Başlık — okutulan ürünün adı; boy varsa çekmece ikisini kendi birleştirir. */
  name: string;
  variantLabel?: string | null;
  /** Başlığın altı: raf ve parti ("KURU DEPO A3 · P-0688 · SKT 12.09.26"). */
  caption?: string | null;
  /** Bağlam sayıları (en fazla iki — üçüncüsü kartı okunmaz yapar). */
  stats?: readonly ScanQtyStat[];
  value: number;
  onChange: (next: number) => void;
  /** Rakamın altındaki açıklama — "bu kutuya konuyor". */
  qtyCaption: string;
  min?: number;
  /** Fiziksel tavan; yumuşak sınır (istenenden fazla) buraya YAZILMAZ. */
  max?: number;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** Çekmecenin altındaki kural cümlesi. */
  footnote?: string;
  onClose: () => void;
  /** iOS'ta ikinci bir çekmece açılacaksa: `Modal` söküldükten SONRA (bottom-sheet künyesi). */
  onDismissed?: () => void;
  testID?: string;
}

export function OperationsScanQtySheet({
  visible,
  name,
  variantLabel,
  caption,
  stats,
  value,
  onChange,
  qtyCaption,
  min,
  max,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  footnote,
  onClose,
  onDismissed,
  testID,
}: OperationsScanQtySheetProps) {
  const title = variantLabel ? `${name} · ${variantLabel}` : name;

  return (
    <BottomSheet
      visible={visible}
      title={title}
      onClose={onClose}
      onDismissed={onDismissed}
      testID={testID}
    >
      <View style={styles.body}>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}

        {stats && stats.length > 0 ? (
          <View style={styles.stats}>
            {stats.map((stat, index) => (
              <View
                key={stat.label}
                /* Ayraç ikinci sütunun SOL çizgisidir, aralarına konan bir öğe değil: boş bir
                   çizgi görünümü, sütun sayısı değişince yetim kalırdı. */
                style={[styles.stat, index > 0 ? styles.stat_divided : null]}
              >
                <Text style={[styles.statValue, stat.tone === 'warn' ? styles.statValue_warn : null]}>
                  {stat.value}
                </Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <OperationsQtyStepperField
          value={value}
          onChange={onChange}
          caption={qtyCaption}
          label={title}
          min={min}
          max={max}
          testID={testID === undefined ? undefined : `${testID}-qty`}
        />

        <PrimaryButton
          label={confirmLabel}
          elevation="flat"
          disabled={confirmDisabled}
          onPress={onConfirm}
          testID={testID === undefined ? undefined : `${testID}-confirm`}
        />

        {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: operationsTheme.space.xl,
  },
  caption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  stat: {
    flex: 1,
  },
  stat_divided: {
    borderLeftWidth: operationsTheme.border.base,
    borderLeftColor: operationsTheme.colors['sand-300'],
    paddingLeft: operationsTheme.space['2xl'],
  },
  statValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  statValue_warn: {
    color: operationsTheme.colors.terracotta,
  },
  statLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
  },
});
