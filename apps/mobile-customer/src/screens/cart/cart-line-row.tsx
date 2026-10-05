import type { CatalogImage } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { QuantityStepper } from '@/screens/customer-kit/quantity-stepper';

/*
  Sepet satırı: paket koyu kartta, ürün kesikli ayraçlı zeminsiz satırda; rozetler yalnız üründe, çünkü paketin içeriğinin durumu
  paket detayında konuşur. Salt okunur satır (yalnız webden eklenebilen paket) gizlenmez ve sayaç yerine adet yazar, çünkü basılınca
  bir şey yapmayan düğme arızalı görünürdü.
*/

interface CartLineRowProps {
  name: string;
  /** İkinci satır: ürün için "500 g · 12,90 €", paket için içerik özeti. */
  subtitle: string;
  /** Satır toplamı — biçimlenmiş. */
  totalLabel: string;
  quantity: number;
  /** Satırın görseli — dairenin çapına yeten kare CDN türevi (21.303). */
  image: CatalogImage;
  tone: 'product' | 'bundle';
  /** Paket satırının üstbaşlığı ("HAZIR PAKET"); ürün satırında verilmez. */
  eyebrow?: string;
  /** "İndirimli fiyat" rozeti. */
  discountLabel?: string;
  /** "Tükendi — teslim edilemez" rozeti. */
  soldOutLabel?: string;
  /**
   * "Bu adrese teslim edemiyoruz" künyesi; tükendi rozetinden ayrı ve hata renginde değil, çünkü gelemeyen kalem sepette bekler ve
   * silinmez. İkisini tek rozete toplamak adresin gerçeğini arıza gibi okuturdu.
   */
  awayLabel?: string;
  /**
   * Müşterinin BİLMESİ gereken tek uyarı — fiyat arttı (DOMAIN §5: açıkça söylenir) ya da satır
   * uygulamadan düzenlenemiyor. İki durum aynı anda oluşmaz; sıralaması çağıranın kararı.
   */
  noticeLabel?: string;
  /** Adet sayacı ve "kaldır" ÇİZİLMEZ; yerine adet yazısı durur (künye: salt okunur hâl). */
  readOnly?: boolean;
  removeLabel: string;
  removeAccessibilityLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  testID?: string;
}

export function CartLineRow({
  name,
  subtitle,
  totalLabel,
  quantity,
  image,
  tone,
  eyebrow,
  discountLabel,
  soldOutLabel,
  awayLabel,
  noticeLabel,
  readOnly = false,
  removeLabel,
  removeAccessibilityLabel,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  onRemove,
  testID,
}: CartLineRowProps) {
  /* Üstbaşlık büyük harfe dilin kuralıyla çevrilir (`upperIn`), çünkü stilin `textTransform`u Android'de cihazın dilini kullanır
     ("Panier prêt" → "PANİER PRÊT"). */
  const locale = useAppLocale();
  const isBundle = tone === 'bundle';

  return (
    <View style={[styles.row, isBundle ? styles.bundleRow : styles.productRow]} testID={testID}>
      <AvatarThumb
        initial={name.slice(0, 1)}
        accessibilityLabel={name}
        image={image}
        size="lg"
        testID={testID === undefined ? undefined : `${testID}-photo`}
      />
      <View style={styles.text}>
        {eyebrow === undefined ? null : <Text style={styles.eyebrow}>{upperIn(eyebrow, locale)}</Text>}
        <Text style={[styles.name, isBundle ? styles.onInk : styles.onSand]}>{name}</Text>
        <Text style={[styles.subtitle, isBundle ? styles.onInkMuted : styles.onSandMuted]}>{subtitle}</Text>
        <Text style={[styles.total, isBundle ? styles.onInk : styles.onSand]}>{totalLabel}</Text>
        {discountLabel === undefined ? null : (
          <Text style={[styles.badge, styles.noteBadge]}>{discountLabel}</Text>
        )}
        {soldOutLabel === undefined ? null : (
          // Tükendi bir DURUM DEĞİŞİKLİĞİDİR (sepete girdikten sonra oldu): duyurulur.
          <Text style={[styles.badge, styles.soldOutBadge]} accessibilityRole="alert">
            {soldOutLabel}
          </Text>
        )}
        {awayLabel === undefined ? null : (
          // DUYURULMAZ (`alert` yok): bu bir olay değil, adresin sabit gerçeği — ve satırların
          // üstünde tek bir uyarı zaten aynı şeyi söylüyor. Her satırda bir uyarı duyurmak,
          // ekran okuyucuyu aynı cümleyle üç kez keserdi.
          <Text style={[styles.badge, styles.noteBadge]}>{awayLabel}</Text>
        )}
        {noticeLabel === undefined ? null : (
          // Fiyat artışı da bir DURUM DEĞİŞİKLİĞİDİR ve müşterinin onayına sunulur: duyurulur.
          <Text style={[styles.badge, styles.noteBadge]} accessibilityRole="alert">
            {noticeLabel}
          </Text>
        )}
      </View>
      <View style={styles.controls}>
        {readOnly ? (
          <Text style={[styles.readOnlyQuantity, isBundle ? styles.onInk : styles.onSand]}>{`×${quantity}`}</Text>
        ) : (
          <>
            <QuantityStepper
              quantity={quantity}
              onDecrease={onDecrease}
              onIncrease={onIncrease}
              decreaseLabel={decreaseLabel}
              increaseLabel={increaseLabel}
              tone={isBundle ? 'ink' : 'sand'}
              testID={testID === undefined ? undefined : `${testID}-stepper`}
            />
            <TextAction
              label={removeLabel}
              onPress={onRemove}
              // Pay ÜSTE verilmez: hemen üstteki sayaç düğmelerinin çizili kutusuna girip
              // dokunuşu çalıyordu (künye: `PressableSurface.compactEdges`).
              compactEdges="down"
              // Koyu kartta zeytin metin okunmuyor; orada terracotta da kirli duruyor — kaldır
              // eylemi ikinci sesli bir eylemdir ve şablonda ikisinde de sönük yazılı.
              tone={isBundle ? 'terracotta' : 'olive'}
              accessibilityHint={removeAccessibilityLabel}
              testID={testID === undefined ? undefined : `${testID}-remove`}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  bundleRow: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    padding: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  /* Kesikli ayraç satırın kendi kenarında ve rengi dört kenara verilir, çünkü iOS kesik kenarı yalnız içeriği olan bir kutuda ve
     bütün kenarların rengi aynıyken çizer. */
  productRow: {
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xs'],
    borderBottomWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
  },
  text: { flex: 1, gap: theme.space['2xs'] },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    textTransform: 'uppercase',
    color: theme.colors['olive-light'],
  },
  name: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
  },
  subtitle: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
  },
  total: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    marginTop: theme.space['2xs'],
  },
  onInk: { color: theme.colors['sand-50'] },
  onInkMuted: { color: theme.colors['neutral-400'] },
  onSand: { color: theme.colors.ink },
  onSandMuted: { color: theme.colors.muted },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.badge,
    overflow: 'hidden',
  },
  /** İŞARET rozetinin ortak tonu (terracotta ailesi): indirim · gelemeyen kalem · fiyat uyarısı.
      Üçü de "bunu bil" der; hata ailesi yalnız `soldOutBadge`in — orada satır çıkarılmadan devam
      edilemiyor. */
  noteBadge: {
    color: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
  },
  soldOutBadge: {
    color: theme.colors.error,
    backgroundColor: theme.colors['error-bg'],
  },
  controls: {
    /* Aralık tasarımın 6'sı değil 10, çünkü daha dar aralıkta sayaç ile "kaldır"ın görünmez dokunma payları çakışır ve "+"a
       dokunuş ürünü siler. */
    alignItems: 'center',
    gap: theme.space.lg,
  },
  readOnlyQuantity: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
  },
}));
