'use client';

import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import type { Messages } from '../discover-types';

/**
 * Turun sonu — üç ayrı ekran, üçü de aynı yerde (tasarım: "Bitiş durumu" · "Aday yok" · girişsiz).
 *
 * ── GİRİŞSİZİN BİTİŞİ TASARIMDAN SAPIYOR VE BU BİLİNÇLİ ─────────────────────
 * Çizimde girişsiz kullanıcıya yalnız kart üstünde bir davet var, bitişte özel bir ekran yok.
 * Kullanıcı kararı (03.08) bunu değiştirdi: tur bitince ziyaretçiye **teşekkür + hesap daveti +
 * biriken puanın tutarı** gösteriliyor. Gerekçe, davetin ZAMANLAMASI: değer gösterilmeden yapılan
 * bir giriş çağrısı reklamdır, değer gösterildikten sonra yapılan bir teklif. Kaydırmalar zaten
 * kaydedildi; hesap açılırsa puana dönüyor (`claimDiscoverSwipes`).
 *
 * **Puanın para karşılığı yazılıyor** ("12 puan (0,12 €)") çünkü çıplak puan bir sayı, karşılığı
 * olan puan bir teklif. Ölçek ayardan gelir (`points_cent_value`), ekran hesaplamaz.
 */
interface DiscoverOutcomeProps {
  t: Messages;
  signedIn: boolean;
  /** Bu turda biriken puan. */
  earned: number;
  /** Puanın okunur para karşılığı — sunucuda biçimlendi (girişsiz davette gösterilir). */
  earnedMoney: string;
  /** Deste hiç dolmadıysa "aday yok" hâli; tur bitmişten AYRI bir cümle ister. */
  emptyDeck: boolean;
  compact: boolean;
}

export function DiscoverOutcome({ t, signedIn, earned, earnedMoney, emptyDeck, compact }: DiscoverOutcomeProps) {
  const copy = emptyDeck ? t.empty : signedIn ? t.done : t.guestDone;

  return (
    <div className={`flex flex-col items-center gap-3.5 text-center ${compact ? 'px-7 py-10' : 'px-12 py-14'}`}>
      <span className="text-[44px]">{emptyDeck ? '🌱' : '🎉'}</span>
      <h1 className={`font-serif ${compact ? 'text-card-title' : 'text-h2'} text-ink`}>{copy.title}</h1>

      {/* Puan rozeti YALNIZ girişli ve kazanılmışsa: girişsize burada rozet göstermek, alamadığı
          bir şeyi kutlamak olurdu — onun cümlesi zaten gövdede, teklif olarak duruyor. */}
      {signedIn && !emptyDeck && earned > 0 && (
        <span className="rounded-pill bg-olive px-5 py-2 font-sans text-body font-bold text-white">
          {t.done.earned.replace('{points}', String(earned))}
        </span>
      )}

      <p className="max-w-[420px] font-sans text-body-sm leading-relaxed text-body">
        {emptyDeck || signedIn
          ? copy.body
          : t.guestDone.body.replace('{points}', String(earned)).replace('{money}', earnedMoney)}
      </p>

      {/* Girişsizde ANA eylem hesap açmak, kataloğa dönmek ikincil — tersi olsaydı teklif,
          yanından geçilen bir bağlantıya dönerdi. */}
      {!signedIn && !emptyDeck && earned > 0 && (
        <Link href="/login" className={buttonClass({ size: compact ? 'md' : 'lg' })}>
          {t.guestDone.cta}
        </Link>
      )}

      <Link
        href="/catalog"
        className={buttonClass({ variant: !signedIn && !emptyDeck && earned > 0 ? 'secondary' : 'primary', size: 'md' })}
      >
        {copy.catalog}
      </Link>

      {signedIn && !emptyDeck && (
        <Link href="/account" className="cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark">
          {t.done.balance}
        </Link>
      )}
    </div>
  );
}
