import type { LocalizedCopy, Locale } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { Skeleton } from '@/components/ui/skeleton';
import { TextAction } from '@/components/ui/text-action';
import { Note } from '@/components/ui/note';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { useOrder } from '@/screens/orders/use-order.hook';
// Sözlük burada YALNIZ tip için okunuyor (metni ekran veriyor): çalışma zamanında ikinci bir JSON
// kopyası taşınmasın diye tip-yalnız import.
import type messages from './messages.json';

/*
  YENİ TALEBİN KALEM SEÇİCİSİ (v3 `vTalepNew` · `tn.items`) — seçilen siparişin kalemlerini GERÇEK
  detay ucundan (`GET /api/v1/me/orders/:reference`) okur ve işaretlenenleri yukarı bildirir.

  ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
  Detay yalnız SİPARİŞLİ talepte okunur; hook'lar koşullu çağrılamaz. Kancayı ekranın gövdesine
  koysaydık genel talepte de boş bir referansla istek atardık — olmayan bir siparişi sormak.
  Kapı komponent sınırında: bu parça yalnız referans varken çizilir.

  ── PAKET SATIRI İŞARETLENEMEZ (bilinen sözleşme boşluğu, sessiz değil) ─────
  Talep açılışı `orderItemIds` istiyor ve bunlar KALEM kimlikleridir (uuid). Mobil sipariş
  sözleşmesi paket satırını TEK satıra katlayıp sentetik bir kimlik veriyor (`bundle:…`) ve o
  satırın arkasındaki kalem kimliklerini TAŞIMIYOR — web'in görünümünde `orderItemIds` var, mobil
  zarfında yok. Seçilebilir yapıp göndermemek sessiz bir kayıp olurdu (müşteri işaretledi sanır,
  operatöre hiçbir şey gitmez); göndermek de sunucunun tüm talebi reddetmesi demekti (uuid
  değil). Bu yüzden paket satırı LİSTEDE DURUR (sipariş eksik görünmesin) ama işaretlenemez, ve
  altında bunu söyleyen bir satır çıkar. Sözleşme `orderItemIds` taşımaya başladığı gün bu
  ayrım silinir — terfi ihtiyacı rapor edildi.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Bekleme skeleton'ı — üç kalem satırı (v3 `hint-placeholder-count="3"`).
 *
 * YÜKSEKLİK YAZILMIYOR (10.08): eskiden `46` diye ham bir sayıydı ve satırın kendi dolgusundan
 * bağımsızdı. Skeleton artık satırın GERÇEK kabuğunu kuruyor (`styles.lineRow` + boştaki çerçeve
 * tonu) ve içine iki çubuk koyuyor; yükseklik kendiliğinden çıkıyor.
 */
const SKELETON_SLOTS = [0, 1, 2];

interface OrderLinePickerProps {
  /** Siparişin müşteri numarası (`LA-26-…`). */
  reference: string;
  locale: Locale;
  t: Messages;
  /** İşaretli KALEM kimlikleri — paket satırı buraya asla girmez. */
  selected: string[];
  onToggle: (orderItemId: string) => void;
}

export function OrderLinePicker({ reference, locale, t, selected, onToggle }: OrderLinePickerProps) {
  const { theme } = useUnistyles();
  const { status, detail, retry } = useOrder(reference, locale);

  const heading = (
    <>
      <Text style={styles.eyebrow}>{t.new.items.eyebrow.replace('{reference}', reference)}</Text>
      <Text style={styles.question} accessibilityRole="header">
        {t.new.items.question}
      </Text>
    </>
  );

  if (status === 'loading') {
    return (
      <View
        style={styles.block}
        testID="new-ticket-lines-loading"
        accessible
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
      >
        {/* Başlık GERÇEK: metni veriden gelmiyor (sipariş numarası zaten elimizde). */}
        {heading}
        {SKELETON_SLOTS.map((slot) => (
          <View key={slot} style={[styles.lineRow, styles.lineIdle]}>
            {/* Solda kalem adı, sağda adet — satırın kendi düzeni. */}
            <Skeleton width="58%" height={theme.text.note * theme.text['h1--line-height']} tone="deep" />
            <Skeleton width="14%" height={theme.text.helper * theme.text['h1--line-height']} tone="deep" />
          </View>
        ))}
      </View>
    );
  }

  /* Kalemler gelmediyse akış DURMAZ: müşteri işaretleyemez ama anlatımını yazıp gönderebilir —
     talebi tamamen kapatmak, çözülebilir bir sorunu ekranda hapsetmek olurdu. */
  if (status !== 'ready' || detail === null) {
    return (
      <View style={styles.block} testID="new-ticket-lines-error">
        {heading}
        <Note description={t.new.items.error} tone="terracotta" />
        <TextAction label={t.error.retry} onPress={retry} tone="terracotta" testID="new-ticket-lines-retry" />
      </View>
    );
  }

  const hasBundle = detail.lines.some((line) => line.bundle !== null);

  return (
    <View style={styles.block} testID="new-ticket-lines">
      {heading}
      {detail.lines.map((line) => {
        const label = t.new.items.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name);

        if (line.bundle !== null) {
          return (
            <View key={line.id} style={[styles.lineRow, styles.lineBundle]} testID={`new-ticket-line-${line.id}`}>
              <Text style={[styles.lineLabel, styles.lineBundleLabel]}>{label}</Text>
            </View>
          );
        }

        const isSelected = selected.includes(line.id);

        return (
          <PressableSurface
            key={line.id}
            onPress={() => onToggle(line.id)}
            feedback="scale-small"
            selected={isSelected}
            style={[styles.lineRow, isSelected ? styles.lineSelected : styles.lineIdle]}
            accessibilityLabel={label}
            testID={`new-ticket-line-${line.id}`}
          >
            <Text style={styles.lineLabel}>{label}</Text>
            {isSelected ? (
              <CustomerIcon name="check" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            ) : null}
          </PressableSurface>
        );
      })}
      {hasBundle ? <Text style={styles.note}>{t.new.items.bundleNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.space['2xl'] },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  question: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
    borderWidth: theme.border.base,
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  lineIdle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors['sand-400'],
  },
  lineSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  /* Paket satırı: aynı kutu, sönük çerçeve — "burada bir satır var ama işaretlenemiyor". */
  lineBundle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors['disabled-line'],
    borderStyle: 'dashed',
  },
  lineLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  lineBundleLabel: { color: theme.colors.muted },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },
}));
