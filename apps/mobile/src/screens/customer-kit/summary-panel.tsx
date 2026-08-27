import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';

/*
  TUTAR ÖZETİ — sepet (v3:464), checkout (v3:544) ve sipariş onayı/detayı (v3:617, 744) aynı
  paneli çiziyor: kum zemin, alt alta "etiket ⟷ tutar" satırları, kesikli bir çizgiden sonra
  eğik toplam rozeti, altında isteğe bağlı bir açıklama.

  DÖRT EKRANIN ORTAK PARÇASI olduğu için burada; dördü kendi kopyasını çizseydi kesikli çizginin
  kalınlığı ya da rozetin açısı bir gün birinde ayrışırdı.

  ROZET NEDEN KİTTEKİ `Tag` DEĞİL: `Tag`in yazısı Karla rozet kademesidir (12,5/700); toplam
  tutar Lora 17 ile yazılıyor (v3:467) — para burada bir etiket değil, ekranın en büyük sayısı.
  `Tag`e ikinci bir yazı kademesi eklemek rozet sözlüğünü bulandırırdı.

  İKİ TON, ikisi de tasarımın kendi ayrımı: sepette toplam MÜREKKEP rozetle (henüz karar
  verilmedi, bilgi), checkout ve onayda TERRACOTTA + gölge (ödenecek tutar, ekranın odağı).
*/

/** Panelin ara satırı — "Ara toplam · 24,90 €". */
export interface SummaryRow {
  /** Satır anahtarı: aynı etiket iki kez geçebilir (iki farklı indirim), etiket anahtar olamaz. */
  key: string;
  label: string;
  value: string;
  /**
   * `olive` indirim satırı (v3:466) — kazanç, gidere benzemesin.
   * `danger` bu siparişe GİRMEYEN kalem (kullanıcı kararı 10.08): kalem özetten gizlenmez, üstü
   * çizilir ve kırmızı yazılır. Gizlemek müşteriye "herhâlde bunları alıyorum" dedirtiyordu —
   * karar özetin uzağında, adresin yanında duruyor ve uyarı gibi okunmuyordu.
   */
  tone?: 'muted' | 'olive' | 'danger';
  /** Satırın üstü çizilsin mi — `danger` kalem satırlarında; açıklama satırında değil. */
  strike?: boolean;
}

interface SummaryPanelProps {
  rows: SummaryRow[];
  totalLabel: string;
  totalValue: string;
  /** Toplam rozetinin tonu — sepette `ink`, ödeme kararının verildiği ekranlarda `terracotta`. */
  totalTone?: 'ink' | 'terracotta';
  /** Panelin üstünde duran üstbaşlık ("SİPARİŞ ÖZETİ") — checkout ve onay kullanıyor. */
  eyebrow?: string;
  /** Altta ince gri açıklama ("Fiyatlar KDV dahildir…"). */
  note?: string;
  testID?: string;
}

export function SummaryPanel({
  rows,
  totalLabel,
  totalValue,
  totalTone = 'ink',
  eyebrow,
  note,
  testID,
}: SummaryPanelProps) {
  /* Büyük harf dilin kuralıyla (`upperIn`), stilin `textTransform`una bırakılmaz — o dönüşümü
     Android native CİHAZIN diliyle yapıyor (ölçüldü 28.08, `cart-line-row` künyesi). */
  const locale = useAppLocale();
  return (
    <View style={styles.panel} testID={testID}>
      {eyebrow === undefined ? null : <Text style={styles.eyebrow}>{upperIn(eyebrow, locale)}</Text>}
      {rows.map((row) => {
        const toneStyle =
          row.tone === 'olive' ? styles.oliveLabel : row.tone === 'danger' ? styles.dangerLabel : styles.mutedLabel;
        const strike = row.strike === true ? styles.struck : null;
        return (
          <View key={row.key} style={styles.row}>
            <Text style={[styles.label, toneStyle, strike]}>{row.label}</Text>
            {row.value === '' ? null : <Text style={[styles.label, toneStyle, strike]}>{row.value}</Text>}
          </View>
        );
      })}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        {/* Dönüş DIŞ sarmalayıcıda: rozetin kendi dönüşü ile ileride gelebilecek basılı ölçek
            aynı `transform` dizisini paylaşır ve biri ötekini siler (kitteki `Tag`in gerekçesi). */}
        <View style={styles.badgeTilt}>
          <View style={[styles.badge, totalTone === 'ink' ? styles.inkBadge : styles.terracottaBadge]}>
            <Text style={[styles.badgeLabel, totalTone === 'ink' ? styles.inkBadgeLabel : styles.terracottaBadgeLabel]}>
              {totalValue}
            </Text>
          </View>
        </View>
      </View>
      {note === undefined ? null : <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.md,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    textTransform: 'uppercase',
    color: theme.colors.terracotta,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  label: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
  },
  mutedLabel: { color: theme.colors.body },
  oliveLabel: {
    color: theme.colors['olive-dark'],
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
  },
  /* Sistemin hata kırmızısı (`error` token'ı) — ham hex YASAK (CLAUDE §3) ve karanlık modda dönen
     tek renk budur. Tailwind'in sabit kırmızısı burada kullanılmaz. */
  dangerLabel: {
    color: theme.colors.error,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    // Kesikli çizgi tasarımın imzası (v3'te 14 kez): "burada bir kupon koparılır" hissi.
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
  },
  totalLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  badgeTilt: {
    transform: [{ rotate: '-2deg' }],
  },
  badge: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.badge,
  },
  inkBadge: { backgroundColor: theme.colors.ink },
  terracottaBadge: {
    backgroundColor: theme.colors.terracotta,
    boxShadow: theme.shadow.badge,
  },
  badgeLabel: {
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
  },
  inkBadgeLabel: { color: theme.colors['sand-50'] },
  terracottaBadgeLabel: { color: theme.colors.card },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
}));
