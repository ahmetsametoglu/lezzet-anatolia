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
 * Yükleniyor bölgesinin ERİŞİLEBİLİR sarmalayıcısı. Ekran okuyucu için tek bir "yükleniyor" bildirimi
 * yeter; iskeletin kendisi `aria-hidden` çünkü onlarca boş çubuğu tek tek okutmanın anlamı yok.
 */
export function SkeletonRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
