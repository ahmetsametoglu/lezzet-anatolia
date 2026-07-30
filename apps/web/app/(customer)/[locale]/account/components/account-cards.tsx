'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from '@/components/customer/cart/cart-context';
import type { AccountView } from '@/lib/account/read';
import { cancelZoneNoticeAction, setConsentAction } from '../actions';
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
 * İzin anahtarı — **anında yazar, ayrı "Kaydet" yok** (tasarımın etkileşim sözleşmesi) ve kapatma
 * onay istemez: izni geri almak müşterinin en doğal hakkı, önüne diyalog koymak caydırmak olurdu.
 *
 * Bir süre yalnız OKUYORDU (yazacak kapı yoktu) ve o zaman `role="switch"` bilerek verilmemişti:
 * çalışmayan bir denetimi ekran okuyucuya "anahtar" diye duyurmak yanlıştı. Artık gerçekten
 * çalışıyor, rol de yerine geldi.
 *
 * **İyimser gösterim:** tıklama anında görünür, sunucu turu beklenmez — izin anahtarı bir onay
 * kutusu gibi davranmalı. Yazma düşerse eski hâle geri döner ve sebep yazılır; sessizce açık
 * kalması, müşteriye vermediği bir izni verdiğini düşündürürdü.
 */
export function ConsentSwitch({
  label,
  on,
  onLabel,
  offLabel,
  channel,
}: {
  label: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  channel: 'email' | 'whatsapp';
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
    const { error } = await setConsentAction(channel, next);
    setBusy(false);
    if (error) {
      setValue(!next);
      setFailed(true);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-body-sm text-ink">
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
 * "Hepsini sepete al" — kart başlığının sağındaki toplu eylem (tasarım).
 *
 * Satır başına taşımanın yanında durmasının sebebi pratik: listeye biriktiren müşteri genelde
 * hepsini birden alır ve tek tek basmak N tıklama demektir. Tek turda gider (`addMany`) — satır
 * satır çağırmak N sunucu turu olurdu ve arada biri düşerse liste yarım kalırdı.
 *
 * Alınamayan kalem SESSİZCE atlanır ama sayılır: uyarıyı sepet gösterir (`addSkipped`), çünkü bu
 * ekran taşımadan sonra da yerinde duruyor ve müşteri sepete gittiğinde eksiği orada okumalı.
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
 * Bekleyen bölge haberi — "şu posta koduna gelince haber verin" kayıtları.
 *
 * Pazarlama izinlerinden BAĞIMSIZ (tasarımın sözleşmesi) ve o anahtarlarla aynı kartta durmaz:
 * biri "bana kampanya yaz", bu ise tek seferlik bir bekleyiş. Tek eylemi vazgeçmektir; onay
 * istemez — kaydı silmek müşterinin kendi kararı ve geri alması da bir tık.
 *
 * Kayıt yoksa blok hiç çizilmez: "bekleyen kaydınız yok" satırı, olmayan bir şeyi anlatan gürültü.
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

