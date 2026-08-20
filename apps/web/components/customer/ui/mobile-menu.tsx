'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { useAccount } from '@/components/customer/account/account-context';
import { useSignOut } from '@/components/customer/account/use-sign-out.hook';
import accountMessages from '@/components/customer/account/account-messages.json';
import { Dialog } from './dialog';
import { LocaleLinks } from './locale-switch';
import messages from './site-frame-messages.json';

/**
 * Mobil menü — başlıktaki `☰`'nin açtığı panel (03.08).
 *
 * **Neden yazıldı:** `☰` handler'sız bir `<span>`ti ve mobil başlıkta `AccountEntry` hiç monte
 * olmuyordu (yalnız masaüstü dalında). Sonuç bir çıkmazdı: mobil müşteri kataloğa ancak anasayfadaki
 * çağrıdan gidebiliyor, hesabına hiçbir yerden ulaşamıyor ve **girişliyse çıkış yapamıyordu**.
 * Paylaşılan bir telefonda oturumu kapatmanın tek yolu checkout'un "siz değil misiniz" satırıydı —
 * yani müşteri, çıkmak için ödeme akışına girmek zorundaydı.
 *
 * **Tasarım menüyü SÖYLÜYOR, çizmiyor.** Envanter (`Komponent Envanteri - Musteri.dc.html:419`)
 * *"Mobil: menü + logo + sepet"* diyor; menünün açıldığında ne olduğu hiçbir `.dc.html`'de yok.
 * Bu yüzden içerik uydurulmadı, **masaüstü başlığının taşıdıklarından türetildi**: gezinme + dil +
 * hesap. Mobilde eksik olan tam olarak o üçüydü. Görsel yerleştirme açığı `design/BACKLOG §4`'te.
 *
 * **Kabuk paylaşılan `Dialog`:** ikinci bir örtü/Escape/odak tuzağı yazmak, az önce kapattığımız
 * kopya sınıfını geri açardı (K3). Çekmece yerine ortalanmış panel: dar ekranda ikisi de ekranı
 * dolduruyor, ama `Dialog` kapanma sözleşmesini ve gövde kaydırma kilidini hazır getiriyor.
 *
 * **Açılmamış rotalar burada da düz METİN kalır** (Fırsatlar · Keşif · Professionnels), masaüstünde
 * olduğu gibi: menüde tıklanabilir görünüp hiçbir yere gitmeyen bir satır, ölü bağdan beterdir —
 * müşteri kendi dokunuşunu suçlar.
 */
/**
 * Gezinme anahtarları — iki biçimin (masaüstü şeridi · bu panel) ortak kümesi. `home` yalnız
 * panelde bir SATIR olarak çizilir: masaüstünde o işi logo görür, mobilde logo bağını kimse
 * keşfetmiyordu (kullanıcı bulgusu 20.08 — "ana sayfaya menüden dönemiyoruz").
 */
export type NavKey = 'home' | 'catalog' | 'packages' | 'recipes' | 'discover' | 'pro';

interface MobileMenuProps {
  locale: Locale;
  /** Açık sayfanın anahtarı — K12 kuralı ("aktif bağlantı yeşil + altı çizili") panelde de geçerli. */
  activeNav?: NavKey;
}

export function MobileMenu({ locale, activeNav }: MobileMenuProps) {
  const t = messages[locale];
  const ta = accountMessages[locale];
  const account = useAccount();
  const { busy, signOut } = useSignOut();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.menu}
        aria-expanded={open}
        // Dokunma hedefi 44px (envanter: "Mobil dokunma hedefleri en az 44px"). Glif küçük kalır,
        // basılabilir alan büyür — `-ml-2.5` ile logo hizası korunur, kutu görsel olarak taşmaz.
        className="-ml-2.5 flex size-11 cursor-pointer items-center justify-center font-sans text-icon-sm font-bold text-ink"
      >
        ☰
      </button>

      {open && (
        <Dialog title={t.menu} closeLabel={t.close} onClose={close}>
          <nav className="flex flex-col">
            <Link href="/" onClick={close} className={itemClass('home', activeNav)} aria-current={activeNav === 'home' ? 'page' : undefined}>
              <span className={labelClass('home', activeNav)}>{t.nav.home}</span>
            </Link>
            <Link href="/catalog" onClick={close} className={itemClass('catalog', activeNav)} aria-current={activeNav === 'catalog' ? 'page' : undefined}>
              <span className={labelClass('catalog', activeNav)}>{t.nav.catalog}</span>
            </Link>
            <Link href="/packages" onClick={close} className={itemClass('packages', activeNav)} aria-current={activeNav === 'packages' ? 'page' : undefined}>
              <span className={labelClass('packages', activeNav)}>{t.nav.packages}</span>
            </Link>
            {/* Sıra masaüstüyle AYNI (08.24): aynı menünün iki biçimi aynı düzeni göstermeli. */}
            <Link href="/recipes" onClick={close} className={itemClass('recipes', activeNav)} aria-current={activeNav === 'recipes' ? 'page' : undefined}>
              <span className={labelClass('recipes', activeNav)}>{t.nav.recipes}</span>
            </Link>
            {/* "Fırsatlar" burada da YOK (kullanıcı kararı 09.08, masaüstü menüsüyle birlikte):
                katalogun teklif süzgeçli hâliydi, yani menüde kataloğun kopyası duruyordu. Aynı
                menünün iki biçimi ayrışmamalı — masaüstünden düşen öğe mobilde de düşer. */}
            <Link href="/discover" onClick={close} className={itemClass('discover', activeNav)} aria-current={activeNav === 'discover' ? 'page' : undefined}>
              <span className={labelClass('discover', activeNav)}>{t.nav.discover}</span>
            </Link>
            <Link href="/professionals" onClick={close} className={itemClass('pro', activeNav)} aria-current={activeNav === 'pro' ? 'page' : undefined}>
              <span className={labelClass('pro', activeNav)}>{t.nav.pro}</span>
            </Link>
          </nav>

          {/* Hesap bölümü ayrı bir blok: gezinme "nereye gideyim", bu "kim olarak". */}
          <div className="flex flex-col border-t border-sand-100 pt-2">
            {account ? (
              <>
                <span className="truncate px-1 pt-1 pb-2 font-sans text-micro text-muted">{account.email}</span>
                <Link href="/account" onClick={close} className={ITEM}>
                  {t.accountNav.account}
                </Link>
                <Link href="/orders" onClick={close} className={ITEM}>
                  {t.accountNav.orders}
                </Link>
                <Link href="/support" onClick={close} className={ITEM}>
                  {t.accountNav.support}
                </Link>
                {/* Mobilde çıkışın TEK yolu burası; ayrı renkte durması da bu yüzden. */}
                <button type="button" disabled={busy} onClick={() => void signOut()} className={`${ITEM} text-left text-terracotta disabled:opacity-60`}>
                  {ta.signOut}
                </button>
              </>
            ) : (
              <Link href="/login" onClick={close} className={ITEM}>
                {ta.signIn}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-sand-100 pt-3 font-sans text-body-sm font-semibold text-muted">
            <span className="text-micro">{t.footer.language}</span>
            <LocaleLinks locale={locale} className="cursor-pointer transition-colors hover:text-olive" onNavigate={close} />
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Menü satırı — dokunma hedefi `min-h-11` (44px), envanterin mobil kuralı. */
const ITEM = 'flex min-h-11 items-center rounded-soft px-1 font-sans text-body font-semibold text-ink transition-colors hover:text-olive';

/** Aktif satır zeytin metin (K12); satır ölçüsü değişmez, yalnız renk döner. */
const itemClass = (key: NavKey, active: NavKey | undefined) => [ITEM, active === key ? 'text-olive' : ''].filter(Boolean).join(' ');

/**
 * K12'nin alt çizgisi masaüstüyle AYNI mekanikle: çizgi HER etikette var, aktif olmayanda şeffaf
 * (`site-frame` `navClass` künyesi — yalnız aktife verilse satır 2px oynar).
 */
const labelClass = (key: NavKey, active: NavKey | undefined) => ['border-b-2 pb-0.5', active === key ? 'border-olive' : 'border-transparent'].join(' ');
