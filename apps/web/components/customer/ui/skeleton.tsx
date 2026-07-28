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
export function SkeletonRegion({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    // `label` isteğe bağlı: rota düzeyindeki yüklemede sayfanın adı henüz elimizde olmayabilir
    // (dil bağlamı kurulmadan çizilir). `role="status"` + `aria-busy` tek başına da yeter.
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * Kart iskeleti — vitrindeki kart ailesiyle AYNI kabuk (`bg-card`, `kum-200` kenar, `radius 18`).
 *
 * Bir kutu daha yazmak yerine burada durması bilinçli: iskeletin gelen içerikle aynı kabuğu
 * paylaşması gerekiyor, yoksa yükleme bitince kart görünüp kaybolan bir çerçeve gibi sıçrıyor.
 * Sayfalar yalnız İÇİNİ tarif eder.
 */
export function SkeletonCard({ compact = false, className = '', children }: { compact?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={['flex flex-col gap-3 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-6.5 py-5.5', className].join(' ')}>
      {children}
    </div>
  );
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
