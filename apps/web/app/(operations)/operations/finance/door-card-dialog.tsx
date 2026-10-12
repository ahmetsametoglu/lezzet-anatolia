'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { money, shortDateTime } from '@/components/operation/ui/format';
import { SkeletonRows } from '@/components/operation/ui/skeleton';
import { doorCardReviewAction, linkDoorCardAction } from '@/lib/finance/actions';
import type { DoorCardCollectionView, DoorCardReviewView } from './finance-types';

/**
 * Kapıda kart eşleştirme ("Eylemler → Kapıda kart"): Revolut'ta hiçbir tahsilata bağlanmamış yüz yüze ödemeler, tutarı birebir tutan
 * kart tahsilatlarıyla listelenir. Pencere bağdan sonra kapanmaz, çünkü sırada başka ödeme olabilir; liste yeniden okunur.
 */
interface DoorCardDialogProps {
  onClose: () => void;
}

export function DoorCardDialog({ onClose }: DoorCardDialogProps) {
  const [view, setView] = useState<DoorCardReviewView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** Okumanın sırası: bağdan sonra artar ve liste yeniden okunur. */
  const [round, setRound] = useState(0);
  /** Bekleyen bağ (`ref:movementId`) — bütün "Bağla"lar kilitlenir, iki bağ yarışmasın. */
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void doorCardReviewAction()
      .then((result) => {
        if (!current) return;
        setView(result.data);
        setLoadError(result.error);
      })
      // Action sonuç döner, fırlatmaz; buraya düşen bağlantı kopmasıdır ve pencerede okunur.
      .catch(() => {
        if (current) setLoadError('Okunamadı — bağlantıyı denetleyip pencereyi yeniden açın.');
      });
    return () => {
      current = false;
    };
  }, [round]);

  const link = async (paymentRef: string, movementId: string) => {
    setLinkError(null);
    setLinking(`${paymentRef}:${movementId}`);
    const { error } = await linkDoorCardAction(movementId, paymentRef);
    setLinking(null);
    if (error) setLinkError(error);
    setRound((value) => value + 1);
  };

  const empty = view !== null && view.payments.length === 0 && view.orphans.length === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Kapıda kart eşleştirme"
      subtitle="Son 14 gün · Revolut'taki yüz yüze ödemeler ve bizde kart diye yazılan tahsilatlar"
      maxWidth={720}
    >
      {linkError ? (
        <p role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
          {linkError}
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="font-ops-body text-ops-sm text-ops-red">
          {loadError}
        </p>
      ) : view === null ? (
        <SkeletonRows rows={3} />
      ) : empty ? (
        <EmptyState
          fill={false}
          title="Açıkta kart ödemesi yok"
          description="Son 14 günde Revolut'taki her yüz yüze ödeme bir tahsilata, her kart tahsilatı bir Revolut ödemesine bağlı."
        />
      ) : (
        <>
          {view.payments.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHead
                title="Revolut'ta, tahsilata bağlanmamış ödemeler"
                hint="Tutarı ve saati tek adaya uyan ödemeyi eşleştirme işi kendisi bağlar; burada kalanlar elle bağlanır."
              />
              <ul className="flex flex-col divide-y divide-ops-line-soft overflow-hidden rounded-ops-card border border-ops-line">
                {view.payments.map((payment) => (
                  <li key={payment.ref} className="flex flex-col gap-2 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{money(payment.amountCents)}</span>
                      <span className="font-ops-body text-ops-xs text-ops-muted">{shortDateTime(payment.at)}</span>
                    </div>
                    {payment.candidates.length === 0 ? (
                      <p className="font-ops-body text-ops-xs text-ops-muted">Bu tutarda bağlanmamış kart tahsilatı yok.</p>
                    ) : (
                      payment.candidates.map((collection) => {
                        const key = `${payment.ref}:${collection.id}`;
                        return (
                          <CollectionLine key={collection.id} collection={collection}>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={linking === key}
                              disabled={linking !== null}
                              onClick={() => void link(payment.ref, collection.id)}
                            >
                              Bağla
                            </Button>
                          </CollectionLine>
                        );
                      })
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {view.orphans.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionHead
                title="Revolut'ta karşılığı olmayan kart tahsilatları"
                hint="Tutarı hiçbir açık Revolut ödemesini tutmuyor; siparişi açıp tahsilatı denetleyin."
              />
              <ul className="flex flex-col divide-y divide-ops-line-soft overflow-hidden rounded-ops-card border border-ops-line">
                {view.orphans.map((collection) => (
                  <li key={collection.id} className="px-3 py-2.5">
                    <CollectionLine collection={collection} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

interface SectionHeadProps {
  title: string;
  hint: string;
}

function SectionHead({ title, hint }: SectionHeadProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="font-ops-display text-ops-base font-semibold text-ops-ink">{title}</h3>
      <p className="font-ops-body text-ops-xs text-ops-faint">{hint}</p>
    </div>
  );
}

interface CollectionLineProps {
  collection: DoorCardCollectionView;
  children?: ReactNode;
}

/** Tahsilatın satırı: sipariş (sayfasına gider), tutar ve yazıldığı an; eylem varsa sağda. */
function CollectionLine({ collection, children }: CollectionLineProps) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/operations/orders/${collection.orderId}`}
        className="min-w-0 flex-1 cursor-pointer truncate font-ops-body text-ops-sm text-ops-strong hover:text-ops-olive"
      >
        {collection.orderName}
      </Link>
      <span className="font-ops-mono text-ops-xs text-ops-ink">{money(collection.amountCents)}</span>
      <span className="font-ops-body text-ops-xs text-ops-muted">{shortDateTime(collection.createdAt)}</span>
      {children}
    </div>
  );
}
