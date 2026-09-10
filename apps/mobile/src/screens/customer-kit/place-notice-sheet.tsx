import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { submitPlaceNotice } from '@/lib/api/places';
import { useAppLocale } from '@/lib/i18n/app-locale';
import messages from '@/lib/places/messages.json';
import { NoticeSheet } from './notice-sheet';

/*
  "BURAYA DA GELİN" ÇEKMECESİ — bölge dışı müşterinin talebini bırakırken HESABININ da açıldığı
  yer (kullanıcı kararı 10.08).

  ── MEKANİK ARTIK ORTAK (21.306) ─────────────────────────────────────────────
  Kimlik → kayıt → sonuç durum makinesi `notice-sheet.tsx`e çıktı: ikinci tüketen doğdu (ürün
  detayının "gelince haber ver" kaydı) ve aynı makineyi ikinci kez yazmak bir gün ayrışacak bir
  kopya olurdu. Bu dosyada kalan iki şey kendisine ait: HANGİ kaydın yazıldığı (`zone_notice`) ve
  cümleler (CLAUDE §2 — sözlük yer ailesinin). Aşağıdaki kararlar ortak çekmecede aynen yaşıyor.

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

  return (
    <NoticeSheet
      visible={visible}
      copy={t.placeNotice}
      submit={() => submitPlaceNotice(locale, { postalCode, country, source })}
      onClose={onClose}
      onRecorded={onRecorded}
      testID={testID}
    />
  );
}
