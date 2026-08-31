import { StyleSheet } from 'react-native-unistyles';

import { CirclePhoto } from '@/components/ui/circle-photo';
import { operationsTheme } from '@/theme/unistyles';
import { monogramOf } from './monogram';

/*
  ÜRÜN KARESİ — operasyon satırlarının solundaki küçük resim (v3:03, üç kullanım).

  ── NİÇİN `AvatarThumb` DEĞİL ───────────────────────────────────────────────
  Davranış aynı ("fotoğraf varsa fotoğraf, yoksa harf") ve o davranış ZATEN tek yerde:
  `CirclePhoto`. Bu dosya onu ikinci kez yazmıyor, üstüne iki karar koyuyor:
  · biçim DAİRE DEĞİL yuvarlatılmış KARE — `AvatarThumb` kişi/daire ailesidir; ürün kutudur,
    ve tasarım üç kullanımda da kare çiziyor (`border-radius:8/9/12`),
  · harf TEK DEĞİL MONOGRAM — iki kelimenin baş harfi (`monogramOf`), Türkçe büyük harfle.
  `AvatarThumb`a üçüncü bir biçim prop'u eklemek, kişi avatarı ile ürün karesini tek komponentte
  toplardı; ikisi ayrı ŞEY ve ayrı ölçeğe sahip (dosyanın kendi künyesi: "ölçü ve yazı kademesi
  çağırandan gelir").

  ── İKİ TON, ÇÜNKÜ İKİ ZEMİN ────────────────────────────────────────────────
  Tasarımda kare, üstünde durduğu bloğun zeminine göre renk değiştiriyor: kayıt satırlarında kum
  (`neutral-bg` + `muted` harf), AÇIK KUTUNUN içinde zeytin (`olive-bg` + `olive-dark` harf).
  Kare böylece "hangi bloktayım" sorusunu da yanıtlıyor — depocu listede mi kutuda mı olduğunu
  satıra bakmadan görüyor.

  ── NİÇİN `operationsTheme` SABİTİ ──────────────────────────────────────────
  `neutral-bg` ve `olive-bg` YALNIZ operasyon temasında var; Unistyles'ın tema birleşimi onları
  göremez (`icon-button` künyesindeki aynı duvar, gerekçesi `theme/unistyles.ts`te tek yerde).
*/

interface OperationsProductThumbProps {
  /** Ürün adı — monogram buradan türer. */
  name: string;
  /** Ürün kapağı; `null`/yok = monogram çizilir. */
  photoUri?: string | null;
  /** `sm` kutu içeriği satırı (30) · `md` kontrol listesi satırı (`thumb`, 44). */
  size?: 'sm' | 'md';
  /** `neutral` kum zemin (varsayılan) · `olive` açık kutunun içi. */
  tone?: 'neutral' | 'olive';
  testID?: string;
}

export function OperationsProductThumb({
  name,
  photoUri,
  size = 'sm',
  tone = 'neutral',
  testID,
}: OperationsProductThumbProps) {
  const small = size === 'sm';

  return (
    <CirclePhoto
      size={small ? operationsTheme.size.thumbSm : operationsTheme.size.thumb}
      initial={monogramOf(name)}
      /* Harf kareyle birlikte büyür: 30'luk karede 10, 48'likte 14 (tasarımın iki durağı). */
      initialFontSize={small ? operationsTheme.text['badge-sm'] : operationsTheme.text['body-sm']}
      photoUri={photoUri}
      /* Kare DEKORATİFTİR: adı zaten satırın başlığı okuyor. `accessibilityLabel` verilseydi
         ekran okuyucu aynı ürün adını iki kez söylerdi (`Icon` künyesindeki aynı kural) —
         `CirclePhoto` etiketsiz çağrıldığında kendini a11y ağacından çıkarıyor. */
      style={[small ? styles.square_sm : styles.square_md, tone === 'olive' ? styles.olive : styles.neutral]}
      initialStyle={tone === 'olive' ? styles.mono_olive : styles.mono_neutral}
      testID={testID}
    />
  );
}

/* Yarıçap `CirclePhoto`nun daire yarıçapını EZER — sıra önemli: `style` daireden SONRA
   uygulanıyor, yani kare kazanır. */
const styles = StyleSheet.create({
  square_sm: {
    borderRadius: operationsTheme.radius.tight,
  },
  square_md: {
    borderRadius: operationsTheme.radius.badge,
  },
  neutral: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  mono_neutral: {
    color: operationsTheme.colors.muted,
  },
  olive: {
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  mono_olive: {
    color: operationsTheme.colors['olive-dark'],
  },
});
