'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { useCart } from '@/components/customer/cart/cart-context';
import { Note } from '@/components/customer/phone-kit/note';
import { ToggleSwitch } from '@/components/customer/phone-kit/toggle-switch';
import type { AccountView } from '@/lib/account/read';
import { cancelZoneNoticeAction } from '../actions';
import type { Messages } from '../account-types';
import { RedeemPoints } from './redeem-points';

// Hesap sayfasının kart ailesi: bulunmayan veri için kart hiç çizilmez, çünkü boş kart olmayan bir özelliği varmış gibi gösterir.

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
 * İzin anahtarı anında ve iyimser yazar, kapatma onay istemez; izni geri almak müşterinin en doğal hakkıdır. Yazma düşerse eski
 * hâle döner ve sebep yazılır, yoksa müşteri vermediği bir izni vermiş sanırdı.
 */
export function ConsentSwitch({
  label,
  icon,
  on,
  onLabel,
  offLabel,
  onToggle,
  compact = false,
  failedText,
}: {
  label: string;
  /** Kanalın ikonu ikon setinden, boyutu çağıran verir; emoji çizgi ikonların yanında bozuk göründüğü için kullanılmaz. */
  icon?: ReactNode;
  on: boolean;
  onLabel: string;
  offLabel: string;
  /** Yazma eylemi çağıranın: aynı anahtar kampanya kanalı ve bildirim türü gibi farklı kapılara yazar, anahtar hangisi olduğunu bilmez. */
  onToggle: (next: boolean) => Promise<{ errorKey: string | null }>;
  /**
   * Telefon görünümü — native hesabın kampanya satırı (etiket `control` · 600, native anahtar 50×30,
   * 12 dikey dolgu, ikon yok). Yazma düşerse halka yerine satırın ALTINDA `failedText` söylenir
   * (native'in notu).
   */
  compact?: boolean;
  failedText?: string;
}) {
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Sunucu tazelendiğinde (başka bir sekme, başka bir eylem) gelen gerçek değeri izler.
  useEffect(() => setValue(on), [on]);

  const toggle = async () => {
    const next = !value;
    setValue(next);
    setBusy(true);
    setFailed(false);
    const { errorKey } = await onToggle(next);
    setBusy(false);
    if (errorKey) {
      setValue(!next);
      setFailed(true);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="font-sans text-control font-semibold text-ink">{label}</span>
          {/* Native anahtarın pasif hâli yok: yazma sürerken ikinci basış kesilir, iyimser değer yerinde kalır. */}
          <ToggleSwitch
            checked={value}
            label={label}
            onChange={() => {
              if (!busy) void toggle();
            }}
          />
        </div>
        {failed && failedText !== undefined && <Note tone="terracotta" description={failedText} />}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 font-sans text-body-sm text-ink">
        {icon}
        {label}
        <span className="sr-only"> — {value ? onLabel : offLabel}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={busy}
        onClick={() => void toggle()}
        className={[
          'relative h-6.5 w-11.5 flex-none cursor-pointer rounded-pill transition-colors disabled:cursor-progress',
          value ? 'bg-olive' : 'bg-sand-400',
          failed ? 'ring-2 ring-terracotta' : '',
        ].join(' ')}
      >
        <span className={['absolute top-[3px] size-5 rounded-full bg-card transition-all', value ? 'right-[3px]' : 'left-[3px]'].join(' ')} />
      </button>
    </div>
  );
}

/** Eksi işaretli ödülün ters etiketi; yalnız iki sebepte var, ötekilere uydurmak olmayan bir olayı adlandırmak olurdu. */
function reversedReasonLabel(t: Messages, reason: string, points: number): string | undefined {
  if (points >= 0) return undefined;
  return reason === 'neighbor' || reason === 'referral' ? t.pointsReasonReversed[reason] : undefined;
}

/** Puan kartı yalnız B2C'de çizilir; eşik altındaysa düğme pasif ve kalan puan yazılı, çünkü pasif düğmenin sebebi görünmeli. */
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
   * Mobil kart tasarım gereği tek satır: solda başlık ve kural, sağda rakam ve küçük hap. İç panel ve son kazanımlar mobilde yok,
   * çünkü dar ekranda döküm bakılan tek sayıyı (bakiye) aşağı iterdi.
   */
  if (compact) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-card bg-ink px-4 py-4 text-cream">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-serif text-card-title-sm leading-tight">{t.pointsTitle}</span>
          <span className="font-sans text-micro leading-relaxed text-neutral-400">{rule}</span>
          {/* Tam döküm ayrı sayfada; mobil kart döküm taşımaz, yol buradan. */}
          <Link href="/account/points" className="cursor-pointer font-sans text-micro font-semibold text-olive-light hover:text-cream">
            {t.pointsHistoryLink}
          </Link>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          <span className="font-sans text-page-title-sm font-bold text-olive-light">{points.balance}</span>
          <RedeemPoints t={t} locale={locale} amount={points.nextRedeem} enough={enough} compact />
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
        <RedeemPoints t={t} locale={locale} amount={points.nextRedeem} enough={enough} />
      </div>

      {/* Bekleyen komşu ödülü deftere karışmaz, çünkü defter olanı tutar; puan sayısı bilinmiyorsa blok çizilmez, bilinmeyen sayıyla söz verilmez. */}
      {points.pendingNeighborAwards.length > 0 && points.neighborPoints !== null && (
        <div className="flex flex-col gap-1.5 rounded-soft bg-cream/10 px-4 py-3">
          <span className="font-sans text-note font-bold text-cream">{t.pointsPendingTitle}</span>
          {points.pendingNeighborAwards.map((award, i) => (
            <span key={`${award.neighborName}-${award.deliveryDate}-${i}`} className="font-sans text-note leading-relaxed text-neutral-400">
              {t.pointsPendingRow.replace('{name}', award.neighborName).replace('{points}', String(points.neighborPoints))}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-sans text-note font-bold text-cream">{t.pointsRecent}</span>
        {points.history.length === 0 && <span className="font-sans text-note text-neutral-400">{t.pointsEmpty}</span>}
        {points.history.map((entry) => (
          <div key={entry.id} className="flex items-baseline justify-between gap-3 font-sans text-note text-neutral-400">
            {/* Sebep MÜŞTERİ CÜMLESİNE çevrilir — burada `entry.reason` HAM basılıyordu ve Fransız
                müşteri hesap sayfasında `feedback_candidate` okuyordu (mobil şeridin ölçümü, 15.08).
                Gözden kaçmasının sebebi de kayıtlı: liste yalnız masaüstü kartta çiziliyor ve yalnız
                puan hareketi olan hesapta doluyor.

                Bilinmeyen sebep ham dizeye DÜŞER, boş bırakılmaz: defter yeni bir sebep öğrendiğinde
                satırın kendisi kaybolmamalı — eksik olan çeviridir, hareket değil. Müşterinin gördüğü
                tuhaf bir kelime, kaybolmuş bir puan hareketinden iyidir.

                Eksi işaretli ÖDÜL ters etiket alır ("… — iptal edildi"): iptal aynı sebeple ve ters
                işaretle yazılır (★ karar 7d), ham adıyla basılsa müşteri aynı satırı hem +100 hem
                −100 görürdü. Yalnız neighbor/referral: redemption doğası gereği eksi ("Kupona
                çevrildi"), manual iki yönlü — ikisine ters etiket uydurmak olmayan olayı adlandırmak. */}
            <span className="min-w-0 truncate">{reversedReasonLabel(t, entry.reason, entry.points) ?? t.pointsReason[entry.reason] ?? entry.reason}</span>
            {/* İşaret RENKTEN de okunur: kazanım açık yeşil, harcama sıcak ton. */}
            <span className={['flex-none font-bold', entry.points >= 0 ? 'text-olive-light' : 'text-terracotta-line'].join(' ')}>
              {entry.points >= 0 ? '+' : '\u2212'}
              {Math.abs(entry.points)}
            </span>
          </div>
        ))}
        {/* Tam döküm ayrı sayfada: kart yalnız son hareketleri taşır, gerisi sayfalıdır. */}
        <Link href="/account/points" className="cursor-pointer pt-0.5 font-sans text-note font-semibold text-olive-light hover:text-cream">
          {t.pointsHistoryLink}
        </Link>
      </div>
    </section>
  );
}

/**
 * Davet kartı; bağlantı adresi application'dan gelir, ekran adres kurmaz. İki alan da yoksa kart çizilmez: bağlantısız davet
 * basılamayan bir düğme, puanı bilinmeyen davet tutulamayacak bir söz olurdu.
 */
export function InviteCard({ t, points, compact }: { t: Messages; points: NonNullable<AccountView['points']>; compact: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!points.inviteUrl || points.referralPoints === null) return null;
  const url = points.inviteUrl;

  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className={['flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-7 py-6'].join(' ')}>
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.inviteTitle}</span>
      <p className="font-sans text-note leading-relaxed text-body">{t.inviteBody.replace('{points}', String(points.referralPoints))}</p>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-soft border border-sand-200 bg-cream px-3 py-2 font-sans text-note text-muted">{url}</span>
        <button type="button" onClick={copy} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-none whitespace-nowrap' })}>
          {copied ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={14} />
              {t.inviteCopied}
            </span>
          ) : (
            t.inviteCopy
          )}
        </button>
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
      {/* Kaydedilenler sepetle AYNI veridir; taşıma da aynı kapıdan geçer (`restoreToCart`).
          İkinci bir yol yazmak, aynı listenin iki farklı biçimde boşalabildiği bir sistem olurdu. */}
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

/**
 * "Hepsini sepete al": biriktiren müşteri genelde hepsini birden alır; tek turda gider ki yarım liste kalmasın. Alınamayan kalem
 * atlanır ve sayılır, uyarıyı sepet gösterir.
 */
export function SavedAddAll({ label, saved }: { label: string; saved: AccountView['saved'] }) {
  const { addMany } = useCart();
  const [sent, setSent] = useState(false);

  const addable = saved.filter((line) => !line.blocked);
  // Alınabilir kalem yoksa düğme hiç çizilmez: basıldığında hiçbir şey yapmayan bir eylem,
  // bozuk bir eylemdir.
  if (addable.length === 0) return null;

  return (
    <button
      type="button"
      disabled={sent}
      onClick={() => {
        setSent(true);
        addMany(
          addable.map((line) =>
            line.kind === 'bundle'
              ? { kind: 'bundle' as const, bundleId: line.bundleId, qty: line.qty }
              : { kind: 'variant' as const, variantId: line.variantId, qty: line.qty, stockId: line.stockId },
          ),
          saved.length - addable.length,
        );
      }}
      className="flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark disabled:cursor-not-allowed disabled:text-muted"
    >
      {label}
    </button>
  );
}

/**
 * Bekleyen bölge haberi kayıtları; pazarlama izninden bağımsız tek seferlik bir bekleyiştir, vazgeçmek onay istemez. Kayıt
 * yoksa blok çizilmez.
 */
export function ZoneNoticeList({ t, notices }: { t: Messages; notices: AccountView['zoneNotices'] }) {
  const [busy, setBusy] = useState<string | null>(null);

  if (notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-sand-100 pt-2.5">
      <span className="font-sans text-body-sm font-bold text-ink">{t.zoneNoticeTitle}</span>
      {notices.map((notice) => (
        <div key={notice.postalCode} className="flex items-center justify-between gap-3">
          <span className="font-sans text-note text-body">{t.zoneNoticeWaiting.replace('{code}', notice.postalCode)}</span>
          <button
            type="button"
            disabled={busy === notice.postalCode}
            onClick={async () => {
              setBusy(notice.postalCode);
              await cancelZoneNoticeAction(notice.postalCode);
              setBusy(null);
            }}
            className="flex-none cursor-pointer font-sans text-note font-bold text-muted transition-colors hover:text-terracotta disabled:cursor-progress"
          >
            {t.zoneNoticeCancel}
          </button>
        </div>
      ))}
    </div>
  );
}

