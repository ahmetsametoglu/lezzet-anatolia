'use client';

import { Fragment } from 'react';
import type { CheckoutViewProps } from '../checkout-types';

/**
 * İlerleme şeridi — **yolun tamamı tek bakışta** (desen: `~/dev/petitcigogne` checkout şeridi).
 *
 * Neden var: checkout'un ilk adımında sayfa doğal olarak azdır ve müşteri "daha ne kadar var"
 * sorusunu soramadan bırakabilir. Adım sayısının GÖRÜNMESİ, adımların kısalığını da kanıtlar.
 *
 * **Şerit YALNIZ adımları taşır (kullanıcı kararı 20.08).** Bir dönem sayacı ("6 ürün") ve tutarı
 * da taşıyordu; dar ekranda dört bilgi tek satıra sığmıyor, üçüncü adım çipi kesiliyordu (ölçüldü,
 * kullanıcı görüntüsüyle). İkisi de şeridin işi değildi: tutar özet kartında ve onay düğmesinde,
 * sayaç özetin kalem listesinde zaten var.
 *
 * **Sepet daima ✓** çünkü buraya sepetten geliniyor; müşterinin ilk gördüğü şey tamamlanmış bir
 * adım oluyor. Kalanlar: doğrulama (yalnız girişsizken) · adres · teslimat · ödeme.
 *
 * Tıklanabilir DEĞİL: adımlar sırayla açılıyor ve geriye dönmek diye bir şey yok — tamamlanan adım
 * ekranda açık kalıyor (tasarım: "akordeon daraltma yok"). Süs değil, konum bildirimi.
 */
export function CheckoutProgress({ t, snapshot, state, authenticated, compact }: CheckoutViewProps) {
  // Bulunulan adım DURUMDAN türetilir, ayrı bir sayaçtan değil: iki kaynak olsaydı ekran bir yerde
  // "adres" derken öbür yerde ödeme kartlarını açık gösterebilirdi.
  const current = !authenticated ? 0 : !state.addressId ? 1 : !state.deliveryDate && snapshot.delivery?.requiresDateChoice ? 2 : 3;

  const steps = [
    ...(!authenticated ? [{ label: t.progress.verify, index: 0 }] : []),
    { label: t.progress.address, index: 1 },
    { label: t.progress.delivery, index: 2 },
    { label: t.progress.payment, index: 3 },
  ];

  return (
    <div
      className={[
        // Kaydırma çubuğu GİZLİ (kullanıcı görüntüsüyle 20.08): çiplerin altında gri bir çizgi
        // olarak beliriyordu — şerit kaydırılabilir kalır, çubuk çizilmez.
        'flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Mobilde KAPSIZ, TAM GENİŞLİK ve KİMLİK BARININ ALTINA YAPIŞIK (kullanıcı kararı 20.08,
        // altıncı tur): çipler büyük başlığın hemen altında akar, kaydırınca `FunnelHeader` barının
        // altına sabitlenir (iOS'un büyük başlık altına pinlenen segment deseni). `top` değeri barın
        // yüksekliğidir (`funnel-header.tsx` BAR_HEIGHT=52) — Tailwind sınıfı çalışma anında
        // kurulamadığı için sayı burada YİNELENİR; bar boyu değişirse ikisi birlikte değişmeli.
        // z-10 barın (z-20) altında kalır; zemin barla aynı (cream/95 + blur) ki tek parça okunsun.
        // Masaüstünde kart hâli duruyor ve yapışkan değil — orada FunnelHeader yok.
        compact ? 'sticky top-[52px] z-10 -mx-4 bg-cream/95 px-4 py-1.5 backdrop-blur' : 'rounded-card border border-sand-200 bg-sand-25 px-5 py-3',
      ].join(' ')}
      role="navigation"
      aria-label={t.title}
    >
      <Crumb label={t.progress.cart} status="done" />
      {steps.map((step) => (
        <Fragment key={step.label}>
          <span aria-hidden className="font-sans text-micro text-sand-500">
            →
          </span>
          <Crumb label={step.label} status={step.index < current ? 'done' : step.index === current ? 'current' : 'todo'} />
        </Fragment>
      ))}
    </div>
  );
}

function Crumb({ label, status }: { label: string; status: 'done' | 'current' | 'todo' }) {
  return (
    <span
      className={[
        'flex flex-none items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 font-sans text-micro font-semibold',
        status === 'done'
          ? 'bg-olive-bg text-olive-dark'
          : status === 'current'
            ? 'bg-olive text-white'
            : 'text-muted',
      ].join(' ')}
      aria-current={status === 'current' ? 'step' : undefined}
    >
      {status === 'done' && <span aria-hidden>✓</span>}
      {label}
    </span>
  );
}
