'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import placeMessages from '@lezzet/i18n/customer/place';
import { useAccount } from '@/components/customer/account/account-context';
import { NoticeDialog } from '@/components/customer/delivery/notice-dialog';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import restrictionMessages from '@/components/customer/delivery/restriction-messages.json';
import { useZoneNoticeNoted } from '@/components/customer/delivery/zone-notice-button';
import { useToast } from '@/components/customer/ui/toast';
import { recordZoneNoticeAction } from '@/lib/delivery/notice-actions';
import { Note } from './note';
import { ToggleSwitch } from './toggle-switch';

/*
  BÖLGE DIŞI BİLGİ BANDI — native `PlaceNoticeBand`ın (`apps/mobile/src/screens/customer-kit/place-notice-band.tsx`)
  web telefon ikizi (14.09): liste başında TEK blok — "aracımız buraya gitmiyor, gönderebildiklerimiz kargoyla
  gelir". Kartlarda "kargoyla gelir" işareti bu yüzden yok (native 10.08: her kartta yazan bilgi gürültüdür).

  Görünüş native'in: sıcak bilgi kutusu (`Note`), en üstte posta kodu hapı (vitrin başlığının biçimi,
  `{kod} {ŞEHİR} ▾`), başlık + tek cümle, altında "Buraya da gelin" ve — verildiyse — "Adresime
  gönderilebilir" anahtarı. Süzgeç bandın içinde (native 11.08): süzgeç yalnız rota dışında anlamlı ve bant
  tam o hâlde çiziliyor — iki ayrı kapı bir gün ayrışırdı.

  ── WEB'E ÖZGÜ AKIŞLAR (native'le bilinçli ayrışma) ──────────────────────────
  · Hap web'in yer çekmecesini açar (`PlaceSheet`; başlıktaki hapla aynı durum — `setPanelOpen`).
  · "Buraya da gelin" web'in kaydını bırakır (`recordZoneNoticeAction`). E-postası bilinen girişli müşteri
    TEK dokunuşla (native 10.08: sunucunun bildiğini sormak üç dokunuş), sonuç bildirim hapında; öteki herkes
    web'in e-posta penceresinde (`NoticeDialog`). Native misafirde kodla hesap açıyor, web kaydı hesapsız
    alıyor (`notice-actions` künyesi) — iki sözleşme, ortak görünüş.
  · Kayıt hafızası `ZoneNoticeButton`ınkiyle AYNI (`useZoneNoticeNoted`): kartta ya da sepette not bırakan
    müşteri burada daveti yeniden görmez; kayıt alınınca düğme kalkar (native 11.08).
*/

interface PlaceNoticeBandProps {
  locale: Locale;
  /** Normalize posta kodu — kaydın anahtarı ve hapın metni. */
  postalCode: string;
  /** Kodun şehri — hapta kodun yanında BÜYÜK harfle; `null` ise yalnız kod (uydurma şehir yazılmaz). */
  placeName: string | null;
  /** "Adresime gönderilebilir" süzgeci — verilirse kutunun EN ALTINDA anahtar satırı (bilgi önce, denetim sonra). */
  shippableFilter?: { value: boolean; onChange: () => void };
}

export function PlaceNoticeBand({ locale, postalCode, placeName, shippableFilter }: PlaceNoticeBandProps) {
  const t = placeMessages[locale].placeNotice;
  const shippableLabel = placeMessages[locale].onlyShippable;
  const restriction = restrictionMessages[locale];
  const { setPanelOpen } = useDeliveryPlace();
  const account = useAccount();
  const toast = useToast();
  const [noted, remember] = useZoneNoticeNoted(postalCode);
  const [asking, setAsking] = useState(false);
  /** İstek uçuşta: çift dokunuş aynı kaydı iki kez göndermesin. */
  const [sending, setSending] = useState(false);

  const request = async () => {
    const email = account?.email ?? null;
    if (email === null) {
      setAsking(true);
      return;
    }
    setSending(true);
    const { errorKey } = await recordZoneNoticeAction(postalCode, email, locale);
    setSending(false);
    // Her sonuç SÖYLENİR; sessiz geçilen hâl "sayıldım mı?" diye sordururdu (native bandın kuralı).
    if (errorKey) {
      toast(errorKey === 'place_unknown' ? t.placeUnknown : t.failed);
      return;
    }
    remember();
    toast(t.toastRecorded.replace('{email}', email));
  };

  // Şehir dilin kuralıyla büyür (Türkçenin i/İ ayrımı) — vitrin başlığının hapıyla aynı biçim.
  const postalLabel = placeName === null ? postalCode : `${postalCode} ${placeName.toLocaleUpperCase(locale)}`;

  const codeChip = (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      aria-label={t.changeCode}
      className="cursor-pointer font-sans text-body-sm font-bold tracking-[0.08em] text-terracotta transition-opacity hover:opacity-70"
    >
      {t.code.replace('{postal}', postalLabel)}
    </button>
  );

  const cta = noted ? null : (
    <button
      type="button"
      onClick={() => void request()}
      disabled={sending}
      title={t.ctaHint}
      className="cursor-pointer self-start font-sans text-control text-olive transition-opacity hover:opacity-70 disabled:cursor-progress disabled:opacity-50"
    >
      {t.cta}
    </button>
  );

  const filterRow =
    shippableFilter === undefined ? null : (
      <div className="flex items-center justify-between gap-2.5">
        <span className="font-sans text-body-sm leading-[1.6] font-semibold text-ink">{shippableLabel}</span>
        <ToggleSwitch checked={shippableFilter.value} onChange={shippableFilter.onChange} label={shippableLabel} />
      </div>
    );

  return (
    <>
      <Note
        header={codeChip}
        title={t.title}
        description={t.body}
        // Yuva boşsa hiç verilmez: boş bir sarmalayıcı kutunun altına sebepsiz nefes eklerdi.
        action={cta === null && filterRow === null ? undefined : <div className="flex flex-col gap-2.5 self-stretch">{cta}{filterRow}</div>}
      />
      {asking && (
        <NoticeDialog
          locale={locale}
          title={restriction.noticeTitle}
          body={restriction.noticeBody.replace('{code}', postalCode)}
          doneText={restriction.noticeDone.replace('{code}', postalCode)}
          onSubmit={async (email) => {
            const result = await recordZoneNoticeAction(postalCode, email, locale);
            if (!result.errorKey) remember();
            return result;
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}
