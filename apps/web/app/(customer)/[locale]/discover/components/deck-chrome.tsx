'use client';

import { Link } from '@/i18n/navigation';
import type { Messages } from '../discover-types';

/**
 * Destenin ORTAK parçaları — iki cihaz görünümünün paylaştığı üç öğe.
 *
 * Ayrı dosyada çünkü ikisi de aynı şeyi söylüyor, yalnız farklı yere koyuyor: mobil başlıkta üç
 * satır (kapat · başlık+sayaç · puan çipi), web'de aynı üçlü tek satırda. Her görünüme kopyalansaydı
 * "puan çipi mi davet mi" kararı iki yerde yaşardı ve biri bir gün ötekinden ayrılırdı.
 */

/** Kapat — her an çıkılır (tasarım: "✕ Kapat"). Çıkış KATALOĞA: keşif bir sayfa değil bir turdur. */
export function CloseLink({ t }: { t: Messages }) {
  return (
    <Link href="/catalog" className="cursor-pointer font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark">
      ✕ {t.close}
    </Link>
  );
}

/**
 * Puan çipi ya da giriş daveti — **aynı köşe, iki farklı cümle** (tasarım "Girişsiz kullanıcı"
 * durumu). Girişliye kazandığı, girişsize kazanabileceği söylenir; ikisi de aynı yerde durur ki
 * girişsiz ekranda açıklanmamış bir boşluk kalmasın.
 *
 * Girişsizde çip değil KESİKLİ çerçeveli bir davet: dolu bir çip "kazandın" der, oysa henüz
 * kazanılmış bir şey yok — puan hesap açılınca yüklenecek.
 */
export function PointsChip({ t, earned, signedIn }: { t: Messages; earned: number; signedIn: boolean }) {
  if (signedIn) {
    return (
      <span className="rounded-pill bg-card px-3 py-1.5 font-sans text-note font-bold text-olive">
        {t.points.replace('{points}', String(earned))}
      </span>
    );
  }
  return (
    <Link
      href="/login"
      className="cursor-pointer rounded-soft border border-dashed border-olive-light bg-card px-3 py-1.5 font-sans text-micro font-semibold text-olive transition-colors hover:border-olive"
    >
      {t.guestInvite} → <span className="underline">{t.guestInviteCta}</span>
    </Link>
  );
}

/**
 * TEK karar düğmesi — kaydırmanın klavye/fare karşılığı (tasarım: 👎 sade, 👍 zeytin dolgu).
 *
 * **İkisi tek bileşende toplanmadı** çünkü iki cihazda YAPICA farklı duruyorlar: mobilde kartın
 * ALTINDA yan yana (aralarında "Atla" etiketi), web'de kartın İKİ YANINDA — yani aralarında kartın
 * kendisi var. Bir "düğme çifti" bileşeni web'i çizemezdi; dizilişi görünümler kurar, bu dosya
 * yalnız düğmenin kendisini tek yerde tutar.
 *
 * Beğen düğmesi bilerek DAHA BÜYÜK (tasarım: 76 ↔ 64 mobil, 72 ↔ 60 web): olumlu karar birincil
 * eylemdir, olumsuz olan cezasız bir geçiştir.
 */
export function VoteButton({
  t,
  kind,
  onVote,
  busy,
  compact,
}: {
  t: Messages;
  kind: 'like' | 'dislike';
  onVote: (vote: 'like' | 'dislike') => void;
  busy: boolean;
  compact: boolean;
}) {
  const like = kind === 'like';
  return (
    <button
      type="button"
      aria-label={like ? t.like : t.dislike}
      disabled={busy}
      onClick={() => onVote(kind)}
      className={[
        'grid flex-none cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        like
          ? 'bg-olive hover:bg-olive-dark'
          : 'border-2 border-sand-400 bg-card hover:border-olive',
        like
          ? compact
            ? 'size-19 text-[30px]'
            : 'size-18 text-icon'
          : compact
            ? 'size-16 text-icon'
            : 'size-15 text-icon-sm',
      ].join(' ')}
    >
      {like ? '👍' : '👎'}
    </button>
  );
}

/**
 * Mobilin karar satırı — 👎 · "Atla" · 👍 (tasarım).
 *
 * **Ortadaki "Atla" bir DÜĞME DEĞİL, etiket:** etkileşim sözleşmesi *"sola kaydırma 'geç'tir ve
 * cezasızdır; ayrı 'atla' düğmesi gerekmez, alt etiket bunu söyler"* diyor. Üçüncü bir düğme,
 * müşteriye ayırt edemeyeceği iki olumsuz seçenek sunardı. Web'de bu etiket hiç yok — orada
 * düğmeler kartın iki yanında ve aralarına yazı sığmıyor (tasarım da çizmiyor).
 */
export function VoteRow({ t, onVote, busy }: { t: Messages; onVote: (vote: 'like' | 'dislike') => void; busy: boolean }) {
  return (
    <div className="flex items-center justify-center gap-5.5">
      <VoteButton t={t} kind="dislike" onVote={onVote} busy={busy} compact />
      <span className="font-sans text-note font-bold text-muted">{t.skip}</span>
      <VoteButton t={t} kind="like" onVote={onVote} busy={busy} compact />
    </div>
  );
}
