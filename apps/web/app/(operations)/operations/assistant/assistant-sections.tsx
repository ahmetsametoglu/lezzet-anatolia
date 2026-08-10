'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { QueueTab } from '@/lib/assistant/assistant-types';
import { Badge } from '@/components/operation/ui/badge';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { ChevronDownIcon, InfoIcon } from '@/components/operation/ui/icons';
import { agoLabel, money, shortDateTime } from '@/components/operation/ui/format';
import { EDGE_CLASS } from '@/components/operation/ui/queue-pane';
import {
  FRESHNESS,
  KIND_TONE,
  STATUS_VIEW,
  decisionByline,
  decisionFooterNote,
  decisionNote,
  notifyCountOf,
  queueStatusLine,
} from './assistant-labels';
import { inlineBodyOf } from './assistant-body';
import { ProposalPreview } from './assistant-preview';
import type { AssistantRowView, DecisionKind } from './assistant-types';

/**
 * Asistan onay kuyruğunun parçaları — kuyruk satırı, boş hâl, karar çerçevesi
 * (`Operasyon - Asistan Kuyrugu.dc.html`).
 */

/**
 * Kuyruk satırındaki durum cümlesinin rengi. `neutral` burada METİN olduğu için `ops-muted`'a
 * düşer — rozetin nötr zemini bir metin satırında görünmez.
 */
const STATUS_LINE_CLASS: Record<string, string> = {
  olive: 'text-ops-olive-dark',
  red: 'text-ops-red',
  neutral: 'text-ops-muted',
};

/**
 * Kuyruk satırı — **çizimin kendi katman sırası:** rozet şeridi ÜSTTE, özet cümlesi altında.
 *
 * Ortak `ui/queue-pane`'in `QueueRow`'u kullanılmadı ve bu bilinçli bir ayrım: o bileşenin
 * sözleşmesi "başlık + künye · önizleme · rozetler" ve sırası bilerek sabit (talep ↔ WhatsApp
 * arasında gezen gözün aynı yerde aynı şeyi bulması için). Burada okunacak ilk şey rozet DEĞİL,
 * özet cümlesidir ama tipi bilmeden cümle okunmuyor — çizim bu yüzden şeridi yukarı almış. Sırayı
 * bozmak için ortak bileşene bayrak eklemek, onun kendi gerekçesini geçersiz kılardı. Sütun
 * kabuğu (`QueuePane`) yine ORTAK: kaydırma, boş hâl, gözcü ve `aria-busy` orada.
 */
export function ProposalRow({
  row,
  active,
  onSelect,
}: {
  row: AssistantRowView;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const tone = KIND_TONE[row.kind];
  // Tazelik rozeti YALNIZ karar bekleyen satırda: uygulanmış bir öneride "süresi geçti" demek
  // yanlış bir şey söylemek olurdu — o öneri süresi dolmadan uygulandı, damgası sonradan geçti.
  // (Ölçüldü 09.08: karar geçmişindeki her satır "Süresi geçti" rozeti taşıyordu.)
  const fresh = row.status === 'pending' && row.freshness !== 'ok' ? FRESHNESS[row.freshness] : null;
  const status = queueStatusLine(row);

  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      aria-current={active || undefined}
      className={[
        'flex w-full cursor-pointer flex-col gap-1.5 border-b border-l-[3px] border-b-ops-line-soft px-4 py-3 text-left transition-colors',
        active ? `${EDGE_CLASS[tone]} bg-ops-gray-100` : 'border-l-transparent hover:bg-ops-subtle',
      ].join(' ')}
    >
      <span className="flex items-center gap-1.5">
        <Badge tone={tone} className="uppercase tracking-[0.06em]">
          {row.kindLabel}
        </Badge>
        {fresh ? <Badge tone={fresh.tone}>{fresh.label}</Badge> : null}
        <span className="ml-auto flex-none font-ops-body text-ops-xs text-ops-muted">{agoLabel(row.ageMinutes)}</span>
      </span>

      {/* Özet KIRPILMAZ (`line-clamp-2`), talep kuyruğundaki gibi tek satıra sıkıştırılmaz: orada
          önizleme bir müşteri cümlesinin başıydı, burada asistanın kurduğu TEK cümle — ortasından
          kesilirse kararın konusu kaybolur. */}
      <span className="line-clamp-2 font-ops-body text-ops-base font-medium leading-snug text-ops-ink">
        {row.summary}
      </span>

      {row.amountCents !== null ? (
        <span className="font-ops-mono text-ops-sm font-semibold text-ops-strong">{money(row.amountCents)}</span>
      ) : null}

      {/* Sınıf HARİTADAN gelir, dizge birleştirmeyle değil: Tailwind sınıfları kaynak metinden
          tarıyor ve `text-ops-${tone}` gibi bir ifade hiçbir sınıf üretmez — renk sessizce düşerdi. */}
      {status ? (
        <span className={`font-ops-body text-ops-xs font-medium ${STATUS_LINE_CLASS[status.tone]}`}>{status.text}</span>
      ) : null}
    </button>
  );
}

/**
 * Kuyruk boşken — üç sekmenin üç ayrı cümlesi.
 *
 * Bekleyen kuyruğun boş olması bir arıza DEĞİL: brief'in kendi cümlesi (*"asistanın çalışmadığı
 * anlamına gelmez, sorulmadığı anlamına gelir"*). Ötekilerin boşluğu ise yalnızca geçmişin henüz
 * oluşmamış olmasıdır — aynı cümleyi üçüne birden yazmak, operatörü olmayan bir işe bakmaya
 * gönderirdi.
 */
export function QueueEmpty({ tab }: { tab: QueueTab }) {
  const [title, description] =
    tab === 'expired'
      ? ['Süresi geçen öneri yok', 'Kuyruktan düşen bir öneri olmadı.']
      : tab === 'decided'
        ? ['Karar geçmişi boş', 'Henüz uygulanan ya da reddedilen bir öneri yok.']
        : [
            'Bekleyen öneri yok',
            'Asistan çalışmıyor demek değil — sorulmadı demek. Bir şey hazırlaması için asistana yazın.',
          ];

  // Ortak `EmptyState` DEĞİL, çizimin kendi bloğu: sola yaslı ve sütunun ÜSTÜNDE. Ortak bileşen
  // metni dikeyde ortalıyor ve 326 pikselik uzun bir sütunun tam ortasında duran bir cümle,
  // kuyruğun boş olduğunu değil ekranın yüklenmediğini düşündürüyor. Sağdaki karar panosunun boş
  // hâli ortak bileşende kalıyor — orası geniş bir alan, ortalama orada doğru.
  return (
    <div className="flex flex-col items-start gap-1.5 px-6 py-9">
      <span className="font-ops-display text-ops-base font-semibold text-ops-body">{title}</span>
      <span className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">{description}</span>
    </div>
  );
}

/** Hiçbir öneri seçili değilken sağ pano. */
export function CardPlaceholder() {
  return (
    <EmptyState
      title="Öneri seçilmedi"
      description="Soldaki kuyruktan bir öneri seçin; ne olacağını burada görüp karar verirsiniz."
    />
  );
}

/** "Neden bu öneri" — dolu ve BOŞ hâli ayrı çizilir (çizimin kendi ayrımı). */
function ReasonBlock({ reason }: { reason: string | null }) {
  if (!reason) {
    return (
      <div className="flex flex-col gap-1 rounded-ops-card border-[1.5px] border-dashed border-ops-gray-500 px-3.5 py-3">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-faint">
          Neden bu öneri
        </span>
        {/* Gerekçesiz öneri onaylanabilir — ama patron neye dayandığını göremediğini BİLMELİ
            (brief §3). Kutu bu yüzden silinmiyor, zayıflatılıyor. */}
        <span className="font-ops-body text-ops-base leading-relaxed text-ops-muted">
          Asistan bir sinyal yazmadı. Onaylayabilirsiniz, ama neye dayandığını göremiyorsunuz.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-ops-card border border-l-[3px] border-ops-olive-line border-l-ops-olive bg-ops-olive-bg px-3.5 py-3">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-olive">
        Neden bu öneri
      </span>
      <span className="font-ops-body text-ops-base leading-relaxed text-ops-strong">{reason}</span>
    </div>
  );
}

/** Katlanmış teknik döküm — ham dilekçe, hedef tablolar, öneri kimliği. */
function TechnicalBlock({ row }: { row: AssistantRowView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span className={`flex-none text-ops-body transition-transform ${open ? '' : '-rotate-90'}`}>
          <ChevronDownIcon size={12} />
        </span>
        <span className="font-ops-display text-ops-xs font-semibold text-ops-body">Teknik döküm</span>
        <span className="font-ops-body text-ops-xs text-ops-faint">payload · hedef tablolar · öneri kimliği</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-ops-line-soft bg-ops-subtle px-3.5 py-3">
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Hedef tablolar:{' '}
            <span className="font-ops-mono text-ops-strong">{row.targetTables.join(', ') || '—'}</span> · öneri:{' '}
            {/* İnsan-okunur numara YOK ve açılmadı (sözleşme §2d): sipariş referansı müşteriye
                söylenen bir numaradır, bunun muhatabı yalnız patron ve bu ekran. Kimliğin ilk sekiz
                hanesi konuşmada anılmaya yeter. */}
            <span className="font-ops-mono text-ops-strong">{row.id.slice(0, 8).toUpperCase()}</span>
          </span>
          <pre className="m-0 whitespace-pre-wrap break-words font-ops-mono text-ops-xs leading-relaxed text-ops-strong">
            {JSON.stringify(row.payload, null, 2)}
          </pre>
          {/* Uygulama DOĞAN kayıtların kimliklerini bırakıyor (`result`) — "bu paketi kim kurdu"
              sorusunun cevabı burada. Ham dilekçenin yanında durması bilinçli: ikisi birlikte
              okununca "ne istendi → ne oluştu" zinciri tamamlanıyor. */}
          {row.result ? (
            <pre className="m-0 whitespace-pre-wrap break-words border-t border-ops-line-soft pt-2 font-ops-mono text-ops-xs leading-relaxed text-ops-strong">
              {JSON.stringify(row.result, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * KARAR ÇERÇEVESİ — her tipte AYNI (brief §3). Değişen tek şey ortadaki önizleme bloğu.
 *
 * Alt bar iki hâlde: karar BEKLEYEN öneride üç düğme, karar VERİLMİŞ/DÜŞMÜŞ öneride durumun
 * künyesi. İkisi tek barda birleştirilseydi arşivdeki bir kayıt tıklanabilir bir "Uygula"
 * gösterirdi — kuyruğun en tehlikeli yanılgısı.
 */
export function DecisionCard({
  row,
  busy,
  error,
  onDecision,
}: {
  row: AssistantRowView;
  busy: boolean;
  error: string | null;
  onDecision: (kind: DecisionKind, draft?: unknown) => void;
}) {
  const tone = KIND_TONE[row.kind];
  const notifyCount = notifyCountOf(row);
  const live = row.status === 'pending';
  const statusView = row.status === 'pending' ? null : STATUS_VIEW[row.status];
  const note = decisionNote(row);
  // Kararın CİNSİ ve hedef adres SUNUCUDAN gelir (`AssistantRowView` künyesi): künye uygulama
  // katmanında ve o paketi istemciden çağırmak sunucu modüllerini tarayıcı paketine sokuyor.
  const { mode, bridge } = row;

  /**
   * ── KUYRUĞUN İÇİNDE DÜZENLEME (22.8) ──────────────────────────────────────
   * Gövde karar bekleyen satırda DÜZENLENEBİLİR, karar verilmiş satırda okunur hâlde çizilir —
   * ikisi de aynı bileşen. Arşive ayrı bir "özet" yazmak, aynı kararı iki dilde anlatmak olurdu.
   *
   * Şekil tutmuyorsa gövde `null`: bozuk bir dilekçeye form çizmek, doldurulup kaydedilemeyecek
   * bir ekran demekti. O hâlde önizleme devreye girer ve sebebini yazar.
   */
  const body = inlineBodyOf(row.kind);
  const bodyPayload = body ? body.parse(row.payload) : null;
  const inline = body && bodyPayload !== null ? body : null;

  // Taslak ÇERÇEVEDE durur, gövdede değil: kararı yürüten, hatayı gösteren ve kuyruğu tazeleyen
  // taraf burası. Kart `key={row.id}` ile sarılı olduğu için öneri değişince taslak da sıfırlanır.
  const [draft, setDraft] = useState<unknown>(() => (inline && bodyPayload !== null ? inline.initial(bodyPayload) : null));
  const blocked = inline ? inline.blocked(draft) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ops-subtle">
      <div className="flex flex-col gap-3.5 px-6 py-[18px]">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <Badge tone={tone} className="uppercase tracking-[0.06em]">
                {row.kindLabel}
              </Badge>
              <span className="font-ops-body text-ops-xs text-ops-muted">
                asistan · {shortDateTime(row.createdAt)}
                {live && row.freshness === 'soon' ? ' · tazeliği doluyor' : ''}
              </span>
            </span>
            <span className="font-ops-display text-ops-section font-semibold leading-snug text-ops-ink">
              {row.summary}
            </span>
          </div>
          {row.amountCents !== null ? (
            <span className="flex-none font-ops-mono text-ops-lead font-semibold text-ops-ink">
              {money(row.amountCents)}
            </span>
          ) : null}
        </div>

        <ReasonBlock reason={row.reason} />

        {/* Gövde varsa ÖNİZLEME ÇİZİLMEZ — ikisi birden dururdu ve aynı sayı iki yerde iki farklı
            hâlde okunurdu (önizleme asistanın önerdiği fiyatı, form operatörün yazdığını). İki
            gösterim dili bakımı da ikiye böler; talebin birinci amacı bunu azaltmaktı. */}
        {inline && bodyPayload !== null ? (
          inline.render({
            payload: bodyPayload,
            economics: row.economics,
            draft,
            onDraft: setDraft,
            disabled: busy || !live,
            readOnly: !live,
          })
        ) : (
          <ProposalPreview kind={row.kind} payload={row.payload} economics={row.economics} />
        )}

        <div className="flex items-start gap-2.5 rounded-ops-card border border-ops-gray-300 bg-ops-gray-100 px-3.5 py-2.5">
          <span className="mt-px flex-none text-ops-body">
            <InfoIcon size={15} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">
              {/* Karar verilmiş kayıtta aynı cümle GEÇMİŞ zamanda okunmalı: "uygulanınca ne olur"
                  demek, olup bitmiş bir işi hâlâ seçenekmiş gibi gösterirdi. */}
              {live ? 'Uygulanınca ne olur' : 'Ne olacaktı'}
            </span>
            <span className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{row.impact}</span>
          </div>
        </div>

        <TechnicalBlock row={row} />
      </div>

      {live ? (
        <div className="sticky bottom-0 mt-auto flex items-center gap-2.5 border-t border-ops-line bg-ops-subtle px-6 py-3.5">
          <span className="min-w-0 flex-1 font-ops-body text-ops-xs leading-relaxed text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : decisionFooterNote(mode)}
          </span>
          <Button variant="secondary" onClick={() => onDecision('later')} disabled={busy}>
            Sonra bak
          </Button>
          <Button variant="danger" onClick={() => onDecision('reject')} disabled={busy}>
            Reddet
          </Button>
          {/* ── KARARIN CİNSİNE GÖRE ÜÇÜNCÜ DÜĞME ──────────────────────────────────
              `handoff` tiplerinde "Uygula" YOK ve olmamalı (kullanıcı kararı 09.08): bildirim
              gider, parti satılabilir olur, defter yazılır — üçü de geri alınamaz ve karar
              düzenlemeden verilemiyordu ("bölgeye hangi kod girecek, haritaya bakmam lazım").
              Kuyruk uygulamaz, ilgili ekrana götürür; kayıt oradan ve normal akışla doğar.

              Öteki iki modda düğme kalır. Bildirim gidecekse rengi ve cümlesi değişir — geri
              alınamaz eylem, geri alınabilir olanla aynı görünmemeli (brief §5). */}
          {inline ? (
            /* ── GÖVDESİ OLAN TİP: kaydeden düğme GÖVDENİN kapısıdır (22.8) ────────
               Metni "Uygula" değil işin kendi adı ("Teklifi aç"): operatör bir öneriyi değil, bir
               işi yapıyor — ve o iş kartın içinde gözünün önünde duruyor. Engel varsa sebebi
               düğmenin ipucunda yazar; etkin görünüp hiçbir şey yapmayan düğme olmaz.

               Onay penceresi AÇILMAZ: gövdenin kendisi zaten onay yüzeyi — operatör fiyatı görüp
               değiştirdi. Üstüne bir modal koymak, "dialog açılmaz" kuralını çiğnemenin yanında
               aynı kararı iki kez sordurmak olurdu. */
            <Button
              variant="primary"
              onClick={() => onDecision('apply', draft)}
              disabled={busy || blocked !== null}
              title={blocked ?? undefined}
            >
              {busy ? 'Kaydediliyor…' : inline.applyLabel}
            </Button>
          ) : mode === 'handoff' || mode === 'inline' ? (
            /* `inline` buraya YALNIZ dilekçenin şekli tanınmadığında düşer: gövde çizilemedi, yani
               düzenlenecek form da yok. O hâlde genel "Uygula" gösterilemez — sunucudaki kapı onu
               zaten reddeder ve operatör hiçbir şey olmadan bir düğmeye basmış olurdu. Geriye tek
               dürüst çıkış kalıyor: ekranın kendisi. */
            bridge ? (
              <Link href={bridge.href} className={buttonClass({ variant: 'primary' })}>
                {bridge.label} →
              </Link>
            ) : null
          ) : (
            <Button variant={notifyCount === null ? 'primary' : 'warning'} onClick={() => onDecision('apply')} disabled={busy}>
              {notifyCount === null ? 'Uygula' : 'Uygula ve bildirimi gönder'}
            </Button>
          )}
        </div>
      ) : (
        <div className="sticky bottom-0 mt-auto flex items-start gap-3.5 border-t border-ops-line bg-ops-white px-6 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              {statusView ? (
                <Badge tone={statusView.tone} className="uppercase tracking-[0.06em]">
                  {statusView.label}
                </Badge>
              ) : null}
              <span className="font-ops-body text-ops-xs font-medium text-ops-body">{decisionByline(row)}</span>
            </span>
            {note ? <span className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{note}</span> : null}
          </div>
          {/* Çizimin "Paketi aç →" köprüsü — ama sözü kısaltılmış hâliyle. Uygulama doğan kaydın
              kimliğini bırakıyor (`result`), oysa hiçbir operasyon ekranı TEK bir kayda derin
              bağlantı kabul etmiyor: düğme listeye götürür. "Paketi aç" deseydi götüremediği bir
              yeri vaat ederdi; "Paketlere git" diyor ve kimlik teknik dökümde duruyor.
              Yalnız UYGULANMIŞ satırda çizilir — reddedilmiş bir öneride açılacak kayıt yok. */}
          {row.status === 'applied' && bridge ? (
            <Link href={bridge.href} className={`${buttonClass({ variant: 'secondary' })} flex-none self-center`}>
              {bridge.label} →
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
