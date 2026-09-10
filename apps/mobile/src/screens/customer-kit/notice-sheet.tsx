import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { PlaceNoticeResult } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import type { ApiResult } from '@/lib/api/client';
import { useAppLocale } from '@/lib/i18n/app-locale';
import type placeMessages from '@/lib/places/messages.json';
import { OtpSignInFields } from './otp-sign-in-fields';
import { useOtpSignIn } from './use-otp-sign-in.hook';

/*
  "HABER VER" ÇEKMECESİ — misafirin bir BEKLEYİŞ bırakırken hesabının da açıldığı yer.

  İki kayıt aynı çekmeceyi kullanıyor ve bu dosya ikisinin ORTAK mekaniğidir:
    · "buraya da gelin" (`zone_notice`) — `PlaceNoticeSheet`, bölge dışı bant ve hesap ekranı;
    · "gelince haber ver" (`variant_stock_notice`) — ürün detayının tükendi/bölgede yok barı (21.306).
  Ayrılma sebebi ikinci tüketenin doğması: aynı durum makinesini (kimlik → kayıt → sonuç) ikinci kez
  yazmak bir gün ayrışacak bir kopya olurdu. Kaydın NE olduğu çağıranın işi (`submit`), cümleler de
  (CLAUDE §2 — sözlük ekranın).

  Kararların kaynağı `place-notice-sheet.tsx` künyesi: misafir aynı akışta DOĞRULANMIŞ hesaba dönüşür
  (kullanıcı kararı 10.08), e-posta gövdeye konmaz (oturum kurulunca adresi sunucu çözer) ve
  sözleşmenin dört hâlinin dördü de söylenir — kaydedilmemiş bir talebi kaydedilmiş gibi göstermek
  müşteriyi de sayacı da yanıltırdı.
*/

type PlaceCopy = LocalizedCopy<typeof placeMessages>['placeNotice'];

/** Çekmecenin istediği cümleler — bölge sözlüğünün şeklinin alt kümesi; stok kaydı başlığı, girişi ve sonuçları kendi sözlüğünden ezer. */
export type NoticeSheetCopy = Pick<
  PlaceCopy,
  | 'sheetTitle'
  | 'sheetIntro'
  | 'emailPrompt'
  | 'emailLabel'
  | 'emailPlaceholder'
  | 'emailInvalid'
  | 'send'
  | 'sending'
  | 'sendWait'
  | 'sent'
  | 'codeField'
  | 'codePlaceholder'
  | 'resend'
  | 'resendWait'
  | 'verifying'
  | 'recorded'
  | 'alreadyRecorded'
  | 'placeUnknown'
  | 'emailRequired'
  | 'failed'
  | 'retry'
  | 'close'
>;

/**
 * Çekmecenin KENDİ hâli — kimlik adımının fazı hook'ta (`use-otp-sign-in`), burada yalnız KAYDIN
 * yazımı var. `recording` ayrı bir faz: düğme kilitli kalmalı, iki kez gönderilen aynı kayıt bir
 * kişiyi iki kez saydırırdı.
 */
type SheetPhase =
  | { kind: 'identity' }
  | { kind: 'recording' }
  | { kind: 'recorded'; status: 'ok' | 'already' }
  | { kind: 'failed'; reason: 'place_unknown' | 'email_required' | 'transport' };

interface NoticeSheetProps {
  visible: boolean;
  copy: NoticeSheetCopy;
  /** Kaydı yazan çağrı — oturum KURULDUKTAN sonra koşar; çekmece hangi kaydın yazıldığını bilmez. */
  submit: () => Promise<ApiResult<PlaceNoticeResult>>;
  onClose: () => void;
  /** Kayıt alındı: çağıran düğmeyi kaldırıp sonucu kendi yerinde gösterir. */
  onRecorded: (status: 'ok' | 'already') => void;
  testID?: string;
}

export function NoticeSheet({ visible, copy, submit, onClose, onRecorded, testID }: NoticeSheetProps) {
  const locale = useAppLocale();
  const [phase, setPhase] = useState<SheetPhase>({ kind: 'identity' });

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  /** Kaydı bırakır — oturum ARTIK var, e-posta gövdeye konmaz (künye). */
  const recordNotice = () => {
    setPhase({ kind: 'recording' });
    void submit().then((result) => {
      if (result.error !== null) {
        setPhase({ kind: 'failed', reason: 'transport' });
        return;
      }
      if (result.data.status === 'place_unknown') {
        setPhase({ kind: 'failed', reason: 'place_unknown' });
        return;
      }
      if (result.data.status === 'email_required') {
        setPhase({ kind: 'failed', reason: 'email_required' });
        return;
      }
      setPhase({ kind: 'recorded', status: result.data.status });
      onRecorded(result.data.status);
    });
  };

  /* Kimlik adımı PAYLAŞILAN mekanikten: e-posta → kod → oturum. Oturum kurulunca asıl iş burada
     başlar — hook kaydın ne olduğunu bilmez (künye). */
  const signIn = useOtpSignIn({ locale, invalidEmailText: copy.emailInvalid, onSignedIn: recordNotice });

  const failureText =
    phase.kind !== 'failed'
      ? null
      : phase.reason === 'place_unknown'
        ? copy.placeUnknown
        : phase.reason === 'email_required'
          ? copy.emailRequired
          : copy.failed;

  return (
    <BottomSheet visible={visible} title={copy.sheetTitle} onClose={onClose} testID={idOf('sheet')}>
      {phase.kind === 'identity' ? (
        <View style={styles.block}>
          {/* Giriş cümlesi çekmeceyi açan kaydın KENDİSİNE ait: kimlik adımı ortak, ne için istendiği değil. */}
          {signIn.phase === 'email' ? <Text style={styles.intro}>{copy.sheetIntro}</Text> : null}
          <OtpSignInFields signIn={signIn} copy={copy} testID={testID} />
        </View>
      ) : null}

      {phase.kind === 'recording' ? (
        <View style={styles.busy}>
          <LoadingState label={copy.verifying} accessibilityLabel={copy.verifying} testID={idOf('busy')} />
        </View>
      ) : null}

      {phase.kind === 'recorded' ? (
        <View style={styles.block}>
          <Note
            tone="olive"
            description={phase.status === 'ok' ? copy.recorded : copy.alreadyRecorded}
            testID={idOf('result')}
          />
          <PrimaryButton label={copy.close} shape="pill" onPress={onClose} testID={idOf('done')} />
        </View>
      ) : null}

      {failureText === null ? null : (
        <View style={styles.block}>
          <Note tone="error" description={failureText} testID={idOf('error')} />
          {/* Tekrar deneme KAYDI yeniden dener, kodu değil: oturum kuruldu, eksik olan yalnız
              kaydın yazılmasıydı. */}
          <PrimaryButton label={copy.retry} shape="pill" onPress={recordNotice} testID={idOf('retry')} />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    gap: theme.space.lg,
  },
  intro: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  busy: {
    alignItems: 'center',
    paddingVertical: theme.space['5xl'],
  },
}));
