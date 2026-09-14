import type { Locale } from '@lezzet/i18n';
import { formatWeight } from './format';

/** Boy adının kelimeleri — ürün sayfasının sözlüğünden (`size` bloğu). */
interface VariantNameCopy {
  pieces: string;
  piecesOf: string;
  slices: string;
  slicesOf: string;
}

/**
 * Boyun MÜŞTERİYE GÖRÜNEN adı — yapısal alanlardan türer, saklı etiketten DEĞİL (kullanıcı kararı 19.08).
 *
 * *"Kullanıcı varyant isminde adet mantıklıysa adet görmeli, gramaj mantıklıysa gramaj. Zaten
 * toplam gramajı da adedi de bir yere yazıyoruz; etiketin tekrar etmesine gerek yok."*
 *
 * Saklı `label` kaynağın kendi dizgisidir (`4x105g`) ve kutunun üstünde öyle yazar — mal kabulde,
 * sayımda, tedarikçiyle konuşurken doğru olan o. Ama vitrinde müşterinin sorusu başka: **kaç tane
 * alıyorum.** Türetim iki alandan yapılıyor, ikisi de zaten dolu:
 *   · `piecesCount > 1` → "4 adet · 420 g"  (adet önde, ağırlık yanında)
 *   · yoksa             → "135 g"           (tek parça; adet yazmak bilgi eklemez)
 *
 * Gramaj kaybolmuyor: çoklu pakette ikinci sıraya geçiyor, çünkü 420 g tek başına 4 simidi mi bir
 * kocaman simidi mi anlattığını söylemiyordu.
 *
 * Ürün sayfasının satın alma panelinde doğdu (`purchase-panel.tsx`); telefon görünümünün boy çipleri
 * ikinci çağıran olunca buraya taşındı (14.09) — iki görünüm aynı boyu aynı adla yazar.
 */
export function variantNameOf(
  v: { piecesCount: number | null; portionKind: 'item' | 'slice' | null; netWeightG: number | null; label: string },
  t: VariantNameCopy,
  locale: Locale,
): string {
  const weight = v.netWeightG !== null ? formatWeight(v.netWeightG, locale) : null;
  if (v.piecesCount !== null && v.piecesCount > 1) {
    const n = String(v.piecesCount);
    // KELİME porsiyon TÜRÜNDEN gelir: 4'lü simit paketi "4 adet", 12 dilimlik cheesecake "12 dilim".
    // İkisine de "adet" yazmak müşteriye 12 cheesecake aldığını söylerdi (künye `portion_kind`, 0005).
    const slice = v.portionKind === 'slice';
    const bare = (slice ? t.slices : t.pieces).replace('{n}', n);
    const withWeight = (slice ? t.slicesOf : t.piecesOf).replace('{n}', n);
    return weight ? withWeight.replace('{weight}', weight) : bare;
  }
  return weight ?? v.label;
}
