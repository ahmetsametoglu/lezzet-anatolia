'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Locale } from '@lezzet/i18n';
import type { FeedbackVote } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { Link } from '@/i18n/navigation';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { errorText } from '@/lib/customer-error-text';
import { formatOrderDate } from '@/lib/storefront/format';
import type { FeedbackCompletion, FeedbackInviteView } from '@/lib/feedback/invite';
import { completeAction, reviewAction, voteAction } from './actions';
import { VoteCard } from './components/vote-card';
import { FeedbackOutcome } from './components/feedback-outcome';
import type { FeedbackStep, Messages } from './feedback-types';

/**
 * Alım-sonrası değerlendirme akışı (08.7 · 17.2) — davet bağlantısının indiği yer.
 *
 * **CİHAZ ÇATALI YOK ve bu tasarımın kararı**, benim kısaltmam değil: ekranın üstünde
 * *"Geri Bildirim · Mobil (davet linkinden; neredeyse tek biçim)"*, web karesinin başlığında da
 * *"aynı akış, ortalanmış sütun"* yazıyor. Fark yalnız sütun genişliği ve iki punto kademesi —
 * ikisi de cihazdan geliyor. Talep formunda da aynı karar verilmişti (08.6); iki dosyaya bölmek,
 * aynı akışın bir gün iki farklı davranması demekti.
 *
 * **Akış oturumsuz.** Token bağlantıda; kimlik sunucuda ondan çözülüyor (`actions.ts` künyesi).
 * Bu ekran hiçbir yerde `customerId` taşımıyor — taşısaydı istemciden gönderilebilir olurdu.
 *
 * **Yarıda bırakma kaybolmaz:** oy verildiği anda sunucuya yazılıyor, "Sonra bitir" ayrı bir kayıt
 * eylemi değil sadece bir çıkış. Link tekrar açıldığında `openFeedbackInvite` her kartı mevcut
 * cevabıyla getiriyor ve akış ilk cevapsız karttan sürüyor.
 */
interface FeedbackClientProps {
  t: Messages;
  locale: Locale;
  token: string;
  invite: FeedbackInviteView;
  device: Device;
}

export function FeedbackClient({ t, locale, token, invite, device }: FeedbackClientProps) {
  const compact = useDevice(device) === 'mobile';

  // Zaten tamamlanmış davet: akış hiç kurulmaz, doğrudan teşekkür durumu (tasarım "Link zaten
  // tamamlanmış" karesi). Kartları göstermek, puanı ikinci kez kazanılabilirmiş gibi okuturdu.
  const [step, setStep] = useState<FeedbackStep>(invite.completedAt ? 'done' : 'welcome');
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Oylar İYİMSER tutuluyor: dokunuşla kart hemen ilerlemeli (tasarım "otomatik sonrakine geçer").
  // Sunucu cevabı beklenirse akış her kartta duraklar ve "bir dakikadan kısa" vaadi düşer.
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>(() => initialVotes(invite));
  /**
   * Akış ilk OYSUZ karttan sürer — yarıda bırakan müşteri baştan başlamaz.
   *
   * Ölçüt `existing` değil `existing.vote`: bir kart yalnız YORUM taşıyor olabilir (müşteri yazdı
   * ama oy vermedi) ve o kart hâlâ cevapsızdır. `existing` varlığına baksaydık akış onu atlar,
   * müşteri de neden bitiremediğini anlamazdı.
   */
  const [index, setIndex] = useState(() => {
    const first = invite.cards.findIndex((c) => !c.existing?.vote);
    return first === -1 ? 0 : first;
  });

  const card = invite.cards[index];
  const total = invite.cards.length;

  const vote = (productId: string, value: FeedbackVote) => {
    setVotes((prev) => ({ ...prev, [productId]: value }));
    setErrorKey(null);
    void voteAction(locale, token, productId, value).then(({ errorKey: failed }) => {
      // Yazma düşerse iyimser seçim GERİ ALINIR — sepette öğrenilen ders: ekranda duran ama
      // sunucuda olmayan bir cevap, müşteriye yaptığı işin kaydedildiğini söyler.
      if (!failed) return;
      setVotes((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setErrorKey(failed);
    });
    // İlerleme oyla birlikte: son karttaysa beklemez, bitirme düğmesi görünür.
    if (index < total - 1) setIndex(index + 1);
  };

  const finish = async () => {
    setBusy(true);
    setErrorKey(null);
    const { data, errorKey: failed } = await completeAction(token);
    setBusy(false);
    if (!data) return setErrorKey(failed ?? 'unexpected');
    setCompletion(data);
    setStep('done');
  };

  return (
    // Tasarımda sayfa kabuğu (başlık/footer) YOK: bu bir akış, bir sayfa değil — davet linkinden
    // gelen müşteri siteyi gezmeye değil bir işi bitirmeye geldi. Giriş ekranıyla aynı karar.
    <div className="flex min-h-screen justify-center bg-cream px-4 py-8">
      <div className={`flex w-full flex-col ${compact ? 'max-w-[390px]' : 'max-w-[460px]'}`}>
        {step === 'welcome' && (
          <Welcome t={t} locale={locale} invite={invite} compact={compact} onStart={() => setStep('cards')} />
        )}

        {step === 'cards' && card && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              {/* Geri: tasarımın "geri dönüp değiştirilebilir" kuralı. İlk kartta çizilmez —
                  gidilecek yer yok, pasif bir düğme koymak boş bir söz olurdu. */}
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => setIndex(index - 1)}
                  className="cursor-pointer font-sans text-note font-bold text-muted transition-colors hover:text-ink"
                >
                  ← {t.back}
                </button>
              ) : (
                <span className="w-9" aria-hidden="true" />
              )}
              <span className="font-sans text-micro text-muted">
                {t.progress.replace('{current}', String(index + 1)).replace('{total}', String(total))}
              </span>
              {/* "Sonra bitir" bir KAYDETME değil, bir çıkış: cevaplar zaten yazıldı. */}
              <Link href="/catalog" className="cursor-pointer font-sans text-note font-bold text-muted transition-colors hover:text-ink">
                {t.finishLater}
              </Link>
            </div>

            <VoteCard
              t={t}
              card={card}
              vote={votes[card.productId] ?? null}
              onVote={(value) => vote(card.productId, value)}
              onReview={async (rating, comment) => {
                const { errorKey: failed } = await reviewAction(locale, token, card.productId, rating, comment);
                return failed;
              }}
              compact={compact}
            />

            <ProgressBar done={Object.keys(votes).length} total={total} />

            {errorKey && (
              <span className="text-center font-sans text-note font-semibold text-terracotta">{errorText(t.errors, errorKey)}</span>
            )}

            {/* Bitirme düğmesi her kart oylandığında görünür. Erken göstermek, akışı yarıda
                bırakmaya davet etmek olurdu; hiç göstermemek ise son kartta müşteriyi kilitlerdi. */}
            {Object.keys(votes).length === total && (
              <Button size="md" compact={compact} fullWidth disabled={busy} onClick={finish}>
                {busy ? t.finishing : t.finish}
              </Button>
            )}
          </div>
        )}

        {step === 'done' &&
          (completion ? (
            <FeedbackOutcome t={t} completion={completion} customerName={invite.customerName} compact={compact} />
          ) : (
            <AlreadyDone t={t} compact={compact} />
          ))}
      </div>
    </div>
  );
}

/**
 * Daha önce verilmiş oylar — akış kaldığı yerden sürsün diye.
 *
 * `vote` NULLABLE: aynı satırda yıldız, beğeni ve metin ayrı ayrı yaşayabiliyor (`upsertFeedback`
 * künyesi — "verilmeyen alan silinmez"). Yalnız yorum yazmış bir kartın oyu yoktur ve haritaya
 * girmemeli, yoksa oylanmış sayılır ve bitirme düğmesi erken belirir.
 */
function initialVotes(invite: FeedbackInviteView): Record<string, FeedbackVote> {
  const entries: [string, FeedbackVote][] = [];
  for (const card of invite.cards) {
    if (card.existing?.vote) entries.push([card.productId, card.existing.vote]);
  }
  return Object.fromEntries(entries);
}

/** Karşılama — hangi siparişle ilgili olduğunu ve sözü söyler (içerik envanteri §2). */
function Welcome({ t, locale, invite, compact, onStart }: { t: Messages; locale: Locale; invite: FeedbackInviteView; compact: boolean; onStart: () => void }) {
  const order = [invite.orderReferenceNo, invite.orderedOn && formatOrderDate(invite.orderedOn, locale, true)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col items-center gap-3.5 py-6 text-center">
      <Image src="/logo.jpg" alt="" width={120} height={46} className="h-[46px] w-auto mix-blend-multiply" />
      <h1 className={`font-serif ${compact ? 'text-page-title-sm' : 'text-card-title'} leading-tight text-ink`}>{t.welcomeTitle}</h1>
      <p className="font-sans text-body-sm leading-relaxed text-body">
        {t.welcomeBody
          .replace('{order}', order)
          .replace('{points}', t.welcomePoints.replace('{n}', String(invite.completionPoints)))}
      </p>
      <button type="button" onClick={onStart} className={buttonClass({ size: 'lg', compact, className: 'mt-1' })}>
        {t.start}
      </button>
    </div>
  );
}

/** Tamamlanmış davet tekrar açıldı — puan İKİNCİ KEZ verilmez, ekran bunu söyler. */
function AlreadyDone({ t, compact }: { t: Messages; compact: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="text-[28px] leading-none">✓</span>
      <span className={`font-serif ${compact ? 'text-h2-sm' : 'text-card-title'} text-ink`}>{t.alreadyTitle}</span>
      <span className="font-sans text-note leading-relaxed text-body">{t.alreadyBody}</span>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 font-sans text-note font-bold text-olive">
        <Link href="/account" className="cursor-pointer transition-colors hover:text-olive-dark">
          {t.myPoints}
        </Link>
        <Link href="/catalog" className="cursor-pointer transition-colors hover:text-olive-dark">
          {t.toCatalog}
        </Link>
      </div>
    </div>
  );
}

/** İlerleme çubuğu — tasarımda kartın altında 4px'lik ince şerit. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-pill bg-sand-200">
      <div className="h-full rounded-pill bg-olive transition-[width]" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
    </div>
  );
}
