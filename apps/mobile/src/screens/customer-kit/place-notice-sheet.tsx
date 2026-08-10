import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { submitPlaceNotice } from '@/lib/api/places';
import { useAppLocale } from '@/lib/i18n/app-locale';
import messages from '@/lib/places/messages.json';
import { OtpSignInFields } from './otp-sign-in-fields';
import { useOtpSignIn } from './use-otp-sign-in.hook';

/*
  "BURAYA DA GELİN" ÇEKMECESİ — bölge dışı müşterinin talebini bırakırken HESABININ da açıldığı
  yer (kullanıcı kararı 10.08).

  ── KARAR DEĞİŞTİ, ESKİ GEREKÇE SİLİNMEDİ ───────────────────────────────────
  ~~"GİRİŞ DUVARI KURULMAZ: vazgeçmeye en yakın anda ikinci engel çıkarılmaz — misafir yalnız
  e-postasını yazar, uç `email_required` derse küçük bir alan açılır."~~ Bu karar 10.08'de
  kullanıcı tarafından BİLEREK değiştirildi. Gerekçe: e-posta tek başına bir kayıttır ama bir
  MÜŞTERİ değildir — doğrulanmamış adrese ne haber gönderilebilir ne de o kişi bir daha tanınır.
  Yeni kural: talep bırakan kişi aynı akışta doğrulanmış bir hesaba dönüşür (e-posta → altı haneli
  kod → oturum). **Bedeli kabul edilmiştir**: bırakılan talep sayısı düşer, ama gelen her talep
  bir hesaptır — sayılabilir, kendisine bölge açıldığında haber verilebilir bir kişi.

  Yeni altyapı YOK: OTP yolu hesabı zaten yaratıyor (`generateLink` + profil tetiği) ve akışın iki
  ucu (`requestOtp`/`verifyOtp`) giriş ekranıyla ORTAK. Hata cümleleri de ortak sözlükten
  (`lib/auth/error-text`) — aynı hâl iki yüzeyde iki farklı şey söylemesin.

  ── SATIR İÇİ FORM ÇEKMECEYE TAŞINDI (aynı gün, aynı gerekçe) ───────────────
  Alan bandın içinde açılıyordu ve bant listenin başında duruyor: form açılınca ürün kartları
  ekranın yarısına iniyordu (kullanıcı ölçümü). Kullanıcının sözü: "biz zaten alttan çekmece
  çıkarıp posta kodu alabiliyoruz, neden mail adresini de orada yapmayalım". Kalıp posta kodu
  çekmecesinin kalıbıdır; `BottomSheet` kitte tek kopya durur.

  ── SÖZLEŞMENİN DÖRT HÂLİ, DÖRDÜ DE KARŞILANIR ──────────────────────────────
    · `ok`             — "not aldık". **"Haber vereceğiz" DEMEZ**: bölge genişletme kararı
                         verilmedi ve tutulamayacak söz verilmez (`zone_notice` künyesi).
    · `already`        — "kaydınız zaten var". Tekilleştirme veritabanında; ekranın işi bunu doğru
                         cümleyle söylemek.
    · `place_unknown`  — yer çözülemedi, kayıt ALINMADI. Kaydedilmemiş bir talebi kaydedilmiş gibi
                         göstermek sayacı da müşteriyi de yanıltırdı.
    · `email_required` — ARTIK GELMEMELİ (çağrı oturumluysa e-postayı sunucu çözer), ama sözleşme
                         hâli olduğu için sessiz geçilmez: kayıt alınmadı denir ve tekrar denenir.
  Taşıma hatası (ağ) beşinci bir hâl değil ama ayrı cümle ister: kayıt alınmadı, TEKRAR denenebilir.

  E-POSTA GÖVDEYE KONMAZ: doğrulama bittiğinde oturum cihazda kuruludur (`verifyOtp` → `setSession`)
  ve uç e-postayı Bearer'dan çözer — gövdeden gelen adres yok sayılır, yani başkasının yerine kayıt
  bırakılamaz.

  ── KİMLİK ADIMI ARTIK PAYLAŞILAN (21.31) ───────────────────────────────────
  E-posta → kod → oturum mekaniği `use-otp-sign-in.hook`a çıktı: ikinci tüketen doğdu (B2B başvuru
  formu) ve aynı durum makinesini ikinci kez yazmak bir gün ayrışacak bir kopya olurdu. Bu dosyada
  kalan iki şey kendisine ait: TALEBİN yazılması ve cümleler (CLAUDE §2 — sözlük ekranın).
*/

type Messages = LocalizedCopy<typeof messages>;

/** Gövde tipi SÖZLEŞMEDEN türer; `country` için elle bir birleşim yazılmaz (02-mimari §3.2). */
type NoticeBody = z.input<typeof PlaceNoticeBodySchema>;

/**
 * Çekmecenin KENDİ hâli — kimlik adımının fazı hook'ta (`use-otp-sign-in`), burada yalnız TALEBİN
 * yazımı var. `recording` ayrı bir faz: düğme kilitli kalmalı, iki kez gönderilen aynı talep anonim
 * sayacı (`postal_code_demand`) bir kişiyi iki kez saydırırdı.
 */
type SheetPhase =
  | { kind: 'identity' }
  | { kind: 'recording' }
  | { kind: 'recorded'; status: 'ok' | 'already' }
  | { kind: 'failed'; reason: 'place_unknown' | 'email_required' | 'transport' };

interface PlaceNoticeSheetProps {
  visible: boolean;
  /** Çözülmüş yerin ülkesi — bant yalnız çözülmüş VE rota dışı yerde çiziliyor (çağıranın kapısı). */
  country: NoticeBody['country'];
  /** Normalize posta kodu (çözümden gelir, müşterinin yazdığı ham metin değil). */
  postalCode: string;
  /** Talebin hangi listeden bırakıldığı — denetim izi; ekran adı, cümleyi değiştirmez. */
  source: NoticeBody['source'];
  onClose: () => void;
  /** Kayıt alındı: bant düğmeyi kaldırıp sonucu kendi kutusunda gösterir. */
  onRecorded: (status: 'ok' | 'already') => void;
  testID?: string;
}

export function PlaceNoticeSheet({
  visible,
  country,
  postalCode,
  source,
  onClose,
  onRecorded,
  testID,
}: PlaceNoticeSheetProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const copy = t.placeNotice;

  const [phase, setPhase] = useState<SheetPhase>({ kind: 'identity' });

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  /** Talebi bırakır — oturum ARTIK var, e-posta gövdeye konmaz (künye). */
  const recordNotice = () => {
    setPhase({ kind: 'recording' });
    void submitPlaceNotice(locale, { postalCode, country, source }).then((result) => {
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
     başlar — hook talebin ne olduğunu bilmez (künye). */
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
          {/* Giriş cümlesi çekmecenin KENDİSİNE ait: kimlik adımı ortak, ne için istendiği değil. */}
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
              talebin yazılmasıydı. */}
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
  prompt: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  codeError: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors['terracotta-bright'],
    textAlign: 'center',
  },
  resendRow: { alignItems: 'center' },
  busy: {
    alignItems: 'center',
    paddingVertical: theme.space['5xl'],
  },
}));
