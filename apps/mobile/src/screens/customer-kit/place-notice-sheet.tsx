import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { z } from 'zod';
import type { AuthErrorKey, PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';
// E-posta geçerliliği paylaşılan motordan — RN'de ikinci bir düzenli ifade YAZILMAZ (02-mimari §3.4).
import { isValidEmail } from '@lezzet/helper';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { fetchMe } from '@/lib/api/me';
import { submitPlaceNotice } from '@/lib/api/places';
import { authErrorText } from '@/lib/auth/error-text';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { useAppLocale } from '@/lib/i18n/app-locale';
import messages from '@/lib/places/messages.json';
import { CodeField } from '@/screens/login/code-field';
import { publishMe } from './use-me.hook';

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
*/

type Messages = LocalizedCopy<typeof messages>;

/** Gövde tipi SÖZLEŞMEDEN türer; `country` için elle bir birleşim yazılmaz (02-mimari §3.2). */
type NoticeBody = z.input<typeof PlaceNoticeBodySchema>;

/** Kod uzunluğu — giriş ekranıyla aynı (altı hane). */
const CODE_LENGTH = 6;

/**
 * Akışın hâli. `verifying`/`recording` ayrı fazlar: alan ve düğme kilitli kalmalı — iki kez
 * gönderilen aynı talep anonim sayacı (`postal_code_demand`) bir kişiyi iki kez saydırırdı.
 */
type SheetPhase =
  | { kind: 'email' }
  | { kind: 'code' }
  | { kind: 'verifying' }
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

  const [phase, setPhase] = useState<SheetPhase>({ kind: 'email' });
  const [email, setEmail] = useState('');
  /* Alan hataları FAZDAN AYRI tutulur: geçersiz adres akışın hâlini değiştirmez (hâlâ "adres
     soruyoruz"), yalnız alanın altına bir satır ekler. */
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** İstek uçuştayken düğme kilidi — çift dokunuş iki kod isteği atmasın. */
  const [sending, setSending] = useState(false);
  /** 429'un bekleme süresi (sn) — sayaç sıfıra inene dek yeniden gönderme kilitli. */
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSec]);

  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  /**
   * Bekleme cezası TEK kaynaktan söylenir: saniye sayacı yalnız DÜĞME/BAĞLANTI etiketinde işler
   * (giriş ekranının 08.08'de ölçülmüş kararı — saniyeyi hata metnine gömmek, donmuş bir
   * "bekleyin" yazısını aktif düğmenin yanında bırakıyordu).
   */
  const applyAuthError = (
    result: { error: AuthErrorKey; retryAfterSec: number | null },
    setError: (text: string | null) => void,
  ) => {
    setCooldownSec(result.retryAfterSec ?? 0);
    const penalized = result.retryAfterSec !== null && (result.error === 'cooldown' || result.error === 'rate_limit');
    setError(penalized ? null : authErrorText(locale, result.error));
  };

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

  const sendCode = () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(copy.emailInvalid);
      return;
    }
    setEmailError(null);
    setSending(true);
    void requestOtp(trimmed, locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setEmailError);
        return;
      }
      setCode('');
      setCodeError(null);
      setPhase({ kind: 'code' });
    });
  };

  const resend = () => {
    if (cooldownSec > 0 || sending) return;
    setSending(true);
    setCode('');
    setCodeError(null);
    void requestOtp(email.trim(), locale).then((result) => {
      setSending(false);
      if (result.error !== null) {
        applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
      }
    });
  };

  const onCodeChange = (value: string) => {
    // Yalnız rakam ve en çok altı hane: alan biçimi kendi zorlar, kullanıcı hata mesajı görmez.
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setCodeError(null);
    if (digits.length !== CODE_LENGTH) return;

    setPhase({ kind: 'verifying' });
    void verifyOtp(email.trim(), digits, locale).then((result) => {
      if (result.error !== null) {
        // Kod aşamasına geri: yanlış kod, alan temizlenmiş hâlde yeniden denenir.
        setPhase({ kind: 'code' });
        setCode('');
        applyAuthError({ error: result.error, retryAfterSec: result.retryAfterSec }, setCodeError);
        return;
      }
      /* PROFİL BURADA OKUNUP YAYINLANIR (giriş ekranının 09.08'de ÖLÇÜLMÜŞ yarışı): `useMe`
         oturum olayını gecikmeli işliyor, arkadaki ekranlar o aralıkta müşteriyi "misafir"
         sanabiliyor. Okuma düşerse akış durmaz — talep kaydı asıl iştir, selamlama yardımcı. */
      void fetchMe().then((me) => {
        if (me.error === null) publishMe(me.data);
      });
      recordNotice();
    });
  };

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
      {phase.kind === 'email' ? (
        <View style={styles.block}>
          <Text style={styles.intro}>{copy.sheetIntro}</Text>
          <Text style={styles.prompt}>{copy.emailPrompt}</Text>
          <TextField
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError(null);
            }}
            accessibilityLabel={copy.emailLabel}
            placeholder={copy.emailPlaceholder}
            content="email"
            errorText={emailError ?? undefined}
            testID={idOf('email')}
          />
          <PrimaryButton
            label={
              cooldownSec > 0
                ? copy.sendWait.replace('{s}', String(cooldownSec))
                : sending
                  ? copy.sending
                  : copy.send
            }
            onPress={sendCode}
            disabled={sending || cooldownSec > 0}
            testID={idOf('send')}
          />
        </View>
      ) : null}

      {phase.kind === 'code' ? (
        <View style={styles.block}>
          <Text style={styles.prompt}>{copy.sent.replace('{email}', email.trim())}</Text>
          <CodeField
            value={code}
            onChangeText={onCodeChange}
            accessibilityLabel={copy.codeField}
            placeholder={copy.codePlaceholder}
            testID={idOf('code')}
          />
          {codeError === null ? null : (
            <Text style={styles.codeError} testID={idOf('code-error')}>
              {codeError}
            </Text>
          )}
          <View style={styles.resendRow}>
            {/* Bekleme süresince GERÇEKTEN kilitli (soluk + basılamaz) — sayaç yalnız burada. */}
            <TextAction
              label={cooldownSec > 0 ? copy.resendWait.replace('{s}', String(cooldownSec)) : copy.resend}
              onPress={resend}
              disabled={sending || cooldownSec > 0}
              testID={idOf('resend')}
            />
          </View>
        </View>
      ) : null}

      {phase.kind === 'verifying' || phase.kind === 'recording' ? (
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
