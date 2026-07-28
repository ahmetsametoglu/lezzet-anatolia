'use client';

import { useState } from 'react';
import { RATIO_SOURCE } from '@lezzet/types';
import { CROP_CENTER } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { PackageListCard } from '@/components/customer/ui/package-card';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import type { PackagesViewProps } from './packages-types';

/** İlk turda kaç kart basılır (tasarım). Sayfalama DEĞİL, gösterim kararı — veri tek turda geldi. */
const FIRST_PAGE = 12;

/**
 * Paketler — masaüstü düzeni (tasarım: `Musteri - Paketler.dc.html`, "Paketler Web").
 *
 * Tasarımın dört bloğu, sırasıyla: **kahraman** (iki sütun: söz + görsel) → **bölüm başlığı** →
 * ızgara + "Daha fazla" → **katalog bandı**. Süzgeç, arama ve sıralama YOKTUR: sıra yönetimin
 * kurduğu seçkidir, müşteriye seçenek sunmak kürasyonu bozar (etkileşim sözleşmesi).
 *
 * Kahraman ve alt bant BOŞ DURUMDA DA KALIR (tasarımın açık kararı): yalnız ızgara yerini tek bir
 * boş durum kutusuna bırakır. Sayfanın kimliği kartlarda değil, verdiği sözde.
 *
 * "Daha fazla paket" sunucuya GİTMEZ: paket kümesi operatörün elle kurduğu, doğal tavanı olan bir
 * küme (CLAUDE.md §1) — tek turda okundu, düğme yalnız ilk 12'yi açıyor.
 */
export function PackagesDesktop({ t, locale, packages }: PackagesViewProps) {
  const [shown, setShown] = useState(FIRST_PAGE);
  const visible = packages.slice(0, shown);

  return (
    <div className="flex flex-col">
      <section className="grid grid-cols-2 items-center gap-10 px-12 pt-9 pb-8">
        <div className="flex flex-col gap-3.5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.title}</span>
          {/* Kahraman başlığı tasarımda 44 px; ölçek basamağımızın tepesi 38 px (`page-title`).
              Yeni bir basamak açmak yerine mevcut tepe kullanıldı — 6 px'lik fark için ölçeği
              genişletmek, her sayfada "hangi başlık hangi basamak" sorusunu bulanıklaştırırdı. */}
          <h1 className="font-serif text-page-title text-ink">{t.heroTitle}</h1>
          <p className="max-w-[520px] font-sans text-lead text-body">{t.heroBody}</p>
          <div className="flex w-max gap-5 rounded-soft bg-sand-100 px-4.5 py-3.5 font-sans text-note text-body">
            <span>{t.promise.coldChain}</span>
            <span>{t.promise.shippable}</span>
            <span>{t.promise.onePrice}</span>
          </div>
        </div>
        {/* Kahraman görseli: künyesi HENÜZ YOK (tasarımda `image-slot`). Çerçeve tam ölçüsüyle
            durur — kaldırılsaydı sol sütun tek başına kalır ve tasarımın iki sütunlu dengesi
            bozulurdu. Görsel geldiğinde yalnız kaynak değişir. */}
        <FramedImage src={null} alt="" ratio={RATIO_SOURCE} crop={CROP_CENTER} />
      </section>

      <section className="flex flex-col gap-4 px-12 pb-11">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-h1-sm text-ink">{t.listTitle}</h2>
          <span className="font-sans text-body-sm text-muted">{t.listNote}</span>
        </div>

        {packages.length === 0 ? (
          // Boş durum: kesikli çerçeveli TEK kutu (tasarım). Kahraman ve alt bant yerinde kalır.
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-sand-500 px-8 py-10 text-center">
            <span className="text-icon">🎁</span>
            <span className="font-sans text-body font-bold text-ink">{t.empty.title}</span>
            <span className="max-w-[420px] font-sans text-note text-muted">{t.empty.body}</span>
            <Link href="/catalog" className={buttonClass({ size: 'sm', className: 'mt-1' })}>
              {t.empty.cta}
            </Link>
          </div>
        ) : (
          <>
            {/* TEK paket kaldığında ızgara kurulmaz, yatay kart gelir (tasarım "Durumlar"):
                1/3 genişlikte yalnız kalan kart zayıf görünüyor ve sayfanın sözünü zayıflatıyor. */}
            {packages.length === 1 && packages[0] ? (
              <PackageListCard pack={packages[0]} locale={locale} labels={t} wide />
            ) : (
              <div className="grid grid-cols-3 gap-5.5">
                {visible.map((pack) => (
                  <PackageListCard key={pack.id} pack={pack} locale={locale} labels={t} />
                ))}
              </div>
            )}
            {shown < packages.length && (
              <Button variant="outlineOlive" size="md" className="mx-auto mt-2" onClick={() => setShown((n) => n + FIRST_PAGE)}>
                {t.more}
              </Button>
            )}
          </>
        )}
      </section>

      {/* Katalog bandı: paketin cevabı olmadığı müşteriye yol verir ("kendim seçmek istiyorum").
          Sayfanın sonunda durur çünkü önce paketlerin şansı verilir. */}
      <section className="mx-12 mb-11 flex items-center gap-6 rounded-card bg-sand-100 px-8 py-7">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="font-serif text-card-title text-ink">{t.catalogBand.title}</span>
          <span className="font-sans text-body leading-relaxed text-body">{t.catalogBand.body}</span>
        </div>
        <Link href="/catalog" className={buttonClass({ size: 'md', className: 'flex-none' })}>
          {t.catalogBand.cta}
        </Link>
      </section>
    </div>
  );
}
