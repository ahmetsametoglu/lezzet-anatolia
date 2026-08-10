import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';
// E-posta geçerliliği paylaşılan motordan — RN'de ikinci bir düzenli ifade YAZILMAZ (02-mimari §3.4).
import { isValidEmail } from '@lezzet/helper';

import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { submitPlaceNotice } from '@/lib/api/places';
import { useAppLocale } from '@/lib/i18n/app-locale';
// Metin YER AİLESİNİN yanında (`place-view.ts` künyesinin kendi kuralı): bandı iki liste birden
// çiziyor (katalog · paketler) ve cümle tek nüsha durmalı.
import messages from '@/lib/places/messages.json';

/*
  BÖLGE DIŞI BİLGİ BANDI (kullanıcı kararı 10.08) — müşteri listelerinin BAŞINDA tek bir cümle.

  NEDEN VAR: kart başına tekrarlanan "Kargoyla gelir" işareti kaldırıldı çünkü rota dışı
  müşterinin kartlarının neredeyse tamamı onu taşıyordu — her kartta yazan bir bilgi, bilgi
  olmaktan çıkıp gürültü olur. Aynı cümle buraya, TEK yere taşındı: "kendi aracımız buraya
  gitmiyor, gönderebildiklerimiz kargoyla gelir". Kartlarda kalan tek yer işareti, GÖNDEREMEDİĞİMİZ
  ürünün notudur (o da solmayla birlikte).

  KATALOGDAN KİTE TAŞINDI (10.08): ikinci çağıranı doğdu — paketler sekmesi. O sekmeye alt
  çubuktan DOĞRUDAN gelinebiliyor, yani katalogdan geçmeyen bir müşteri adresinin gerçeğini hiç
  okumadan bir paket listesine bakıyordu. Bandın ikinci nüshası yazılmadı; ekranın adı bir prop
  oldu (`source`) ve kaydın hangi listeden geldiği yine izlenebiliyor.

  TASARIMDA YOK, KİTİN DİLİYLE KURULDU: v3'te bölge dışı katalog bandı çizilmemiş. Yeni bir görsel
  dil üretilmedi — kitin bilgi kutusu (`Note`) kullanıldı; sıcak nötr ton (`warm`) çünkü bu bir
  hata da bir fırsat da değil, adresin gerçeği. Sapma `design/KARARLAR.md` sonunda kayıtlı.

  ── "BURAYA DA GELİN" ────────────────────────────────────────────────────────
  Bant bir bilgi levhası değil, bir kapı: müşteri bölgesini talep olarak bırakabiliyor
  (`POST /api/v1/places/notice`). Sözleşmenin DÖRT hâli de karşılanır, hiçbiri sessiz geçilmez:
    · `ok`             — "not aldık". **"Haber vereceğiz" DEMEZ**: bölge genişletme kararı
                         verilmedi ve tutulamayacak söz verilmez (`zone_notice` künyesi).
    · `already`        — "kaydınız zaten var". Tekilleştirme veritabanında (aynı kişi + aynı yer
                         bir kez sayılır); ekranın işi bunu DOĞRU cümleyle söylemek. Sessiz kalmak
                         "kaydedemedik" diye okunurdu, "yeni kayıt aldık" demek ise yalan olurdu.
    · `email_required` — misafir e-posta vermemiş. GİRİŞ DUVARI KURULMAZ: küçük bir alan açılır,
                         adres sorulur. Girişli müşteride bu hâl hiç gelmez (e-postayı sunucu
                         çözer), yani alan yalnız gerçekten gerekince görünür.
    · `place_unknown`  — yer çözülemedi, kayıt ALINMADI. Kaydedilmemiş bir talebi kaydedilmiş gibi
                         göstermek, sayacı da müşteriyi de yanıltırdı.
  Taşıma hatası (ağ) beşinci bir hâl değil ama ayrı cümle ister: kayıt alınmadı, TEKRAR denenebilir.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Gövde tipi SÖZLEŞMEDEN türer; `country` için elle bir birleşim yazılmaz (02-mimari §3.2). */
type NoticeBody = z.input<typeof PlaceNoticeBodySchema>;

/**
 * Kaydın hangi ekrandan geldiği — denetim izi (sözleşme: enum değil, serbest kısa dizge).
 *
 * DIŞA VERİLMEZ: çağıran değeri satır içinde yazıyor (`source="app-packages"`) ve tipi adıyla
 * anan kimse yok — kullanılmayan bir dışa verim `knip`in ölü listesine düşer.
 */
type PlaceNoticeSource = 'app-catalog' | 'app-packages';

/**
 * Bandın hâli. `sending` ayrı bir faz: düğme iki kez basılabilirse aynı talep iki kez gider ve
 * anonim sayaç (`postal_code_demand`) bir kişiyi iki kez sayar.
 */
type BandPhase =
  | { kind: 'idle' }
  | { kind: 'askEmail' }
  | { kind: 'sending' }
  | { kind: 'done'; status: 'ok' | 'already' }
  | { kind: 'failed'; reason: 'place_unknown' | 'transport' };

interface PlaceNoticeBandProps {
  /** Çözülmüş yerin ülkesi — bant yalnız çözülmüş VE rota dışı yerde çiziliyor (çağıranın kapısı). */
  country: NoticeBody['country'];
  /** Normalize posta kodu (çözümden gelir, müşterinin yazdığı ham metin değil). */
  postalCode: string;
  /** Talebin hangi listeden bırakıldığı — denetim izi; ekran adı, cümleyi değiştirmez. */
  source: PlaceNoticeSource;
  /** Alt öğelerin test kimlikleri bundan TÜREtilir — iki liste aynı bandı çiziyor, id'ler ayrışmalı. */
  testID?: string;
}

export function PlaceNoticeBand({ country, postalCode, source, testID }: PlaceNoticeBandProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const [phase, setPhase] = useState<BandPhase>({ kind: 'idle' });
  const [email, setEmail] = useState('');
  /* Alan hatası FAZDAN AYRI tutulur: geçersiz adres bandın hâlini değiştirmez (hâlâ "adres
     soruyoruz"), yalnız alanın altına bir satır ekler. */
  const [emailInvalid, setEmailInvalid] = useState(false);
  /* Alt kimlikler bandın kendi kimliğinden TÜRER: iki liste aynı bandı çiziyor ve sabit
     "catalog-…" önekleri paketler sekmesinde yalan söylerdi. */
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  const send = async (address: string | null) => {
    setPhase({ kind: 'sending' });
    const result = await submitPlaceNotice({ postalCode, country, email: address, source });
    if (result.error !== null) {
      setPhase({ kind: 'failed', reason: 'transport' });
      return;
    }
    if (result.data.status === 'email_required') {
      setPhase({ kind: 'askEmail' });
      return;
    }
    if (result.data.status === 'place_unknown') {
      setPhase({ kind: 'failed', reason: 'place_unknown' });
      return;
    }
    setPhase({ kind: 'done', status: result.data.status });
  };

  /* İlk dokunuşta e-posta GÖNDERİLMEZ (null): girişli müşteride adres sunucuda çözülüyor ve
     sormak gereksiz bir soru olurdu. Misafirde uç `email_required` der, alan o zaman açılır. */
  const request = () => {
    void send(null);
  };

  const submitEmail = () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailInvalid(true);
      return;
    }
    setEmailInvalid(false);
    void send(trimmed);
  };

  return (
    <View style={styles.band} testID={testID}>
      <Note tone="warm" title={t.placeNotice.title} description={t.placeNotice.body} />

      {phase.kind === 'done' ? (
        <Note
          tone="olive"
          description={phase.status === 'ok' ? t.placeNotice.recorded : t.placeNotice.alreadyRecorded}
          testID={idOf('result')}
        />
      ) : null}

      {phase.kind === 'failed' ? (
        <Note
          tone="error"
          description={phase.reason === 'place_unknown' ? t.placeNotice.placeUnknown : t.placeNotice.failed}
          testID={idOf('error')}
        />
      ) : null}

      {phase.kind === 'askEmail' ? (
        <View style={styles.emailBlock}>
          {/* SORU, DUVAR DEĞİL: alan bandın içinde açılır, ayrı bir ekrana ya da girişe götürmez. */}
          <Text style={styles.emailPrompt}>{t.placeNotice.emailPrompt}</Text>
          <TextField
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailInvalid(false);
            }}
            accessibilityLabel={t.placeNotice.emailLabel}
            placeholder={t.placeNotice.emailPlaceholder}
            content="email"
            errorText={emailInvalid ? t.placeNotice.emailInvalid : undefined}
            testID={idOf('email')}
          />
          <PrimaryButton
            label={t.placeNotice.send}
            shape="pill"
            onPress={submitEmail}
            testID={idOf('email-submit')}
          />
        </View>
      ) : null}

      {/* Eylem satırı: ilk çağrıda ve düşen çağrıdan sonra durur; kayıt alındığında KALKAR —
          alınmış bir kaydı ikinci kez isteten düğme, "sayılmadım mı?" sorusunu doğururdu. */}
      {phase.kind === 'idle' || phase.kind === 'sending' || phase.kind === 'failed' ? (
        <TextAction
          label={phase.kind === 'failed' ? t.placeNotice.retry : t.placeNotice.cta}
          onPress={request}
          disabled={phase.kind === 'sending'}
          accessibilityHint={t.placeNotice.ctaHint}
          testID={idOf('cta')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  band: {
    gap: theme.space.lg,
    // Izgaranın üst nefesi kartlar için; bant listenin başında kendi payını taşır.
    paddingBottom: theme.space.md,
  },
  emailBlock: {
    gap: theme.space.lg,
  },
  emailPrompt: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
