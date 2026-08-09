/**
 * Yükleme iskeleti — envanterin "yükleniyor (iskelet)" hâli (Katalog kartı örneği).
 *
 * Künye oradan: çubuk `kum-100` zemin, yarıçap `6px`; görsel alanı için `kum-100 → kum-50 → kum-100`
 * yatay geçiş. (Tasarımın ara durağı `#f7f2e4` envanterde bir aile tonu değil; en yakın kademe
 * `kum-50` alındı — ham hex yasağı, envanter §0.)
 *
 * **Neden boş kutu değil.** Veri istemcide çözülen her ekranda (sepet, checkout özeti) bir ilk kare
 * var ve orası ya boş bırakılıyor ya da yanlış bir "boş durum" çiziyordu. İkisi de yanlış cevap:
 * boşluk sayfanın bittiğini, "sepetiniz boş" ise verinin olmadığını söyler. İskelet üçüncü ve doğru
 * cevabı verir — **birazdan burada bir şey olacak** — ve gelen içerikle aynı yeri kapladığı için
 * sayfa altına doğru zıplamaz.
 *
 * `animate-pulse` bilinçli olarak ÇOK sönük: iskelet bir bekleme göstergesidir, ekranın ilgi
 * merkezi değil.
 */
import { cardClass } from './card';
import { LoadingRegion } from '@/components/loading-region';

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={['block animate-pulse rounded-[6px] bg-sand-100', className].join(' ')} aria-hidden="true" />;
}

/** Görsel/blok alanı iskeleti — çubuktan farkı yatay geçiş taşıması (envanter: kart görseli). */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <span
      className={['block animate-pulse rounded-soft bg-gradient-to-r from-sand-100 via-sand-50 to-sand-100', className].join(' ')}
      aria-hidden="true"
    />
  );
}

/**
 * Yükleniyor bölgesinin ERİŞİLEBİLİR sarmalayıcısı — **artık kendi gövdesi yok** (10.08).
 *
 * `components/loading-region.tsx` aynı işi yapıyordu (`role="status"` + `aria-busy` + `aria-label`)
 * ve o dosyanın künyesindeki `BEKLEYEN(08.11)` bunu zaten söylüyordu: *"müşteri kitindeki
 * `SkeletonRegion` de buna bağlanacak — bugün kendi kopyası var."* İşaret bu şeridi bekliyordu,
 * çünkü dosyalar bu yüzeyin.
 *
 * Kopyanın taşıdığı gerçek risk erişilebilirlikti: iki sarmalayıcıdan biri gün gelip `role`ünü ya da
 * `aria-busy`sini değiştirse, ekran okuyucu bazı sayfalarda yüklemeyi duyurur bazılarında duyurmaz —
 * ve bunu **yalnız ekran okuyucu kullanan biri** fark eder. Sessiz ayrışmanın en pahalı türü.
 *
 * Ad korunuyor: dört çağıran (`cart` ve `checkout` iskeletleri) `Skeleton*` ailesini tek yerden
 * okuyor ve `LoadingRegion` adını oraya taşımak, iskelet kitinin dışına çıkan bir import zinciri
 * kurardı. Aynı gerekçeyle yeniden ihraç değil sarmalayıcı: `className` kaçışı burada gerekmiyor
 * (o kaçış operasyon rotalarının flex zinciri içindir, künyesi orada).
 */
export function SkeletonRegion({ label, children }: { label?: string; children: React.ReactNode }) {
  return <LoadingRegion label={label}>{children}</LoadingRegion>;
}

/**
 * Kart iskeleti — vitrindeki kart ailesiyle AYNI kabuk (`bg-card`, `kum-200` kenar, `radius 18`).
 *
 * Bir kutu daha yazmak yerine burada durması bilinçli: iskeletin gelen içerikle aynı kabuğu
 * paylaşması gerekiyor, yoksa yükleme bitince kart görünüp kaybolan bir çerçeve gibi sıçrıyor.
 * Sayfalar yalnız İÇİNİ tarif eder.
 */
export function SkeletonCard({ compact = false, className = '', children }: { compact?: boolean; className?: string; children: React.ReactNode }) {
  // Kabuk `cardClass`tan gelir — künyenin "aynı kabuğu paylaşmalı" sözü ancak böyle tutulur (M2).
  // Elle yazıldığı sürece tutulmuyordu: iskelet `px-6.5`, yerini tuttuğu checkout özeti `px-6` idi
  // ve içerik gelince kart 4 px kayıyordu.
  return <div className={cardClass({ compact, className })}>{children}</div>;
}

/**
 * Metin bloğu iskeleti — `lines` satır, sonuncusu KISA.
 *
 * Son satırın kısalığı küçük ama önemli: eşit uzunlukta çubuklar tablo gibi okunuyor, kısalan son
 * satır ise paragraf gibi. İskeletin işi "burada ne gelecek" sorusuna cevap vermek.
 */
export function SkeletonText({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={['flex flex-col gap-2', className].join(' ')}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={['h-3', i === lines - 1 ? 'w-2/5' : 'w-full'].join(' ')} />
      ))}
    </div>
  );
}
