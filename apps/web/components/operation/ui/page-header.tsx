'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { UserRole } from '@lezzet/types';
import { signOutAction } from '@/lib/auth/actions';
import { AnchoredMenu } from './anchored-menu';
import { CONTROL_H, CONTROL_SQUARE } from './control';
import { SearchInput } from './search-input';
import { CommandPalette, useCommandPaletteShortcut } from './command-palette';
import { useOpsShell } from './ops-shell';
import { roleText } from './ops-nav';
import { SearchIcon } from './icons';
import { WarehouseContextPicker } from './warehouse-context-picker';

/**
 * Operasyon sayfa başlık barı (09.19) — **her ekranın paylaştığı TEK üst bant**.
 *
 * ── NEYİ BİRLEŞTİRDİ ─────────────────────────────────────────────────────────
 * Envanter çıkarıldığında bar üç ayrı yerde yaşıyordu: `PageHeader`ın serbest yuvası, `Tabs`ın
 * aksiyon yuvası, ve mobilde üç ekranın elden yazdığı `<div>`ler (farklı yükseklik, farklı yazı
 * kademesi). Bir de tasarım sisteminde başlık barının **numarası yoktu** (`O1` ray, `O2` sekme,
 * `O3` süzgeç var — bar yok), yani ortak bir tanım hiç yapılmamıştı. Bu komponent o tanımdır.
 *
 * ── ÜÇ BLOK, ÜÇ SAHİP ────────────────────────────────────────────────────────
 * 1. **Kimlik** (`title` + `subtitle`) — sayfanın. Alt satır bir slogan değil SAYI: ekranın o an ne
 *    durumda olduğunu söyler ("12 sipariş yolda — kabul bekliyor"). Boş kalabilir; boşken bar
 *    yüksekliği DEĞİŞMEZ, yoksa ekranlar arası geçişte içerik zıplar.
 * 2. **Ekran işleri** (`search` + `actions`) — yine sayfanın. Buraya EKRAN çapında olanlar konur;
 *    sekmeye bağlı kontroller `Tabs`ın `action` yuvasında kalır ve bu bilinçli: orada neden ile
 *    sonuç yan yana durur (ürün ekranında arama her sekmede ÜRÜNDE arıyordu, düğme de neyi
 *    yarattığını belirleyen sekmeden uzaktaydı).
 * 3. **Kabuk** (depo bağlamı · ⌘K · kullanıcı) — sayfanın DEĞİL, oturumun. Bağlamdan gelir
 *    (`useOpsShell`), sayfa bunları hiç bilmez. Üçü de sol raydan devralındı (kullanıcı kararı
 *    02.08: *"orası çok karmaşık ve dolu görünüyor"*) — ray artık yalnız "nereye gidiyorum"
 *    sorusuna kalıyor.
 *
 * ── BAR SAYFANIN İÇİNDE ÇİZİLİR, LAYOUT'TA DEĞİL ─────────────────────────────
 * Başlık ve aksiyonlar sayfaya ait; layout onları bilemez. Alternatif iki barı üst üste koymaktı
 * (üstte genel bloklar, altta başlık) — dikey alanı ikinci kez ödemek ve bu işin sebebinin tam
 * tersi. Kabuk blokları bu yüzden context'ten gelir.
 */
interface PageHeaderProps {
  title: string;
  /** Başlık altındaki özet/sayaç satırı (ör. "86 ürün · 3 aday"). */
  subtitle?: ReactNode;
  /**
   * Ekran araması — verilirse kutu çizilir. HER ekranda yoktur ve olmamalı: paketlerde aranacak
   * veri yok, teklif listesi kısa. Kutunun olmadığı yere kilitli bir kutu konmaz — "birazdan
   * çalışır" der ve yalandır.
   */
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  /**
   * Sayfanın HÂLİ — rozet(ler). Başlığın yanında durur, aksiyonların arasında DEĞİL.
   *
   * Ayrı bir yuva olmasının sebebi ölçülebilir bir arıza: rozetler bir tur `children`'a konmuştu ve
   * 36px'lik düğmelerin yanında ~21px kalıyorlardı (kullanıcı bildirimi, 02.08 — *"butonların yanına
   * denk gelmiş ve küçükler"*). Rozeti büyütmek YANLIŞ çözümdü: `Badge` bir tablo/kart öğesidir (O6,
   * 11px yazı) ve ölçüsü orada doğru — barda büyütmek her tablodaki rozeti de bozardı.
   *
   * Asıl mesele hizalama değil YER: rozet bir durumdur, kontrol değil. Kontrollerin arasında duran
   * tek tıklanmaz öğe, hem küçük hem yabancı görünür. Başlığın (24px) yanında ise doğal eşidir ve
   * "bu ekran şu hâlde" cümlesini başlıkla birlikte kurar.
   */
  status?: ReactNode;
  /** Ekran aksiyonları (+Yeni, araç düğmeleri). En fazla bir BİRİNCİL düğme — fazlası araç çubuğudur. */
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, status, search, children }: PageHeaderProps) {
  const shell = useOpsShell();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  // Kısayol kabuk varken dinlenir: operasyon dışında (hata ekranı) palet yok, dinleyici de olmasın.
  useCommandPaletteShortcut(shell ? openPalette : NOOP);

  return (
    <>
      <header
        className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4"
      >
        {/* Hamburger yok: operasyon web'i masaüstü-yalnız (06.08), ray hep görünür; mobil deneyim
            native uygulamada — `docs/uygulama`. */}
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate font-ops-display font-semibold text-ops-ink text-ops-title">{title}</h1>
            {/* Hâl rozetleri başlığın YANINDA: 24px başlık ile 21px rozet doğal bir eş. Daralmazlar
                (`flex-none`) — kısalması gereken şey uzun bir tesis adıdır, "Kapalı" değil. */}
            {status ? <span className="flex flex-none items-center gap-1.5">{status}</span> : null}
          </div>
          {subtitle ? <span className="font-ops-body text-ops-sm text-ops-muted">{subtitle}</span> : null}
        </div>

        {search ? (
          <SearchInput
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            size="md"
            className="w-[210px]"
          />
        ) : null}

        {children}

        {/* ── Kabuk blokları ── raydan devralındı; sayfa bunları bilmez. */}
        {shell ? (
          <div className="flex items-center gap-2.5 border-l border-ops-line-soft pl-2.5">
            <WarehouseContextPicker {...shell.warehouse} variant="bar" />
            <PaletteTrigger onOpen={openPalette} />
            <UserAvatar email={shell.user.email} roles={shell.user.roles} />
          </div>
        ) : null}
      </header>

      {shell ? (
        <CommandPalette roles={shell.user.roles} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      ) : null}
    </>
  );
}

const NOOP = () => {};

/**
 * ⌘K tetikleyicisi. Geniş ekranda kutu gibi görünür (kısayolu ÖĞRETİR — kimse denemeden bilmez),
 * dar ekranda tek düğmeye düşer: telefonda klavye kısayolu diye bir şey yok, kutu yalnız yer kaplardı.
 */
function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex ${CONTROL_H.md} cursor-pointer items-center gap-2 rounded-ops-btn border border-ops-gray-300 bg-ops-line px-2.5 text-ops-faint transition-colors hover:border-ops-olive hover:text-ops-olive`}
    >
      <SearchIcon />
      <span className="font-ops-body text-ops-sm">Ekrana git…</span>
      <kbd className="rounded border border-ops-line-strong px-1 font-ops-mono text-ops-micro">⌘K</kbd>
    </button>
  );
}

/**
 * Kullanıcı avatarı — barın **tek yuvarlak** öğesi.
 *
 * ── NEDEN AVATAR, NEDEN KÜNYE DEĞİL ─────────────────────────────────────────
 * Önce baş harf karesi + ad + rol sütunu vardı ve barın öteki kutularından ayırt edilemiyordu
 * (kullanıcı bildirimi, 02.08: *"normal bir komponent gibi görünüyor"*). Sorun boyut değil BİÇİM:
 * dikdörtgen + çerçeve + iki satır yazı, o bölgedeki her kontrolün tarifi. Avatar bu tarifin dışına
 * çıkıyor — **dolu daire**, barda başka hiçbir öğe yuvarlak değil. Göz onu aramadan buluyor.
 *
 * Ad ve rol SİLİNMEDİ, menüye taşındı: barda sürekli görünmesi gerekmiyor ("ben kimim" günde bir kez
 * sorulur), ama görünmez de olmamalı — paylaşılan bir tablette yanlış hesapla çalışmak gerçek bir hâl.
 *
 * ── MENÜ GERÇEK BİR İŞ YAPIYOR ──────────────────────────────────────────────
 * Yalnız kimliği göstermiyor: **operasyon yüzeyinde hiç çıkış yolu yoktu.** `signOutAction` müşteri
 * tarafında vardı, personel tarafında çağıranı yoktu — dükkândaki tablette biri açık oturumu kapatmak
 * isterse yapabileceği bir şey yoktu. Avatar o kapıya ev sahipliği yapıyor.
 */
function UserAvatar({ email, roles }: { email: string; roles: readonly UserRole[] }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const local = email.split('@')[0] || 'personel';
  const initials = local.slice(0, 2).toLocaleUpperCase('tr');
  const label = roleText(roles);

  const signOut = () => {
    setBusy(true);
    // Tam yenileme, yumuşak tazeleme DEĞİL (`signOutAction`'ın kendi notu): oturum sunucuda çözülüyor
    // ve istemcide o oturuma göre kurulmuş her durum sıfırdan kurulmalı.
    //
    // Hedef GİRİŞ SAYFASI DEĞİL, operasyon kökü: giriş yolu dile göre değişiyor (`/giris` · `/connexion`
    // · `/anmelden`) ve o eşlemeyi burada ikinci kez kurmak, bir gün ayrışan iki adres demekti.
    // Köke gitmek layout'un guard'ını çalıştırır; yönlendirme kararının tek sahibi zaten orası.
    void signOutAction().then(() => window.location.assign('/operations'));
  };

  return (
    <>
      <div ref={anchorRef} className="flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${local} · ${label}`}
          title={`${local} · ${label}`}
          className={[
            // Yuvarlak + dolu + halka: halka avatarı barın zemininden ayırıyor, koyu temada da
            // (zemin `ops-card`) kenar kaybolmuyor.
            'grid flex-none cursor-pointer place-items-center rounded-full bg-ops-olive font-ops-display font-semibold text-ops-card outline-none transition-all',
            'ring-2 ring-ops-olive-bg hover:ring-ops-olive-line',
            // Ölçü SÖZLÜKTEN (K9-1): barın öteki öğeleriyle aynı yükseklikte kalması bir tercih
            // değil, hizanın kendisi — elle yazılan `h-9`, sözlük değiştiği gün geride kalırdı.
            `${CONTROL_SQUARE.md} text-ops-sm`,
            open ? 'ring-ops-olive-line' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {initials}
        </button>
      </div>

      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={232}>
        <div className="flex flex-col gap-px border-b border-ops-line-soft px-3.5 py-2.5">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{local}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">{email}</span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{label}</span>
        </div>
        <button
          type="button"
          role="menuitem"
          onClick={signOut}
          disabled={busy}
          className="flex w-full cursor-pointer items-center px-3.5 py-2.5 text-left font-ops-body text-ops-sm text-ops-red transition-colors hover:bg-ops-red-bg disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? 'Çıkılıyor…' : 'Oturumu kapat'}
        </button>
      </AnchoredMenu>
    </>
  );
}
