'use client';

import { Fragment } from 'react';
import { formatPrice } from '@/lib/storefront/format';
import type { CheckoutViewProps } from '../checkout-types';

/**
 * İlerleme şeridi — **yolun tamamı tek bakışta** (desen: `~/dev/petitcigogne` checkout şeridi).
 *
 * Neden var: checkout'un ilk adımında sayfa doğal olarak azdır ve müşteri "daha ne kadar var"
 * sorusunu soramadan bırakabilir. Şerit üç şeyi aynı anda söyler — kaç ürün alıyorum, kaç para
 * tutuyor, kaç adım kaldı. Adım sayısının GÖRÜNMESİ, adımların kısalığını da kanıtlar.
 *
 * **Sepet daima ✓** çünkü buraya sepetten geliniyor; müşterinin ilk gördüğü şey tamamlanmış bir
 * adım oluyor. Kalanlar: doğrulama (yalnız girişsizken) · adres · teslimat · ödeme.
 *
 * Tıklanabilir DEĞİL: adımlar sırayla açılıyor ve geriye dönmek diye bir şey yok — tamamlanan adım
 * ekranda açık kalıyor (tasarım: "akordeon daraltma yok"). Süs değil, konum bildirimi.
 */
export function CheckoutProgress({ t, locale, cart, snapshot, state, authenticated, compact }: CheckoutViewProps) {
  // Bulunulan adım DURUMDAN türetilir, ayrı bir sayaçtan değil: iki kaynak olsaydı ekran bir yerde
  // "adres" derken öbür yerde ödeme kartlarını açık gösterebilirdi.
  const current = !authenticated ? 0 : !state.addressId ? 1 : !state.deliveryDate && snapshot.delivery?.requiresDateChoice ? 2 : 3;

  const steps = [
    ...(!authenticated ? [{ label: t.progress.verify, index: 0 }] : []),
    { label: t.progress.address, index: 1 },
    { label: t.progress.delivery, index: 2 },
    { label: t.progress.payment, index: 3 },
  ];

  const totalCents = snapshot.payment?.orderTotalCents ?? cart.totalCents;

  return (
    <div
      className={[
        'sticky top-0 z-10 flex items-center gap-x-3 gap-y-1.5 rounded-card border border-sand-200 bg-sand-25/95 backdrop-blur',
        compact ? 'flex-wrap px-3.5 py-2.5' : 'px-5 py-3',
      ].join(' ')}
      role="navigation"
      aria-label={t.title}
    >
      <span className="font-sans text-note font-bold text-ink">{t.progress.count.replace('{n}', String(cart.itemCount))}</span>

      <div className={['flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto', compact ? 'order-last w-full' : ''].join(' ')}>
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

      <span className="ml-auto font-serif text-card-title-sm text-ink">{formatPrice(totalCents, locale)}</span>
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
