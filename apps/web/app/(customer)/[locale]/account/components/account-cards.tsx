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
export function ConsentSwitch({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-body-sm text-ink">{label}</span>
      <span
        role="switch"
        aria-checked={on}
        aria-label={label}
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
  const enough = points.balance >= REDEEM_THRESHOLD;
  return (
    <section className={['flex flex-col gap-3.5 rounded-card bg-ink text-cream', compact ? 'px-4 py-4' : 'px-7 py-6'].join(' ')}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={['font-serif leading-tight', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.pointsTitle}</span>
        <span className={['font-sans font-bold text-olive-light', compact ? 'text-h2-sm' : 'text-page-title-sm'].join(' ')}>{points.balance}</span>
      </div>

      <div className="flex flex-col gap-1.5 rounded-soft bg-neutral-700 px-4 py-3">
        <span className="font-sans text-note leading-relaxed font-semibold text-olive-light">
          {enough
            ? t.pointsRule.replace('{points}', String(REDEEM_THRESHOLD)).replace('{amount}', formatPrice(REDEEM_VALUE_CENTS, locale))
            : t.pointsShort.replace('{missing}', String(REDEEM_THRESHOLD - points.balance))}
        </span>
        {/* BEKLEYEN(17.5): puanı kupona çevirme akışı — kapı hazır (`redeemPoints`), onay diyaloğu
            ve "Kuponlarım" listesi bekliyor. Eşik altında düğme zaten pasif olacaktı. */}
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-pill bg-neutral-600 px-4 py-2.5 font-sans text-note font-bold text-neutral-400"
        >
          {t.pointsRedeem} · {t.soon}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-sans text-note font-bold text-cream">{t.pointsRecent}</span>
        {points.history.length === 0 && <span className="font-sans text-note text-neutral-400">{t.pointsEmpty}</span>}
        {points.history.map((entry) => (
          <div key={entry.id} className="flex items-baseline justify-between gap-3 font-sans text-note text-neutral-400">
            <span className="min-w-0 truncate">{entry.reason}</span>
            {/* İşaret RENKTEN de okunur: kazanım açık yeşil, harcama terracotta. */}
            <span className={['flex-none font-bold', entry.points >= 0 ? 'text-olive-light' : 'text-terracotta-line'].join(' ')}>
              {entry.points >= 0 ? '+' : '−'}
              {Math.abs(entry.points)}
            </span>
          </div>
        ))}
      </div>
    </section>
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

/** Puan eşiği ve karşılığı — bugün sabit; 17.5 ayarı geldiğinde oradan okunacak. */
const REDEEM_THRESHOLD = 300;
const REDEEM_VALUE_CENTS = 500;
