import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '../ui/bottom-sheet';
import { PrimaryButton } from '../ui/primary-button';
import { SecondaryButton } from '../ui/secondary-button';
import { operationsTheme } from '../../theme/unistyles';

/*
  GERİ ALINAMAZ EYLEMİN ONAYI — v3'ün "kayıt (2/2)" çekmecesi (31.08).

  ── NEDEN AYRI BİR KOMPONENT ────────────────────────────────────────────────
  Tasarımda aynı desen üç yerde geçiyor ve üçü de aynı şeyi yapıyor: eylemin BEDELİNİ söyle, sonra
  iki düğme sun — vazgeç (nötr, dar) ve onayla (renkli, geniş).
    · v3:20 "Ulaşılamadı — kayıt (2/2: not + onay)"
    · v3:20 "Kabul etmedi — iade kaydı (2/2: not + onay)"
    · v3:21 seferi kapatma

  Kapanış ekranında bu elden çizilmişti: sayfanın ortasında bir uyarı kutusu ve altında iki
  `PressableSurface`. Kullanıcı ölçtü — *"bu onay çekme JS mesajı gibi"* — ve haklıydı: sayfaya
  gömülü bir onay, bir KARAR anı gibi değil bir uyarı satırı gibi okunuyor. Çekmece o anı ayırıyor:
  ekranın geri kalanı kararır, karar tek başına kalır.

  ── NEDEN `Alert` DEĞİL ─────────────────────────────────────────────────────
  Yerel `Alert` işletim sisteminin görünümünü getirir: kendi yazı tipi, kendi düğme sırası, kendi
  renkleri. Operasyon yüzeyi baştan sona kendi tipografisiyle çiziliyor ve kapıda eldivenle
  kullanılıyor — sistem uyarısının dokunma hedefleri bizim kademelerimizde değil. Üstelik `Alert`
  metni sınırlar: burada bedelin AÇIKLAMASI var, tek satırlık bir soru değil.

  ── DÜĞMELER EŞİT DEĞİL ─────────────────────────────────────────────────────
  Onaylayan geniş (`grow={1.4}` — v3:00-ortak'ın kendi oranı): iki eşit düğme, hangisinin asıl
  eylem olduğunu söylemez. Ama ONAY DA varsayılan değil: vazgeç solda ve nötr, yani parmağın
  refleksle düştüğü yer yıkıcı olan değil.
*/

interface OperationsConfirmSheetProps {
  visible: boolean;
  /** Ne onaylanıyor — çekmecenin başlığı; i18n üstte çözülür. */
  title: string;
  /** Eylemin BEDELİ: neden geri alınamaz, ne yazılacak. Onayın gerekçesi budur. */
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Onaydan ÖNCE doldurulması gereken alanlar (sebep çipleri, not kutusu). Çekmecenin içinde
   * durur çünkü karar onlarla birlikte veriliyor — ayrı bir adıma bölmek "2/2" akışını üçe çıkarır.
   */
  children?: ReactNode;
  /**
   * `error` = yıkıcı eylem (iade, kabul etmedi), `olive` = geri alınamaz ama olumlu (kapanış).
   * Ton KARARIN NİTELİĞİNİ söyler; her geri alınamaz eylem kötü değildir.
   */
  tone?: 'error' | 'olive';
  /** İstek havadayken düğme kendi hâlini söyler ve ikinci kez basılmaz. */
  busy?: boolean;
  busyLabel?: string;
  testID?: string;
}

export function OperationsConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  children,
  tone = 'error',
  busy = false,
  busyLabel,
  testID,
}: OperationsConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onCancel} testID={testID}>
      <Text style={styles.message}>{message}</Text>
      {children}
      <View style={styles.row}>
        <SecondaryButton
          label={cancelLabel}
          onPress={onCancel}
          elevation="flat"
          grow
          testID={testID === undefined ? undefined : `${testID}-cancel`}
        />
        <PrimaryButton
          label={busy && busyLabel !== undefined ? busyLabel : confirmLabel}
          onPress={onConfirm}
          disabled={busy}
          tone={tone}
          elevation="flat"
          grow={1.4}
          testID={testID === undefined ? undefined : `${testID}-confirm`}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  /** Bedelin metni — başlığın altında, düğmelerden önce; okunmadan basılmasın diye ilk sırada. */
  message: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
});
