import type { ReactNode } from 'react';

/**
 * Yükleniyor bölgesinin ERİŞİLEBİLİR sarmalayıcısı — iki yüzeyin PAYLAŞTIĞI tek parça.
 *
 * Burada, `customer/` ya da `operation/` altında değil, çünkü hiç stil taşımıyor: yalnız ARIA. İskeletin
 * geri kalanı palet bağımlıdır (müşteri `kum-*`, operasyon `ops-*` + karanlık mod) ve o yüzden iki ayrı
 * set hâlinde yaşar — butonda, rozette, girdide olduğu gibi. Ama "yükleniyor" bildirimi bir renk kararı
 * değil, bir erişilebilirlik kuralıdır ve iki kez yazılması onun iki farklı davranmasına yol açardı.
 *
 * Ekran okuyucuya TEK bildirim yeter; iskelet çubuklarının kendisi `aria-hidden` çünkü onlarca boş
 * çubuğu tek tek okutmak gürültüdür.
 *
 * `label` isteğe bağlı: rota düzeyindeki yüklemede sayfanın adı henüz elimizde olmayabilir (dil bağlamı
 * kurulmadan çizilir). `role="status"` + `aria-busy` tek başına da yeter.
 *
 * **Müşteri kitindeki `SkeletonRegion` buraya bağlandı** (10.08 · 08.37): iki sarmalayıcı aynı işi
 * yapıyordu ve biri gün gelip `role`ünü ya da `aria-busy`sini değiştirse ekran okuyucu bazı
 * sayfalarda yüklemeyi duyurur bazılarında duyurmazdı — yalnız ekran okuyucu kullanan birinin fark
 * edeceği bir ayrışma. `SkeletonRegion` adı korundu (iskelet kiti tek yerden okunuyor), gövdesi
 * artık burası.
 */
/**
 * `className` İSTEĞE BAĞLI DEĞİL, ZORUNLU BİR KAÇIŞ: sarmalayıcı sınıfsız düz bir `div` olarak
 * yazılmıştı ve **beş operasyon rotasının iskeletini birden bozuyordu.**
 *
 * Sebep flex zinciri: `(operations)/layout.tsx` panelini `<main className="flex min-w-0 flex-1
 * flex-col">` diye açıyor ve rota iskeletleri de kendi kabuklarını `flex min-h-0 flex-1 flex-col`
 * ile veriyor. Araya sınıfsız bir blok girince o `flex-1` artık bir flex-item üzerinde değil, yani
 * SESSİZCE yok sayılıyor — iskelet kabuğu içerik yüksekliğinde kalıyor, zemin paneli kaplamıyor,
 * yan panelli ekranlarda ızgara yüksekliğini kaybediyor ve gerçek sayfa gelince ekran tam yüksekliğe
 * sıçrıyor. Tam da iskeletin önlemesi gereken şey.
 *
 * Bu yüzden sarmalayıcı KENDİ kabuğunu taşır: rota dosyaları ayrı bir dış `div` açmaz, sınıflarını
 * buraya verir. Bir eleman eksik, zincir bütün.
 */
export function LoadingRegion({
  label,
  className = '',
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}
