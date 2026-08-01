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
 * BEKLEYEN(08.11): müşteri kitindeki `SkeletonRegion` de buna bağlanacak — bugün kendi kopyası var.
 * Şimdi birleştirilmedi çünkü o dosyalar paralel çalışan müşteri-yüzeyi ajanının şeridinde (WORKFLOW §7).
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
