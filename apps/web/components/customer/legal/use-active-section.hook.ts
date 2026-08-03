'use client';

import { useEffect, useState } from 'react';

/**
 * Kaydırırken hangi bölümün okunduğunu söyler — tasarımın şartı: *"kaydırırken aktif bölüm
 * işaretlenir"*.
 *
 * `IntersectionObserver`, kaydırma olayı dinlemek yerine: `scroll` her karede tetiklenir ve her
 * seferinde bütün başlıkların yerini ölçmek gerekirdi. Gözlemci ise yalnız görünürlük DEĞİŞTİĞİNDE
 * konuşur.
 *
 * `rootMargin` üstten `-20%`, alttan `-70%`: böylece "aktif" sayılan bölüm ekranın ÜST ŞERİDİNDEN
 * geçen olur, ortasından değil. Kırpılmasaydı uzun bir bölümün sonuna gelindiğinde bir sonraki
 * başlık henüz görünmediği için gezinme geride kalırdı; okuyan aşağıdayken işaret yukarıyı
 * gösterirdi.
 *
 * İlk değer ilk bölümdür: sayfa tepedeyken hiçbir başlık şeridin içinde olmayabilir ve gezinmenin
 * hiçbir öğesi işaretsiz kalırdı — okuyan nerede olduğunu göremezdi.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  // Kimliklerin KENDİSİ bağımlılık, dizi referansı değil: sayfa her render'da yeni bir dizi
  // üretiyor ve referansa bakılsaydı gözlemci her render'da sökülüp yeniden kurulurdu.
  const key = ids.join('|');

  useEffect(() => {
    const sectionIds = key ? key.split('|') : [];
    const nodes = sectionIds.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Şeride giren birden çok bölüm olabilir (kısa bölümler): en YUKARIDAKİ kazanır, çünkü
        // okuyan yukarıdan aşağı iner ve şeride ilk giren onun bulunduğu yerdir.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [key]);

  return active;
}
