'use client';

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent } from 'react';
import { RATIO_PORTRAIT } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Icon } from '@/components/customer/ui/icons';
import type { DiscoverCard } from '@/lib/feedback/discover';

/** Kartın yana uçuşu (ms); bitiş ekranı da bu kadar bekler ki son kart uçarken kaybolmasın. */
export const EXIT_MS = 330;
/** Karar eşiği (px); damga ve renkli gölge de bu mesafede tam görünür, kart "karar verildi" göründüğü an gerçekten eşiktedir. */
const THRESHOLD = 92;
/** Parmağın dikeyde izlenme oranı ve eğim böleni (`x / 16` derece). */
const VERTICAL_FOLLOW = 0.35;
const ROTATE_DIVISOR = 16;
/** Bırakılan kartın yerine dönüşü ve arkadaki kartın öne gelişi aynı yaylı eğriyle. */
const SETTLE_MS = 280;
const SETTLE_EASE = 'cubic-bezier(.22,1,.36,1)';
/** Derinlik başına aşağı kayma (px) ve küçülme: öndeki, sıradaki, üçüncü. */
const STACK = [
  { drop: 0, scale: 1 },
  { drop: 30, scale: 0.94 },
  { drop: 56, scale: 0.88 },
] as const;
const REST_SHADOW = '0 12px 32px color-mix(in srgb, var(--color-ink) 16%, transparent)';
const NEXT_SHADOW = '0 6px 18px color-mix(in srgb, var(--color-ink) 8%, transparent)';

type Vote = 'like' | 'dislike';

interface Offset {
  x: number;
  y: number;
}

const REST: Offset = { x: 0, y: 0 };

/** Uçan kart: desteden çıktı ama ekrandan henüz çıkmadı; bırakıldığı yerden uçar. */
interface Flight {
  card: DiscoverCard;
  dir: 1 | -1;
  from: Offset;
}

interface SwipeDeckLabels {
  like: string;
  pass: string;
  stampLike: string;
  stampPass: string;
  wantedOne: string;
  wantedOther: string;
}

type DragHandlers = Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>;

interface SwipeDeckProps {
  /** Sıradaki karttan başlayan kalan deste; ilk üçü çizilir. */
  deck: DiscoverCard[];
  /** Kart uçmaya başladığı an çağrılır: deste hemen ilerler, uçan kart kendi katmanında biter. */
  onVote: (vote: Vote) => void;
  labels: SwipeDeckLabels;
}

const dragTransform = (o: Offset): string => `translate(${o.x}px, ${o.y * VERTICAL_FOLLOW}px) rotate(${o.x / ROTATE_DIVISOR}deg)`;

/** Eşiğe ne kadar yaklaşıldı (0–1): damga opaklığı ve gölge koyuluğu. */
const reachOf = (x: number): number => Math.min(1, Math.abs(x) / THRESHOLD);

/** Durgun kartın gölgesi mürekkep; kaydırırken yönün rengine döner ve mesafeyle koyulaşır. */
function glowOf(x: number): string {
  if (x === 0) return REST_SHADOW;
  const tone = x > 0 ? 'var(--color-olive)' : 'var(--color-terracotta)';
  return `0 12px 34px color-mix(in srgb, ${tone} ${Math.round((0.12 + reachOf(x) * 0.3) * 100)}%, transparent)`;
}

/**
 * Keşif destesi (`Musteri Mobil.dc.html` "Keşif"): öndeki kart parmağı izler, eşiği geçince yana uçar, arkadaki kart öne gelir.
 * Düğmeler aynı uçuşu başlatır; uçuş sürerken yeni jest alınmaz ki iki kart birden geçmesin.
 */
export function SwipeDeck({ deck, onVote, labels }: SwipeDeckProps) {
  const [drag, setDrag] = useState<Offset | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  // Bırakma, son hareketin çizimini beklemeden gelebilir; son konum bu yüzden ref'ten okunur.
  const start = useRef<Offset | null>(null);
  const latest = useRef<Offset>(REST);
  const top = deck[0] ?? null;

  const land = useCallback(() => setFlight(null), []);

  function fly(dir: 1 | -1, from: Offset) {
    if (!top || flight) return;
    setFlight({ card: top, dir, from });
    setDrag(null);
    onVote(dir > 0 ? 'like' : 'dislike');
  }

  function release() {
    if (!start.current) return;
    start.current = null;
    const offset = latest.current;
    if (Math.abs(offset.x) > THRESHOLD) fly(offset.x > 0 ? 1 : -1, offset);
    else setDrag(null);
  }

  const handlers: DragHandlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      start.current = { x: e.clientX, y: e.clientY };
      latest.current = REST;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(REST);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      latest.current = { x: e.clientX - start.current.x, y: e.clientY - start.current.y };
      setDrag(latest.current);
    },
    onPointerUp: release,
    onPointerCancel: release,
  };

  return (
    <>
      <div className="relative max-h-[486px] min-h-[340px] flex-1 touch-none select-none">
        {deck
          .slice(0, STACK.length)
          .map((card, depth) => (
            <DeckCard
              key={card.productId}
              card={card}
              depth={depth}
              drag={depth === 0 ? drag : null}
              handlers={depth === 0 && flight === null ? handlers : undefined}
              labels={labels}
            />
          ))
          .reverse()}
        {flight && <FlyingCard key={`flight-${flight.card.productId}`} flight={flight} labels={labels} onLanded={land} />}
      </div>

      <div className="flex items-center justify-center gap-6 pt-0.5 pb-1.5">
        <button
          type="button"
          aria-label={labels.pass}
          disabled={!top}
          onClick={() => fly(-1, REST)}
          className="grid size-15 flex-none cursor-pointer place-items-center rounded-full border-2 border-sand-300 bg-card text-terracotta shadow-[0_4px_14px_color-mix(in_srgb,var(--color-ink)_9%,transparent)] transition-[transform,border-color] duration-120 hover:border-sand-500 active:scale-[0.88] disabled:cursor-default disabled:opacity-60"
        >
          <Icon name="close" size={24} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-label={labels.like}
          disabled={!top}
          onClick={() => fly(1, REST)}
          className="grid size-18 flex-none cursor-pointer place-items-center rounded-full bg-olive text-white shadow-[0_8px_22px_color-mix(in_srgb,var(--color-olive)_42%,transparent)] transition-[transform,background-color] duration-120 hover:bg-olive-dark active:scale-[0.88] disabled:cursor-default disabled:opacity-60"
        >
          <Icon name="heart" size={30} />
        </button>
      </div>
    </>
  );
}

interface DeckCardProps {
  card: DiscoverCard;
  /** 0 öndeki, 1 sıradaki, 2 üçüncü. */
  depth: number;
  drag: Offset | null;
  /** Yalnız öndeki kart sürüklenir; uçuş sürerken onun da işleyicisi yok. */
  handlers?: DragHandlers;
  labels: SwipeDeckLabels;
}

/** Destedeki kart — anahtarı ürün olduğu için öne geldiğinde aynı öğe kalır ve yeri geçişle değişir. */
function DeckCard({ card, depth, drag, handlers, labels }: DeckCardProps) {
  const front = depth === 0;
  const offset = drag ?? REST;
  const { drop, scale } = STACK[depth] ?? STACK[2];
  const style: CSSProperties = {
    transform: front ? dragTransform(offset) : `translateY(${drop}px) scale(${scale})`,
    // Sürüklerken geçiş yok: kart parmağı anında izlemeli.
    transition: drag ? 'none' : `transform ${SETTLE_MS}ms ${SETTLE_EASE}, box-shadow ${SETTLE_MS}ms ease`,
    boxShadow: front ? glowOf(offset.x) : depth === 1 ? NEXT_SHADOW : 'none',
  };
  return (
    <article
      aria-hidden={!front}
      style={style}
      className={[
        // Görsel olayı kartta kalır: fareyle sürüklerken tarayıcının kendi "resmi sürükle" hareketi jesti kesmesin.
        'absolute inset-x-0 top-0 bottom-[34px] overflow-hidden rounded-[28px] bg-sand-100 [&_img]:pointer-events-none',
        depth === 2 ? 'border-[1.5px] border-sand-300' : '',
        front ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none',
      ].join(' ')}
      {...handlers}
    >
      {depth < 2 && (
        <>
          <CardPhoto card={card} />
          {/* Sıradaki kartın krem tülü; kart öne gelirken solar. */}
          <span
            aria-hidden
            className={['absolute inset-0 bg-sand-50/55 transition-opacity duration-280', front ? 'opacity-0' : 'opacity-100'].join(' ')}
          />
          <CardFace card={card} x={offset.x} shown={front} live={drag !== null} labels={labels} />
        </>
      )}
    </article>
  );
}

interface FlyingCardProps {
  flight: Flight;
  labels: SwipeDeckLabels;
  onLanded: () => void;
}

/** Desteden çıkmış kartın uçuşu; Web Animations ilk kareyi bırakılan duruştan aldığı için kart merkeze sıçramaz. */
function FlyingCard({ flight, labels, onLanded }: FlyingCardProps) {
  const ref = useRef<HTMLElement>(null);
  const from = dragTransform(flight.from);
  const to = `translate(${flight.dir * 130}%, 0) rotate(${flight.dir * 9}deg)`;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const animation = node.animate(
      [
        { transform: from, opacity: 1 },
        { transform: to, opacity: 0 },
      ],
      { duration: EXIT_MS, easing: 'ease-in', fill: 'forwards' },
    );
    animation.onfinish = onLanded;
    return () => animation.cancel();
  }, [from, to, onLanded]);

  return (
    <article
      ref={ref}
      aria-hidden
      style={{ transform: from, boxShadow: glowOf(flight.from.x) }}
      className="pointer-events-none absolute inset-x-0 top-0 bottom-[34px] overflow-hidden rounded-[28px] bg-sand-100"
    >
      <CardPhoto card={flight.card} />
      <CardFace card={flight.card} x={flight.from.x} shown live labels={labels} />
    </article>
  );
}

function CardPhoto({ card }: { card: DiscoverCard }) {
  return (
    <FramedImage
      src={card.image.url}
      alt={card.name}
      ratio={RATIO_PORTRAIT}
      crop={card.image.crop}
      frames={card.image.frames}
      sizes="100vw"
      placeholder={<span className="font-serif text-h1-sm text-sand-500">{card.name.slice(0, 1)}</span>}
      className="!absolute inset-0 !aspect-auto !rounded-none !bg-sand-100"
    />
  );
}

interface CardFaceProps {
  card: DiscoverCard;
  x: number;
  /** Yalnız öndeki kartta görünür; sıradaki kart öne gelirken belirir. */
  shown: boolean;
  /** Parmak kartın üstünde: damga mesafeyi geçişsiz izler. */
  live: boolean;
  labels: SwipeDeckLabels;
}

/** Fotoğrafın üstündeki her şey: okunurluk gradyanı, kategori rozeti, damgalar ve künye. */
function CardFace({ card, x, shown, live, labels }: CardFaceProps) {
  const reach = reachOf(x);
  return (
    <div className={['pointer-events-none absolute inset-0 transition-opacity duration-280', shown ? 'opacity-100' : 'opacity-0'].join(' ')}>
      {/* Koyuluk yalnız altta, yazının okunması için; üst yarı fotoğrafın kendi aydınlığında kalır. */}
      <span aria-hidden className="absolute inset-0 bg-linear-to-b from-ink-deep/0 from-40% via-ink-deep/35 via-68% to-ink-deep/88" />
      {card.category !== null && (
        <span className="absolute top-4 left-4 rounded-badge bg-sand-50/92 px-2.75 py-1.5 font-sans text-badge-sm font-bold tracking-[0.1em] text-body uppercase">
          {card.category}
        </span>
      )}
      <Stamp label={labels.stampLike} like opacity={x > 0 ? reach : 0} live={live} />
      <Stamp label={labels.stampPass} like={false} opacity={x < 0 ? reach : 0} live={live} />
      <div className="absolute inset-x-5 bottom-5 flex flex-col gap-1.75">
        <h2 className="font-serif text-page-title-sm leading-[1.08] text-on-image">{card.name}</h2>
        {card.description !== null && <p className="font-sans text-note leading-normal text-on-image-soft">{card.description}</p>}
        {card.likedBy > 0 && (
          <span className="flex items-center gap-1.5 self-start rounded-soft border border-sand-50/30 bg-sand-50/16 px-2.75 py-1.25 font-sans text-micro font-bold text-olive-light">
            <Icon name="heart" size={11} />
            {card.likedBy === 1 ? labels.wantedOne : labels.wantedOther.replace('{count}', String(card.likedBy))}
          </span>
        )}
      </div>
    </div>
  );
}

/** Basılı damga: sağa "İSTERİM" (zeytin, sola eğik), sola "BAŞKA SEFER" (terracotta, sağa eğik). */
function Stamp({ label, like, opacity, live }: { label: string; like: boolean; opacity: number; live: boolean }) {
  return (
    <span
      aria-hidden
      style={{ opacity, transition: live ? 'none' : `opacity ${SETTLE_MS}ms ease` }}
      className={[
        'absolute top-5.5 rounded-badge border-3 bg-sand-50/94 px-4 py-2 font-sans text-h2-sm font-bold tracking-[0.06em] uppercase',
        like ? 'left-4.5 -rotate-13 border-olive text-olive' : 'right-4.5 rotate-13 border-terracotta text-terracotta',
      ].join(' ')}
    >
      {label}
    </span>
  );
}
