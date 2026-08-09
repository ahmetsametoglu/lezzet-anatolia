import { TextInput } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  ADET KUTUSU — Operasyon Mobil v2'nin depo ekranlarında DÖRT kez aynı iskeletle çizilen alan:
  toplama (322), mal kabul (362), transfer (467) ve sayım (441). Dördü de aynı şeyi söylüyor:
  beyaz zemin, mürekkep çerçeve, 12 yarıçap, ortalanmış KALIN rakam.

  Fark yalnız iki eksende ve ikisi de prop: kutunun GENİŞLİĞİ (64 ⟷ 70 ⟷ 80) ve rakamın TONU.
  Dört kopya yazmak, bir gün beşincisinin ötekilerden ayrı görünmesi demekti (CLAUDE.md §1).

  ── TON BİR RENK DEĞİL, BİR ANLAMDIR ────────────────────────────────────────
  `muted` "hiç yazılmadı", `done` "istenen kadar", `diff` "beklenenden sapıyor", `down` "stoktan
  düşüyor". Çağıran rengi değil ANLAMI seçer; renkler token'dan gelir ve tek yerde durur — ekranın
  hangi tonu hangi durumda kullandığı kendi kararıdır, tonun neye benzediği burasının.

  ── KİTİN `TextField`i KULLANILMADI ─────────────────────────────────────────
  O müşteri yüzeyinin alanıdır: hap/yumuşak köşe kademeleri, etiket+yardım metni yuvası, sondaki
  düğme yuvası ve `sand` çerçeve taşır (v3'ün formları). Buradaki kutu 64 dp genişliğinde, etiketsiz
  ve mürekkep çerçeveli bir RAKAM kutusudur; `TextField`e altı prop eklemek, iki ayrı tasarım
  kararını tek komponentin ortak paydası yapardı (aynı gerekçe: `choice-chip.tsx` künyesi).

  ── BOŞ İLE SIFIR AYRIMI BURADA KORUNUR ─────────────────────────────────────
  Alan METNİ taşır ve ayrıştırmayı çağıran yapar (`parseQty`): D5'te boş ("sayılmadı") ile 0 ("geldi
  ama kayıp") AYRI şeylerdir ve bir komponentin içinde sessizce birleştirilemezler.
*/

/** Rakamın anlamı — renk değil, DURUM. */
type QtyTone = 'neutral' | 'muted' | 'done' | 'diff' | 'down';

interface OperationsQtyFieldProps {
  /** Alanın metni; boş dize = hiç yazılmadı (sıfır DEĞİL — ayrım çağıranındır). */
  value: string;
  onChangeText: (text: string) => void;
  /** Ekran okuyucu adı — ZORUNLU; yer tutucu bunun yerine geçmez. */
  accessibilityLabel: string;
  tone?: QtyTone;
  /** `sm` toplama (64) · `md` kabul/transfer (70) · `lg` sayım (80, daha büyük rakam). */
  size?: 'sm' | 'md' | 'lg';
  /** İŞARETLİ adet mi — eksi yazılabilsin diye klavye değişir (D4). */
  signed?: boolean;
  placeholder?: string;
  testID?: string;
}

export function OperationsQtyField({
  value,
  onChangeText,
  accessibilityLabel,
  tone = 'neutral',
  size = 'md',
  signed = false,
  placeholder,
  testID,
}: OperationsQtyFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      // İşaretsiz alanda `number-pad` eksi tuşu TAŞIMAZ ve bu doğru: D1/D2/D5'te negatif adet bir
      // sayım değil, bir yazım hatasıdır.
      keyboardType={signed ? 'numbers-and-punctuation' : 'number-pad'}
      placeholder={placeholder}
      placeholderTextColor={operationsTheme.colors.muted}
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, styles[size], styles[tone], size === 'lg' ? styles.largeText : undefined]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.md,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.body,
  },
  /* Genişlikler v2'den ÖLÇÜLDÜ (64 · 70 · 80) ve `space`ten türetiliyor: ölçek dolgu/aralık
     ailesidir, kutunun kendi ölçüsü ondan çıkarılırsa tek yerde değişir. */
  sm: { width: operationsTheme.size.avatarLg + operationsTheme.space.md },
  md: { width: operationsTheme.size.avatarLg + operationsTheme.space['2xl'] },
  lg: { width: operationsTheme.size.avatarLg + operationsTheme.space['5xl'] },
  /** Sayım ekranının rakamı bir kademe büyük (v2:441 — `800 18px`). */
  largeText: { fontSize: operationsTheme.text.step },
  neutral: { color: operationsTheme.colors.ink },
  muted: { color: operationsTheme.colors.muted },
  done: { color: operationsTheme.colors['olive-dark'] },
  diff: { color: operationsTheme.colors.terracotta },
  down: { color: operationsTheme.colors.error },
});
