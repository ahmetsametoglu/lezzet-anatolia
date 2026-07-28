'use client';

import Link from 'next/link';
import { buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { InfoIcon } from '@/components/operation/ui/icons';

// Kupon & kampanya — TASARIMI HAZIR, ARKA UCU YOK.
//
// Sekme boş duruyor ve bu bilinçli: kupon/kampanya bir VARLIKTIR (kapsam, koşul, tarih, kullanım
// sınırı) ve tanım servisi henüz yazılmadı (`05.6`). Arayüzü şimdi kurmak, kaydedilemeyen bir form
// ve hiçbir siparişe uygulanmayan bir liste demekti — çalışıyormuş gibi duran bir ekran, olmayan bir
// ekrandan kötüdür.
//
// Kuralın kendisi YAZILI: tek-en-büyük kuralı kampanya kurulurken bilinmeli, o yüzden metin şimdiden
// burada (tasarımın uyarı kartı).

export function CouponsTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ErrorState
        tone="warn"
        icon={<InfoIcon />}
        title="Kupon ve kampanya henüz açılmadı"
        description="İndirim tanımı bir varlıktır: kapsam, koşullar, geçerlilik ve kullanım sınırı. Motor bağlanana kadar burada kaydedilemeyen bir form durmuyor."
      >
        <div className="flex w-full max-w-[520px] flex-col gap-2 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-4 py-3 text-left">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-amber">
            Kurulurken bilinmesi gerekenler
          </span>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 font-ops-body text-ops-sm leading-[1.7] text-ops-amber-dark">
            <li>
              <strong>Tek-en-büyük kuralı:</strong> indirimler üst üste binmez, müşteriye en büyüğü uygulanır.
            </li>
            <li>Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim binmez.</li>
            <li>Kupon daima sepet kapsamlıdır; otomatik kampanya kategori ya da koleksiyona da bağlanabilir.</li>
          </ul>
        </div>
        <Link href="/operations/stock?tab=attention" className={buttonClass({ variant: 'secondary' })}>
          Yaklaşan tarihli teklifler stok ekranında
        </Link>
      </ErrorState>
    </div>
  );
}
