'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnchorSnapshot } from '@lezzet/application';
import type { TicketHandler } from '@lezzet/types';
import type { CustomerContextData } from '@/lib/customer/context';
import { AiDraftCard, handlerOptions } from '@/components/operation/ui/ai-handling';
import { Badge } from '@/components/operation/ui/badge';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  ContextConsent,
  ContextIdentity,
  ContextNotice,
  ContextOrders,
  ContextPane,
  type ConsentState,
} from '@/components/operation/ui/customer-context-pane';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { AlertIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { bubbleClass, MessageRow, MessageThread, SectionLabel } from '@/components/operation/ui/message-thread';
import { QueueRow } from '@/components/operation/ui/queue-pane';
import { SOURCE_EDGE, SOURCE_LABELS } from '@/components/operation/ui/conversation-source';
import { ChatText } from '@/components/text/chat-text';
import { Textarea } from '@/components/operation/form/input';
import { ORDERS_PATH } from '../orders/orders-url';
import { TICKETS_PATH } from '../tickets/tickets-url';
import { customersUrl } from '../customers/customers-url';
import {
  AI_OUTBOUND_LABEL,
  LANGUAGE_BASIS_NOTE,
  LANGUAGE_LABELS,
  languageLabel,
  OUTBOUND_LABEL,
  WINDOW_NOTE,
  WINDOW_TONE,
} from './social-labels';
import { humanCanReply } from './social-read';
import type { ConversationDetailView, InboxRowView, MessageView, NoteView } from './social-types';

// Sosyal gelen kutusunun PANOLARI (15.5 · üç kanal 15.15) — sol kuyruk satırı, orta sohbet, sağ
// müşteri bağlamı.
//
// Üçünün de İSKELETİ ortak kitten geliyor (`QueueRow` · `MessageThread` · `ContextPane`): Talepler
// ekranı aynı iskeleti kullanıyor ve iki kopya bir gün ayrışırdı. Burada kalan yalnız ANLAM —
// hangi rozet, hangi renk, hangi cümle. Kanal (`source`) da bir ANLAM eksenidir: kenar rengi,
// pencere cümlesi ve sağ panelin dili ona göre seçilir.

// ─────────────────────────────────────────────────────────────────────────────
// SOL — gelen kutusu satırı
// ─────────────────────────────────────────────────────────────────────────────

interface InboxRowProps {
  row: InboxRowView;
  active: boolean;
  onSelect: (id: string) => void;
}

export function InboxRow({ row, active, onSelect }: InboxRowProps) {
  return (
    <QueueRow
      id={row.id}
      active={active}
      onSelect={onSelect}
      title={row.title}
      // Seçili kenar KANALIN marka rengi (15.15): kuyruk artık üç kanalın kuyruğu, satırın nereden
      // geldiği ilk bakışta okunmalı.
      edgeClass={SOURCE_EDGE[row.source]}
      trailing={<span className="flex-none font-ops-mono text-ops-micro text-ops-faint">{row.ago}</span>}
      preview={row.preview}
      badges={
        <>
          {/* Kanal rozeti — "Tümü" görünümünde satırlar karışık akar, rozet ayırt eder; tek kanala
              daralmış görünümde de kalır: rozetin var/yok oynaması satırı süzgece göre başka
              gösterirdi. */}
          <Badge tone="slate">{SOURCE_LABELS[row.source]}</Badge>
          {row.awaitingReply ? (
            <Badge tone="amber" dot>
              Cevap bekliyor
            </Badge>
          ) : null}
          {/* Çizimin "AI" çipi (16.08) — dar sütunda tek kelime; Hibrit satır seçilmeli, çünkü
              bekleyen taslak ancak açılınca görünür. */}
          {row.handledBy === 'ai' ? <Badge tone="violet">AI</Badge> : null}
          {row.handledBy === 'hybrid' ? <Badge tone="violet">Hibrit</Badge> : null}
          {row.unidentified ? <Badge tone="slate">kimlik yok</Badge> : null}
          <Badge tone={WINDOW_TONE[row.window.tone]} className="ml-auto">
            {row.window.chip}
          </Badge>
        </>
      }
    />
  );
}

export function InboxEmpty({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={<WhatsAppIcon size={22} />}
      title={filtered ? 'Bu süzgeçte sohbet yok' : 'Henüz konuşma yok'}
      description={
        filtered
          ? 'Süzgeçle eşleşen konuşma kalmadı. Tümü çipleriyle bütün konuşmalara dönebilirsiniz.'
          : 'Müşteri WhatsApp, Messenger ya da Instagram’dan yazdığında sohbet buraya kendiliğinden düşer.'
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORTA — sohbet
// ─────────────────────────────────────────────────────────────────────────────

export function DetailPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ops-gray-25">
      <EmptyState
        icon={<WhatsAppIcon size={22} />}
        title="Sohbet seçilmedi"
        description="Soldaki kuyruktan bir konuşma seçin; mesaj geçmişi ve müşteri bağlamı burada açılır."
      />
    </div>
  );
}

/**
 * Mesaj balonu — künye ÜSTTE, balon altta (ortak `MessageRow`).
 *
 * Çizim yalnız giden mesaja bir ad yazıyor ("Siz"), gelene yazmıyor: gelenin kim olduğunu zaten
 * başlık söylüyor ve her balona ad koymak diziyi gürültüye boğardı.
 *
 * **Çizimde saat YOK, burada VAR ve tek sapma bu:** defter ELLE tutuluyor ve 24 saatlik pencerenin
 * dayanağı mesajın ANI. Saati göstermeyen bir defterde "pencere neden kapalı" sorusunun cevabı
 * ekranda hiç görünmezdi. Ayrı satır AÇILMIYOR — çizimin zaten var olan künye satırına yazılıyor.
 */
export function Bubble({ message }: { message: MessageView }) {
  const mine = message.direction === 'outbound';
  // AI'ın KENDİ gönderdiği mesaj ayrı tonda (16.08): müşteri farkı görmez ama operatör görmeli —
  // "bunu kim söyledi" sorusu sonradan da cevaplanabilmeli (talep yazışmasıyla aynı kural).
  const ai = message.author === 'ai';
  /*
    ÇEVİRİ ORİJİNALİN YERİNE GEÇMEZ (15.28 · talep ekranının 20.2 kuralı): varsayılan Türkçe
    (operatör kuyruğu tarayabilmeli), kanaldan geçen metin bir tık uzakta. Gelen mesajda o metin
    müşterinin cümlesi (aynen alıntılamak gerekebilir), giden mesajda müşterinin GERÇEKTE okuduğu
    cümle — "ben öyle demedim" tartışmasında bakılacak yer orası. Künye sesli mesajda transkripte,
    ötekilerde gövdeye aittir; hangisiyse orijinal onun yerine geçer.
  */
  const [showOriginal, setShowOriginal] = useState(false);
  const original = message.translation && showOriginal ? message.translation : null;
  const transcript = original && message.mediaTranscript ? original.original : message.mediaTranscript;
  const text = original && !message.mediaTranscript ? original.original : message.text;
  return (
    <MessageRow
      side={mine ? 'out' : 'in'}
      meta={
        <>
          {mine ? (
            <span className={`font-ops-display text-ops-micro font-semibold ${ai ? 'text-ops-violet' : 'text-ops-olive-dark'}`}>
              {ai ? AI_OUTBOUND_LABEL : OUTBOUND_LABEL}
            </span>
          ) : null}
          <span className="font-ops-mono text-ops-micro text-ops-faint">{message.stamp}</span>
          {/* Şablon etiketi rozet DEĞİL, künye: mesajın kendisi değil, ücret sınıfı hakkında bir not. */}
          {message.templateLabel ? (
            <span className="font-ops-body text-ops-micro text-ops-amber">· kalıp: {message.templateLabel}</span>
          ) : null}
        </>
      }
    >
      {/* Balonun METNİ biçimli çizilir (06.09). WhatsApp müşterinin ekranında `*kalın*`ı zaten
          çiziyordu; operatör aynı mesajı çıplak yıldızlarla görüyordu — iki taraf aynı cümleyi
          farklı okuyordu. Çizici ortak (`ChatText`), balonun DERİSİ yine `bubbleClass`. */}
      <div className={bubbleClass(ai ? 'violet' : mine ? 'olive' : 'neutral', 'flex flex-col gap-2')}>
        <MediaBody message={message} transcript={transcript} lang={original?.language ?? undefined} />
        {/* Metin medyanın ALTINDA: gelen bir fotoğrafta metin alt yazıdır, başlık değil. Metin
            yoksa satır hiç çizilmiyor — boş bir balon gövdesi, olmayan bir mesaj gösterirdi.
            Orijinal gösteriliyorsa dili söylenir: tarayıcı çevirisi Fransızcayı Türkçe sanmasın. */}
        {text ? <ChatText text={text} lang={original && !message.mediaTranscript ? (original.language ?? undefined) : undefined} /> : null}
      </div>
      {message.translation ? (
        <span className={`flex items-center gap-2 ${mine ? 'self-end' : ''}`}>
          {/* MOR = makine konuştu (`ui/tone.ts`): gelen mesajda ekrandaki cümle makine çevirisidir;
              giden mesajda müşteriye giden cümle makine çevirisidir. Rozet iki yönde de bunu söyler. */}
          <Badge tone="violet">
            {mine
              ? `${languageLabel(message.translation.language)} gönderildi`
              : `otomatik çevrildi · ${languageLabel(message.translation.language)}`}
          </Badge>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive-dark underline-offset-2 hover:underline"
          >
            {showOriginal ? (mine ? 'Türkçesini göster' : 'Çeviriyi göster') : mine ? 'Gönderileni göster' : 'Orijinali göster'}
          </button>
        </span>
      ) : null}
    </MessageRow>
  );
}

interface NoteLineProps {
  note: NoteView;
}

/**
 * Sohbetin İÇ NOTU (15.29) — balon DEĞİL: müşteriye gitmedi, akışta olayın olduğu yerde duran satır.
 * Ortada ve kesikli çerçevede, çünkü iki yandan birine hizalansaydı bir tarafın mesajı sanılırdı. AI'ın
 * notu mor (makine konuştu — `ui/tone.ts`), personelinki nötr. Künye "müşteri görmez" der: operatör notu
 * müşteriye yazılmış bir cümle sanmasın.
 */
export function NoteLine({ note }: NoteLineProps) {
  const ai = note.author === 'ai';
  return (
    <div className="flex flex-col items-center gap-1 px-6">
      <span className="font-ops-mono text-ops-micro text-ops-faint">{note.stamp} · iç not — müşteri görmez</span>
      <p
        className={`max-w-[78%] whitespace-pre-wrap rounded-ops-card border border-dashed px-3 py-1.5 text-center font-ops-body text-ops-xs ${
          ai ? 'border-ops-violet-line bg-ops-violet-bg text-ops-violet' : 'border-ops-line bg-ops-card text-ops-muted'
        }`}
      >
        {note.text}
      </p>
    </div>
  );
}

/**
 * Medya gövdesi — fotoğraf görünür, ses çalınır, ötekiler indirilir.
 *
 * **Adres SÜRELİ ve bu ekranın bilmesi gereken tek şey değil:** imzalı adres dakikalar içinde ölür,
 * yani operatör sekmeyi bir saat açık bırakırsa görsel kırılır. Sayfa yenilenince yeni adres gelir;
 * kalıcı adres saklamak, sohbeti okuma yetkisi olmayan birinin bağlantıyı ele geçirmesi demekti.
 *
 * **Adres yoksa gövde YİNE ÇİZİLİR** ("[medya]" değil, sebebiyle birlikte): mesajın kendisi
 * kaybolmadı, yalnız dosyası elimizde yok. Boş bırakmak, operatöre olmayan bir sessizlik gösterirdi.
 */
function MediaBody({ message, transcript, lang }: { message: MessageView; transcript: string | null; lang?: string }) {
  if (message.kind !== 'media') return null;

  const mime = message.mediaMime ?? '';
  if (!message.mediaUrl) {
    return <span className="font-ops-body text-ops-micro text-ops-faint">Medya dosyası alınamadı — mesaj kaydedildi.</span>;
  }
  if (mime.startsWith('image/')) {
    return (
      /* Tıklayınca yeni sekmede TAM boy (talep ekranının ek küçük resimleriyle aynı desen): ezik
         kutunun köşesi 288 piksellik önizlemede görünmez, operatör kanıta yakından bakabilmeli.
         Bağlantı GEÇİDE gider — gezinme anında yeniden imzalanır, bayat adres yok. */
      <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="cursor-pointer transition-opacity hover:opacity-80">
        {/* Ham `<img>` ve sebebi var: geçidin arkasındaki adres İMZALI ve SÜRELİ. `next/image` onu
            kendi önbelleğine almaya çalışır; adres birkaç dakikada öldüğü için önbellekte kırık bir
            kayıt kalır ve optimizasyondan kazanılan hiçbir şey yoktur — dosya zaten operatörün tek
            seferlik baktığı bir kanıt, katalog görseli değil. */}
        <img src={message.mediaUrl} alt="Müşterinin gönderdiği görsel" className="max-h-72 w-auto rounded-ops-sm" />
      </a>
    );
  }
  if (mime.startsWith('audio/')) {
    return (
      <div className="flex flex-col gap-1.5">
        {/* Genişlik SABİT ve sebebi ölçülmüş (08.09): `w-full` balonun genişliğini alıyordu, balon ise
            içeriğe göre daralıyor — transkript henüz yazılmamışken balonda yalnız bu öğe kalınca ikisi
            birbirini sıfıra çekiyordu ve operatör boş bir kutu görüyordu. Oynatıcı kendi genişliğini taşır. */}
        <audio controls src={message.mediaUrl} className="w-72 max-w-full" />
        {/* Çözülmüş metin kaydın ALTINDA ve künyeli. Balonun kendi metniymiş gibi çizilseydi
            operatör onu müşterinin YAZDIĞI cümle sanırdı; oysa makine duyduğunu yazdı ve
            yanılmış olabilir. Kayıt yerinde duruyor — şüphelenen dinler. */}
        {transcript ? (
          <>
            <span className="font-ops-mono text-ops-micro text-ops-faint">yazıya çevrildi · makine</span>
            {/* Transkript operatörün dilinde gelir (15.28); orijinali gösterilirken `lang` dolar. */}
            <span lang={lang} className="whitespace-pre-wrap font-ops-body text-ops-micro italic text-ops-lead">
              {transcript}
            </span>
          </>
        ) : null}
      </div>
    );
  }
  return (
    <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="cursor-pointer font-ops-body text-ops-micro underline">
      Dosyayı aç
    </a>
  );
}

interface ConversationPaneProps {
  detail: ConversationDetailView;
  busy: boolean;
  error: string | null;
  onSendReply: (text: string) => Promise<boolean>;
  /** Yürütücü modu (16.08) — Devral da buradan geçer (`mode='human'`). */
  onMode: (mode: TicketHandler) => void;
  /** Hibrit taslağı tüket — metni döndürür, ekran cevap kutusuna taşır. */
  onConsumeDraft: () => Promise<string | null>;
  /** Taslağı istek üzerine üret (20.4) — hibritte taslak yokken. */
  onSuggestDraft: () => void;
}

export function ConversationPane({ detail, busy, error, onSendReply, onMode, onConsumeDraft, onSuggestDraft }: ConversationPaneProps) {
  // "Kutuya taşı"nın taşıdığı metin — nesne kimliği tetikleyicidir (talep ekranıyla aynı desen).
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ops-gray-25">
      {/* Başlık barı ÇİZİMİN yeri: mod anahtarı + (AI'daysa) Devral (16.08) + Sipariş oluştur (köprü 15.4;
          14.09'da sağ panelin dibinden buraya — çizim onu başlıkta çiziyor).
          SARAR (14.09, ölçüldü): 1440 px'te sohbet sütunu ~660 px ve denetimler başlığı kelime kelime alt
          alta itiyordu ("Re…"). Başlık 200 px'in altına inmez; sığmayan denetimler ikinci satıra, sağa yaslı. */}
      <div className="flex flex-none flex-wrap items-center justify-end gap-3 border-b border-ops-line bg-ops-card px-5 py-3">
        <div className="flex min-w-[200px] flex-1 flex-col">
          <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{detail.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {/* Kanal adı alt satırda da yazar: başlık bir müşteri adı olabilir ve aynı kişinin iki
                kanalda iki sohbeti olabilir — hangisine bakıldığı cümleyle söylenmeli. */}
            {SOURCE_LABELS[detail.source]} · {detail.context ? (detail.context.isCompany ? 'B2B' : 'B2C') : 'kimlik çözülmedi'} ·{' '}
            {detail.messageCount} mesaj ·{' '}
            {/* Alt satır modu CÜMLEYLE de söyler (çizim: "AI ajanı yürütüyor / insan yürütüyor") —
                anahtar seçimi, cümle durumu okur. */}
            {/* Üç mod da GERÇEK (ajan 15.8, anahtar 29.08). Bir tur boyunca burada "AI modunda ama
                ajan yok — cevapsız bekliyor" yazıyordu: ajan yazıldıktan sonra kimse cümleyi
                güncellememişti ve operatör, ajanın az önce cevapladığı sohbette "cevapsız" okuyordu
                (canlı turda görüldü 07.09). */}
            {detail.handledBy === 'ai'
              ? 'AI ajanı yürütüyor — gerekirse Devral ile araya girin'
              : detail.handledBy === 'hybrid'
                ? 'hibrit — AI taslak yazar'
                : 'insan yürütüyor'}
          </span>
        </div>
        {/* ÜÇ MOD DA AÇIK (29.08 · kullanıcı kararı). `AI` bir tur boyunca kapalıydı ve sebebi
            ipucunda yazıyordu ("mesajı gönderecek kanal açılmadı"); o kısıt kalktığı gün ipucu da
            kaldırıldı — kapalı bir düğmenin yanında duran eskimiş bir açıklama, düğmenin
            kendisinden daha yanıltıcıdır. Sunucu tarafı zaten `ConversationHandlerEnum`den
            türüyor (kural istemcinin nezaketine bırakılmaz) ve o enum de artık üç değer taşıyor. */}
        <MultiToggle size="sm" label="Yürütücü modu" value={detail.handledBy} options={handlerOptions(busy)} onChange={onMode} />
        {/* Devral yalnız AI modundayken — çizimdeki "özerk ajanı sustur" düğmesi, ve 29.08'den beri
            gerçekten o: mod açılana kadar yalnız motoru olmayan bir moda düşmüş eski satırları
            kurtarıyordu. Ajan konuşurken operatörün tek dokunuşla araya girmesi, özerk modun
            emniyet kemeridir: müşteri yanlış anlaşıldığında beklenecek bir cron turu olmamalı. */}
        {detail.handledBy === 'ai' ? (
          <Button size="sm" variant="violet" className="flex-none" onClick={() => onMode('human')} disabled={busy}>
            Devral
          </Button>
        ) : null}
        <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
        {/* Müşterinin dili (15.28) — operatör Türkçe yazar, giden bu dile çevrilir; dayanağı altlıkta. */}
        <Badge tone="slate">{LANGUAGE_LABELS[detail.language.language]}</Badge>
        {/* SİPARİŞ KÖPRÜSÜ (15.4) — YALNIZ kimlik çözülmüşken: köprü müşteri önseçili girişi açar,
            kimliksiz sohbette müşteri seçimi boş gelirdi. Bağ tek parametre taşıyor; KAYNAĞI sunucu
            konuşmadan çözüyor (`orderSourceOfConversation`) — kanalı adrese yazdırmak raporlardaki
            dağılımı elle düzenlenebilir kılardı. */}
        {detail.context ? (
          <Link
            href={`${ORDERS_PATH}/new?conversation=${detail.id}`}
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-none whitespace-nowrap' })}
          >
            Sipariş oluştur
          </Link>
        ) : null}
      </div>

      {detail.thread.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="Bu konuşmada henüz mesaj yok"
            description="Konuşma açıldı; müşteriden ya da bizden henüz mesaj yok."
          />
        </div>
      ) : (
        <MessageThread className="px-5 py-4">
          {detail.thread.map((item) =>
            item.kind === 'message' ? <Bubble key={item.message.id} message={item.message} /> : <NoteLine key={item.note.id} note={item.note} />,
          )}
        </MessageThread>
      )}

      {/* HİBRİT taslak (16.08) — talep ekranından TEK farkı eylemler: burada gönderim kanalı yok
          (15.7/15.11), taslağın tek dürüst çıkışı defter kutusuna taşınmak. Operatör metni
          telefonundan/Business Suite'ten gönderir, kutu zaten "gönderdiğini işle" kutusudur.
          Pencere kapalıyken taşınacak kutu da yok — kart yine görünür ama eylem yerine sebep yazar. */}
      {detail.handledBy === 'hybrid' ? (
        <div className="flex flex-none flex-col border-t border-ops-line bg-ops-card px-5 pt-3">
          {detail.aiDraft ? (
            <AiDraftCard draft={detail.aiDraft}>
              {humanCanReply(detail.window) ? (
                <Button
                  size="sm"
                  variant="violet"
                  disabled={busy}
                  onClick={() => {
                    void onConsumeDraft().then((draft) => {
                      if (draft) setPrefill({ text: draft });
                    });
                  }}
                >
                  Cevap kutusuna taşı
                </Button>
              ) : (
                <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                  Pencere kapalı — serbest mesaj gönderilemediği için taslak da gönderilemez.
                </span>
              )}
            </AiDraftCard>
          ) : (
            // Talep ekranıyla aynı desen (20.4): cron 5 dk'da bir üretiyor, operatör beklemek
            // zorunda değil.
            <div className="flex items-center gap-2.5 pb-1">
              <Button size="sm" variant="violet" onClick={onSuggestDraft} disabled={busy}>
                ✦ Taslak öner
              </Button>
              <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                Hibrit mod — AI taslağı yok; düğmeyle şimdi üretin ya da turu bekleyin (5 dk'da bir).
              </span>
            </div>
          )}
        </div>
      ) : null}

      <ReplyBox
        // Konuşma değişince kutu SIFIRLANIR: yarım kalmış bir metin bir sonraki müşterinin
        // penceresinde durursa yanlış sohbetin defterine işlenir.
        key={detail.id}
        source={detail.source}
        window={detail.window}
        language={detail.language}
        busy={busy}
        error={error}
        prefill={prefill}
        onSendReply={onSendReply}
      />
    </div>
  );
}

interface ReplyBoxProps {
  source: ConversationDetailView['source'];
  window: ConversationDetailView['window'];
  /** Müşteriye hangi dilde gideceği ve dayanağı (15.28) — altlık bunu operatöre SÖYLER. */
  language: ConversationDetailView['language'];
  busy: boolean;
  error: string | null;
  /** Hibrit taslağın taşıdığı metin — nesne kimliği değişince kutuya yazılır (16.08). */
  prefill?: { text: string } | null;
  onSendReply: (text: string) => Promise<boolean>;
}

/**
 * Altlık — **çizimin iki hâli birebir**: pencere açıkken tek kutu + tek eylem, kapalıyken yalnız
 * uyarı bandı (kutu HİÇ çizilmez, çizimde de yok). Bandın CÜMLESİ kanala göre seçilir (15.15):
 * WhatsApp'ta kapalı pencere bir ücret kararıdır, Messenger/IG'de bir kural sınırı — yanlış cümle
 * operatörü olmayan bir ücretten korkutur ya da olmayan bir serbestliğe güvendirir.
 *
 * Kapalıyken kutunun kalkması yalnız çizime uymak değil, DOĞRU: pencere kapalıyken serbest metin
 * kanal tarafında da gönderilemez. Yani kaydedilecek bir cevap da yoktur.
 *
 * **Kutu 06.09'da DEFTER kutusu olmaktan çıktı, GÖNDERME kutusu oldu.** Eski hâlin gerekçesi
 * gerçekti — yazışma operatörün telefonundan yürüyor, ekran kaydını tutuyordu — ama WhatsApp'ta o
 * gerekçe çöktü: numara Cloud API'ye kaydedildi ve Meta'nın kuralı gereği artık WhatsApp Business
 * uygulamasıyla kullanılamıyor. Telefondan yazan kimse kalmayınca "Deftere işle" düğmesi sessizce
 * bir yalana döndü: operatör cevabı yazıyor, satır deftere düşüyor, müşteriye HİÇBİR ŞEY gitmiyor.
 * Şimdi düğme gerçekten gönderiyor ve gönderemezse SEBEBİNİ söylüyor (`SEND_REFUSAL`).
 *
 * **GELEN mesaj yalnız kanaldan gelir** (webhook). Elle kaydı 15.36'da kalktı (kullanıcı kararı 15.09):
 * operatörün yazdığı bir "gelen" satır, müşterinin söylemediği bir cümleyi deftere onun ağzından yazabilirdi.
 *
 * **Messenger/Instagram'da kutu 7 güne kadar açık (15.37):** 24 saat dolunca insan temsilci süresi başlar;
 * karar `humanCanReply`de, gönderim kapısının aynı kuralı (yapay zekâ bu sürede yazamaz).
 */
export function ReplyBox({ source, window: win, language, busy, error, prefill, onSendReply }: ReplyBoxProps) {
  const [text, setText] = useState('');

  /*
    DİL CÜMLESİ (15.28): operatör Türkçe yazar ve mesaj müşterinin diline çevrilerek gider — bunu
    görmeden gönderen operatör, müşterinin Fransızca okuduğunu bilmez ve "neden Türkçe cevap
    yazdın" sorusu asla cevaplanamaz. Türkçe konuşan müşteride çeviri yok ve bu da söylenir.
    Dayanak parantezde: varsayılana düşmüş sohbet (müşteri henüz yazmadı) dikkat ister.
  */
  const dilNotu =
    language.language === 'tr'
      ? `Müşteriyle Türkçe yazışılıyor (${LANGUAGE_BASIS_NOTE[language.basis]}).`
      : `Türkçe yazın — müşteriye ${LANGUAGE_LABELS[language.language]} çevrilerek gider (${LANGUAGE_BASIS_NOTE[language.basis]}).`;

  // Taslak kutuya OPERATÖRÜN kararıyla taşınır ("Cevap kutusuna taşı") — ezmesi bu yüzden kabul:
  // basılan düğme zaten "bu metinle çalışacağım" demek (talep ekranıyla aynı kural).
  useEffect(() => {
    if (prefill) setText(prefill.text);
  }, [prefill]);

  const submit = async () => {
    if (!text.trim()) return;
    if (await onSendReply(text)) setText('');
  };

  if (!humanCanReply(win)) {
    return (
      <div className="flex flex-none border-t border-ops-line bg-ops-card px-5 py-3">
        <div className="flex w-full items-center gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
          <span className="flex-none text-ops-amber">
            <AlertIcon size={16} />
          </span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">{WINDOW_NOTE[source][win.state]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-none flex-col gap-1.5 border-t border-ops-line bg-ops-card px-5 py-3">
      <div className="flex items-end gap-2.5">
        <Textarea
          className="flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Cevabınızı yazın…"
        />
        <Button variant="primary" className="flex-none whitespace-nowrap" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {busy ? 'Gönderiliyor…' : 'Gönder'}
        </Button>
      </div>
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        {error ? (
          <span className="font-semibold text-ops-red">{error}</span>
        ) : (
          <>
            {win.state === 'human'
              ? `${WINDOW_NOTE[source].human} ${win.chip} kaldı · yapay zekâ bu sürede yazamaz.`
              : `${WINDOW_NOTE[source].open} ${win.chip} kaldı · bu süre içinde cevap ücretsizdir.`}
          </>
        )}
      </span>
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{dilNotu}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAĞ — müşteri bağlamı (ORTAK pano + bu ekrana özel bloklar)
// ─────────────────────────────────────────────────────────────────────────────

/*
  ÇİZİMİN İSKELETİ (14.09 · kullanıcı isteği: "işlevi olmayan bilgi ve butonları kaldıralım, orijinal
  tasarıma uygun hâle getirelim"). Çizim: ad + rozet · son siparişler · kampanya izni · tek eylem.

  Kalkanlar: açıklama paragrafları (pano bir kılavuz değil), telefon/anahtar satırı (çizimde yok, işi
  yok), boş liste cümleleri, "Müşterilerde ara" (bağla penceresi zaten arıyor).

  İŞLEVİ OLAN ama çizimde yeri olmayanlar çizimin diline indi: izin kaydı rozetin menüsünde, kimlik
  çapası tek satır + pencere (`AnchorDialog`), sepet/hesap bağlantısı YALNIZ pencere açıkken (kapalıyken
  gönderim kapısı reddeder — düğme işlevsizdi), sipariş köprüsü başlıkta.
*/

/**
 * **Kimlik çapası** (04.10 · DOMAIN §10) — "bu numaranın GEÇMİŞİ kimin" sorusunun kapısı.
 *
 * Numaranın kanıtlanması "bu hat BUGÜN bu kişide" der. Devredilmiş hattın yeni sahibi hattı da
 * gelen kodu da meşru olarak alır — çözen tek şey, ŞÜPHE DOĞMADAN ÖNCE kurulmuş bir sırdır. Bu
 * yüzden blok "dönüşte" değil, müşteri hâlâ tanıdığımız hâldeyken kullanılır.
 *
 * **"Kod doğrula" kutusu YOK ve olmayacak** (DOMAIN §10, açık yasak): doğrulama yalnız müşterinin
 * KENDİ numarasından gelen mesajla olur. Telefonda arayan müşteriyi bu ekrandan doğrulamanın yolu
 * yoktur; operatör ondan WhatsApp'tan yazmasını ister ya da birleştirmeye gider (04.7).
 *
 * Çapası olana ikinci çapa sunulmaz: iki anahtar bir arada bulunmaz ve ikincisi yalnız silinecek
 * bir sır üretirdi.
 */
/**
 * **Cevaplanmayan kimlik sorusu** (04.10) — sistemin kendi başına bitiremediği tek hâl.
 *
 * Soru kendiliğinden soruluyor ve kapı kendiliğinden kapanıyor; ama cevap hiç gelmezse ortada
 * SESSİZCE bekleyen bir insan kalır ve sistem bunu bir daha hatırlatmaz. `DOMAIN §10`: *"kalanı bir
 * kapıya değil İNSANA düşür."* Bu blok o düşürmenin kendisi.
 *
 * **Sipariş sayısı aciliyettir, süs değil:** soru açıldıktan sonra sipariş gelmeye devam ediyorsa,
 * kimliği doğrulanmamış birinin siparişleri başkasının kaydına yazılıyor olabilir. Sıfırsa acele
 * yok — muhtemelen kimse dönmedi.
 */
function PendingChallenge({ challenge }: { challenge: AnchorSnapshot['challenge'] }) {
  if (!challenge) return null;

  const gun = Math.floor((Date.now() - new Date(challenge.raisedAt).getTime()) / 86_400_000);
  const sebep = challenge.reason === 'delivery_failed' ? 'taşıyıcı ulaşamadı' : 'uzun sessizlik';

  return (
    <div className="mt-1 flex w-full flex-col gap-0.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-2.5 py-2">
      <span className="font-ops-body text-ops-xs font-semibold text-ops-amber-dark">Kimlik sorusu cevapsız · {sebep}</span>
      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
        {gun === 0 ? 'Bugün soruldu' : `${gun} gündür bekliyor`}
        {challenge.ordersSince > 0
          ? ` · o gün bugündür ${challenge.ordersSince} sipariş geldi. Numara devredilmiş olabilir — kayıtları ayırmayı değerlendirin.`
          : ' · sonrasında sipariş gelmedi.'}
      </span>
    </div>
  );
}

interface AnchorRowProps {
  anchor: AnchorSnapshot;
  busy: boolean;
  onOpen: () => void;
}

/**
 * Kimlik çapasının panodaki TEK SATIRI (14.09): durum rozeti + kurma bağı. E-posta kutusu, 6 haneli kod
 * ve gerekçesi pencerede (`AnchorDialog`) — kararın verildiği yer orası; panonun her açılışında
 * okunacak bir kılavuz değil. Çapası olana ikinci çapa sunulmaz, bağ o hâlde hiç çizilmez.
 */
function AnchorRow({ anchor, busy, onOpen }: AnchorRowProps) {
  const kurulu = anchor.state !== 'none';
  const rozet: { label: string; tone: 'olive' | 'amber' | 'slate' } = kurulu
    ? { label: anchor.state === 'email' ? 'E-posta bağlı' : 'Kod verildi', tone: 'olive' }
    : anchor.hasPendingEmail
      ? { label: 'Cevap bekleniyor', tone: 'amber' }
      : { label: 'Kurulmadı', tone: 'slate' };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <SectionLabel>Kimlik çapası</SectionLabel>
      <div className="flex items-center gap-2">
        <Badge tone={rozet.tone}>{rozet.label}</Badge>
        {kurulu ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={onOpen}
            className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {anchor.hasPendingEmail ? 'Yeniden gönder →' : 'Kur →'}
          </button>
        )}
      </div>
      {kurulu ? <PendingChallenge challenge={anchor.challenge} /> : null}
    </div>
  );
}

interface LinkedTicketsProps {
  tickets: ConversationDetailView['tickets'];
}

/** Bu sohbetten açılmış talepler — köprü iki yönlü. Boşken HİÇ çizilmez (14.09): "açılmadı" cümlesi bir iş yaptırmıyordu. */
function LinkedTickets({ tickets }: LinkedTicketsProps) {
  if (tickets.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Bağlı talepler</SectionLabel>
      {tickets.map((t) => (
        <Link
          key={t.id}
          href={`${TICKETS_PATH}?t=${t.id}`}
          className="flex cursor-pointer flex-col rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 hover:border-ops-line-strong"
        >
          <span className="truncate font-ops-body text-ops-xs text-ops-ink">{t.subject}</span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{t.statusLabel}</span>
        </Link>
      ))}
    </div>
  );
}

interface SocialContextPaneProps {
  context: CustomerContextData | null;
  /** Konuşmanın dış anahtarı — WhatsApp'ta okunaklı telefon, Messenger/IG'de opak PSID/IGSID. */
  externalRef: string;
  source: ConversationDetailView['source'];
  profileName: string | null;
  tickets: ConversationDetailView['tickets'];
  /** Kampanya izninin üç hâli (`consentStateOf`) — rozet ve kayıt menüsü buradan. */
  consent: ConsentState;
  /** Kimlik çapası (04.10) — kimliksiz sohbette `null`, satır hiç çizilmez. */
  anchor: AnchorSnapshot | null;
  /**
   * Sohbete mesaj gidebiliyor mu (pencere açık). Bağlantı düğmeleri SOHBETE mesaj gönderir ve pencere
   * kapalıyken gönderim kapısı reddeder — o hâlde düğme işlevsizdir ve çizilmez (14.09).
   */
  canMessage: boolean;
  busy: boolean;
  onNewTicket: () => void;
  /** Kimliksiz sohbeti müşteriye bağlama penceresini açar (15.16). */
  onLinkCustomer: () => void;
  /** Sohbette verilen izni KAYDET (15.12) — operatör karar vermez, müşterinin dediğini yazar. */
  onOptIn: (granted: boolean) => void;
  /** Kimlik çapası penceresini açar (04.10). */
  onOpenAnchor: () => void;
  /** Sepet bağlantısı (15.21) — sohbeti personel yürütürken müşteriyi sepete taşıyan tek yol. */
  onSendCartLink: () => void;
  /** Hesap bağlantısı (15.16) — müşteri e-postasıyla giriş yapar, sohbet kendi hesabına bağlanır. */
  onSendAccountLink: () => void;
}

export function SocialContextPane({
  context,
  externalRef,
  source,
  profileName,
  tickets,
  consent,
  anchor,
  canMessage,
  busy,
  onNewTicket,
  onLinkCustomer,
  onOptIn,
  onOpenAnchor,
  onSendCartLink,
  onSendAccountLink,
}: SocialContextPaneProps) {
  const whatsapp = source === 'whatsapp';
  // Müşteri araması kanala göre ANLAMLI anahtarla yapılır: WhatsApp'ta numara kimlik anahtarıdır ve
  // kesin eşleşir; Messenger/IG'de elimizde yalnız görünen ad var — arama kesinlik değil ADAY verir.
  const searchHref = customersUrl({ q: whatsapp ? externalRef : (profileName ?? ''), type: 'all', scope: 'all', mc: 'any' });

  if (!context) {
    return (
      <ContextPane>
        <div className="flex flex-col items-start gap-1.5">
          {/* WhatsApp'ta anahtar (telefon) gösterilir — operatörün tanıdığı şey. PSID/IGSID GÖSTERİLMEZ:
              operatöre hiçbir şey söylemez, profil adı söyler. */}
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">
            {whatsapp ? externalRef : (profileName ?? 'İsimsiz profil')}
          </span>
          <Badge tone="amber">Kimlik yok</Badge>
        </div>
        {/* Kimliksiz sohbet bir ARIZA DEĞİL — Messenger/IG'de varsayılan hâl (PSID/IGSID telefon taşımaz);
            WhatsApp'ta telefon/e-posta çakışmasında bilerek bağlanmadan açılır. Kimliğin kurulduğu TEK yer
            bağla penceresi (15.16) ve arama da onun içinde — ayrı "Müşterilerde ara" bağı bu yüzden kalktı. */}
        <ContextNotice>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            {whatsapp ? 'Numara bir müşteriye bağlanmadı.' : 'Sohbet bir müşteriye bağlı değil.'}
          </span>
          <button
            type="button"
            onClick={onLinkCustomer}
            className="cursor-pointer self-start font-ops-display text-ops-xs font-semibold text-ops-amber hover:underline"
          >
            Müşteriye bağla →
          </button>
        </ContextNotice>
        {/* MÜŞTERİNİN KENDİ BAĞLADIĞI YOL (15.16) — bağlantı sohbete gider, müşteri e-postasıyla giriş
            yapınca sohbet onun hesabına bağlanır. Sohbete mesajdır: yalnız pencere açıkken bir iş yapar. */}
        {canMessage ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onSendAccountLink}>
            Hesap bağlantısı gönder
          </Button>
        ) : null}
      </ContextPane>
    );
  }

  return (
    <ContextPane>
      {/* WhatsApp'ta ad müşteri ekranına NUMARAYLA gider (kimliğin anahtarı numara; aynı adlı iki
          müşteri varsa ad araması ikisini birden getirirdi). */}
      <ContextIdentity context={context} href={searchHref} />

      {/* Taslak kayıt — çizimin uyarısı. Birleştirme MÜŞTERİLER ekranının işi (09.10): bağ oraya aramayla
          gider, burada ikinci bir birleştirme kapısı çizilmez. */}
      {context.isDraft ? (
        <ContextNotice>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            {whatsapp ? 'Numara kayıtlı müşteriyle eşleşmedi — taslak kayıt.' : 'Sohbetten açılmış taslak kayıt.'}
          </span>
          <Link href={searchHref} className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-amber hover:underline">
            Müşteriye bağla →
          </Link>
        </ContextNotice>
      ) : null}

      <ContextOrders context={context} />

      {/* Kampanya izni — çizimin rozeti; rozete basınca müşterinin sohbette verdiği cevap kaydedilir
          (15.12). Kaydın nereye yazıldığı menüde söylenir: WhatsApp'ta müşteri kartına da işlenir,
          Messenger/IG'de yalnız bu sohbete (izin şeması bugün email + whatsapp taşıyor). */}
      <ContextConsent
        state={consent}
        onRecord={onOptIn}
        busy={busy}
        recordHint={whatsapp ? 'Müşteri kartına da işlenir.' : `Yalnız bu ${SOURCE_LABELS[source]} sohbetine yazılır.`}
      />

      {anchor ? <AnchorRow anchor={anchor} busy={busy} onOpen={onOpenAnchor} /> : null}

      <LinkedTickets tickets={tickets} />

      {/* SEPET BAĞLANTISI (15.21 · kullanıcı izni 07.09) — ajanın `sepet_baglantisi` aracının insan eli.
          Sohbete mesaj gönderir: pencere kapalıyken gönderim kapısı reddeder, düğme o hâlde çizilmez. */}
      {canMessage ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={onSendCartLink}>
          Sepet bağlantısı gönder
        </Button>
      ) : null}
      <Button variant="danger" size="sm" onClick={onNewTicket}>
        Talep (şikâyet) aç
      </Button>
    </ContextPane>
  );
}
