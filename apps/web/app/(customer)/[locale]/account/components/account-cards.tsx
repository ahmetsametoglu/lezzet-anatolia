'use client';

import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from '@/components/customer/cart/cart-context';
import type { AccountView } from '@/lib/account/read';
import type { Messages } from '../account-types';

/**
 * Hesap sayfasının kart ailesi — masaüstü ve mobil AYNI parçaları kullanır, yalnız ölçüleri ve
 * SIRALARI değişir (tasarım: web iki sütun, mobil tek sütun ve puan kartı en üstte).
 *
 * Her kart kendi başına bir bölümdür ve **bulunmayan veri için hiç çizilmez**: B2C'de şirket
 * bölümü, B2B'de puan bölümü DOM'da yoktur. Tasarımın açık kuralı bu — boş bir kart, olmayan bir
 * özelliği varmış gibi gösterir.
 */
export function Card({ compact, children }: { compact: boolean; children: ReactNode }) {
  return (
    <section className={['flex flex-col gap-3 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-3.5' : 'px-6.5 py-5.5'].join(' ')}>
      {children}
    </section>
  );
}

/** Kart başlığı + (varsa) sağdaki eylem bağlantısı. Künye notu mobilde düşer: satır zaten dar. */
export function CardHead({ title, compact, action, note }: { title: string; compact: boolean; action?: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {title}
        {note && !compact && <span className="ml-2 font-sans text-micro font-normal text-muted">{note}</span>}
      </span>
      {action}
    </div>
  );
}

/** Etiket ——— değer satırı (profil ve şirket künyesi). */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 font-sans text-body-sm">
      <span className="flex-none text-muted">{label}</span>
      <span className="min-w-0 truncate font-bold text-ink">{value}</span>
    </div>
  );
}

/**
 * İzin anahtarı. Tasarım "anında kaydedilir, ayrı kaydet yok" diyor — ama bugün yazacak kapı yok,
 * o yüzden anahtar gerçek izni GÖSTERİYOR, değiştirmiyor. Yanıltıcı değil: tıklanabilir görünmüyor.
 * BEKLEYEN(08.5): kampanya izni yazımı — anahtar okur, henüz yazmıyor.
 */
export function ConsentSwitch({ label, on, onLabel, offLabel }: { label: string; on: boolean; onLabel: string; offLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-body-sm text-ink">
        {label}
        <span className="sr-only"> — {on ? onLabel : offLabel}</span>
      </span>
      {/* `role="switch"` YOK: anahtar bugün yalnız GÖSTERİYOR, tıklanamıyor ve klavyeyle
          odaklanamıyor. O rolü vermek ekran okuyucuya çalışan bir denetim duyurmak olurdu
          (29.07 denetimi). Durum metinle de okunuyor. */}
      <span
        aria-hidden="true"
        className={['relative h-6.5 w-11.5 flex-none rounded-pill transition-colors', on ? 'bg-olive' : 'bg-sand-400'].join(' ')}
      >
        <span className={['absolute top-[3px] size-5 rounded-full bg-card transition-all', on ? 'right-[3px]' : 'left-[3px]'].join(' ')} />
      </span>
    </div>
  );
}

/**
 * Puan kartı — koyu blok (tasarım). **Yalnız B2C'de çizilir**: oyunlaştırma B2C-only bir karardır
 * (DOMAIN §14) ve B2B müşteriye puan göstermek olmayan bir hakkı ima ederdi.
 *
 * Eşik altındaysa düğme pasif ve KALAN puan yazılı — pasif bir düğmenin sebebi görünmelidir.
 */
export function PointsCard({
  t,
  locale,
  points,
  compact,
}: {
  t: Messages;
  locale: Locale;
  points: NonNullable<AccountView['points']>;
  compact: boolean;
}) {
  const { minimumPoints, valueCents } = points.redeem;
  const enough = points.balance >= minimumPoints;
  const rule = t.pointsRule.replace('{points}', String(minimumPoints)).replace('{amount}', formatPrice(valueCents, locale));

  /**
   * MOBİL YAPICA FARKLI ve bu tasarımın kararı: tek satır — solda başlık + kural, sağda rakam ve
   * küçük hap. İç panel ve "son kazanımlar" listesi mobilde YOK. Masaüstü kartını küçültüp
   * kullanmak improvise etmek olurdu (CLAUDE.md §3); dar ekranda dört satırlık bir döküm, bakılan
   * tek sayıyı (bakiye) aşağı itiyor.
   */
  if (compact) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-card bg-ink px-4 py-4 text-cream">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-serif text-card-title-sm leading-tight">{t.pointsTitle}</span>
          <span className="font-sans text-micro leading-relaxed text-neutral-400">{rule}</span>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <span className="font-sans text-page-title-sm font-bold text-olive-light">{points.balance}</span>
          <RedeemButton t={t} enough={enough} compact />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3.5 rounded-card bg-ink px-7 py-6 text-cream">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-h2-sm leading-tight">{t.pointsTitle}</span>
        <span className="font-sans text-h1-sm font-bold text-olive-light">{points.balance}</span>
      </div>

      {/* İç panel koyu kartın ÜSTÜNDE bir kademe açık. Ayrı bir gri token açmak yerine mevcut
          `cream` saydamla katmanlanıyor — palet değişirse burası da onunla değişir; Tailwind'in
          kendi `neutral-700`'ü ise soğuk ve paletimizin dışında (envanter §0, 29.07 denetimi). */}
      <div className="flex flex-col gap-1.5 rounded-soft bg-cream/10 px-4 py-3">
        <span className="font-sans text-note leading-relaxed font-semibold text-olive-light">
          {enough ? rule : `${t.pointsShort.replace('{missing}', String(minimumPoints - points.balance))} (${rule})`}
        </span>
        <RedeemButton t={t} enough={enough} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-sans text-note font-bold text-cream">{t.pointsRecent}</span>
        {points.history.length === 0 && <span className="font-sans text-note text-neutral-400">{t.pointsEmpty}</span>}
        {points.history.map((entry) => (
          <div key={entry.id} className="flex items-baseline justify-between gap-3 font-sans text-note text-neutral-400">
            <span className="min-w-0 truncate">{entry.reason}</span>
            {/* İşaret RENKTEN de okunur: kazanım açık yeşil, harcama sıcak ton. */}
            <span className={['flex-none font-bold', entry.points >= 0 ? 'text-olive-light' : 'text-terracotta-line'].join(' ')}>
              {entry.points >= 0 ? '+' : '\u2212'}
              {Math.abs(entry.points)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * BEKLEYEN(17.5): puanı kupona çevirme akışı — kapı hazır (`redeemPoints`), onay diyaloğu ve
 * "Kuponlarım" listesi bekliyor. Eşik altında düğme zaten pasif olacaktı; şimdilik her hâlde pasif
 * ve sebebi yazılı.
 */
function RedeemButton({ t, enough, compact = false }: { t: Messages; enough: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title={enough ? undefined : t.pointsRedeem}
      className={[
        'cursor-not-allowed rounded-pill bg-cream/10 font-sans font-bold text-cream/45',
        compact ? 'px-3.5 py-2 text-micro' : 'px-4 py-2.5 text-note',
      ].join(' ')}
    >
      {t.pointsRedeem} · {t.soon}
    </button>
  );
}

/**
 * Sonraya kaydedilenler — **sepetteki listeyle AYNI veri**, ikinci bir yer yok (tasarım kuralı).
 * "Sepete al" kalemi güncel fiyatla sepete taşır ve listeden düşer; taşımayı sepet bağlamı yapar,
 * bu bileşenin kendi listesi yoktur.
 */
export function SavedList({ t, locale, saved, compact }: { t: Messages; locale: Locale; saved: AccountView['saved']; compact: boolean }) {
  const { restoreToCart } = useCart();
  return (
    <div className="flex flex-col gap-2">
      {saved.length === 0 && <span className="font-sans text-note text-muted">{t.savedEmpty}</span>}
      {saved.map((line) => (
        <div
          key={line.kind === 'bundle' ? line.bundleId : line.variantId}
          className="flex items-center justify-between gap-3 rounded-soft border border-sand-200 bg-cream px-3.5 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-sans text-note font-bold text-ink">
              {line.name}
              {line.unitLabel && ` · ${line.unitLabel}`}
            </span>
            <span className="font-sans text-micro text-muted">
              {!line.shippable && `${t.routeOnly} · `}
              {line.unitPriceCents === null ? '—' : formatPrice(line.unitPriceCents, locale)}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              restoreToCart(
                line.kind === 'bundle'
                  ? { kind: 'bundle', bundleId: line.bundleId }
                  : { kind: 'variant', variantId: line.variantId, stockId: line.stockId },
              )
            }
            className={['flex-none cursor-pointer font-sans font-bold text-olive transition-colors hover:text-olive-dark', compact ? 'text-micro' : 'text-note'].join(' ')}
          >
            {t.savedAdd}
          </button>
        </div>
      ))}
    </div>
  );
}

