/**
 * Yatay kaydırmalı şerit — kategori şeridi, süzgeç çipleri, benzer ürünler.
 *
 * Kaydırma çubuğu, kaydıran öğenin ped kutusunun ALT kenarında çizilir; alt boşluk verilmezse
 * kartlara/çiplere yapışır ve şerit kirli görünür. Kalıcı çubuk gösteren sistemlerde (Windows, bazı
 * Linux masaüstleri) bu açıkça rahatsız eder, macOS'ta ise yalnız kaydırırken belirdiği için gözden
 * kaçar — yani "bende iyi görünüyor" bu konuda güvenilir bir ölçüt değil.
 *
 * Boşluk şeridin KENDİ içinde: dış bölüme verilseydi çubuk yine içeriğe bitişik kalırdı.
 *
 * Sabit olarak duruyor çünkü üç şerit de aynı davranışı paylaşıyor ama farklı aralık ve dış pede
 * sahip; bileşene çevirmek o iki değeri de prop'a taşımak demekti — ortak olan yalnız kaydırma.
 * Galeri bunu KULLANMAZ: orada çubuk tamamen gizlidir, yerini nokta göstergesi alır.
 */
export const SCROLL_STRIP = 'flex overflow-x-auto pb-2.5';
