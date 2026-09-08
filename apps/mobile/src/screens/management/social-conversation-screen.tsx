import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
// `ScrollView` artık yalnız TİP: kaydırıcıyı `ChatLayout` çiziyor, ekran ona yalnız ref veriyor.
import {
  ActivityIndicator,
  Image,
  Linking,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollView,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationHandlerEnum, type ConversationHandler } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { AudioPlayer } from '@/components/ui/audio-player';
import { ChatLayout } from '@/components/ui/chat-layout';
import { Icon } from '@/components/ui/icon';
import { PhotoViewer } from '@/components/ui/photo-viewer';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { ChatText } from '@/components/ui/chat-text';
import type { SocialMessage } from '@/lib/api/social';
import { fillCopy, operationsFailureText } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { ManagementChatBubble } from './chat-bubble';
import { managementCopy } from './copy';
import { socialStamp, socialTitle, socialWindowOf } from './social-format';
import { useSocialConversation } from './use-social-conversation.hook';

/*
  SOSYAL SOHBET (Operasyon Mobil v3:2229-2278) — web sohbet panelinin mobil aynası; verisi gerçek
  uçtan (`use-social-conversation.hook`).

  ── v3'ÜN ÜÇ DÜZEN KARARI (30.08) ───────────────────────────────────────────
  1. **BİZİM BALONCUK KOYULAŞTI** (v3:2246). v2'de operatörün sözü açık yeşil bir baloncuktu;
     v3'te mürekkep zeminde krem yazı. Kazanç okuma yönü: sohbette "kim konuşuyor" sorusu artık
     hizadan DEĞİL, kontrasttan da okunuyor — tek bakışta bizim yazdıklarımız görünüyor.
     Baloncukların KUYRUK KÖŞESİ küçüldü (v3: 5px): konuşanın tarafına bakan köşe sivri kalır ve
     baloncuk konuşana "yapışır".
  2. **DAMGA BALONCUĞUN DIŞINA ÇIKTI** (v3:2250). v2 künyeyi baloncuğun İÇİNE, metnin üstüne
     yazıyordu; her mesaj iki satırla başlıyordu. v3'te künye baloncuğun ALTINDA, kendi tarafına
     hizalı gri bir satır — mesajın kendisi baloncuğun tamamını kullanıyor.
     v3 yalnız SON mesajın künyesini çiziyor; bizde HER mesajınki duruyor: sohbet defterinde
     "hangi mesaj ne zaman" sorusu geriye doğru da sorulur ve tek damga onu cevaplamaz.
  3. **BEKLEYEN TASLAK YAZIŞMADAN ÇIKIP ÇUBUĞUN ÜSTÜNE TAŞINDI** (v3:2262). Taslak bir MESAJ
     değil, bir EYLEMdir: müşteriye gitmemiştir, operatörün onayını bekler. Yazışmanın içinde
     dururken gönderilmiş bir söz gibi okunuyordu ve sohbet uzadıkça yukarı kayıp kayboluyordu.
     Yeni yeri cevap kutusunun hemen üstü — kararın verildiği yer. "Taslak öner" düğmesi de aynı
     yuvaya taşındı: ikisi tek slotun iki hâli (taslak var / yok).

  ── TASARIMIN İSTEDİĞİ AMA YAZILMAYANLAR ────────────────────────────────────
  · **"Reddet" düğmesi** (v3:2270): taslağı reddeden bir uç YOK — sözleşmede yalnız TÜKETME var
    (`consumeSocialDraft`, metni döndürür). Basıldığında hiçbir şey yapmayan bir düğme, operatöre
    "reddettim" dedirtip taslağı yerinde bırakırdı.
  · **Künyedeki "B2B · Oberjaegerhof"** (v3:2237): sohbet satırında ne müşteri tipi (B2B) ne de
    işletme adı var (`SocialConversationRowSchema`); künye kanalı ve — yalnız WhatsApp'ta —
    okunabilir anahtarı yazar.
  · **Mod çipleri BAŞLIK SATIRINA taşınmadı** (v3:2239). v3 orada İKİ çip çiziyor; bizde üç mod
    var (`ConversationHandlerEnum` — `ai` 29.08'de gerçek bir motora bağlandı) ve üç çip, geri
    düğmesi ve iki satırlık künyeyle aynı satıra sığmıyor. Çipler kendi şeritlerinde kaldı.
  · ~~**Kâğıt uçak düğmesi** (v3:2276): buradan mesaj GİTMEZ, deftere yazılır.~~ **DEFTER EVRESİ
    BİTTİ (21.286 · kullanıcı kararı 07.09).** Uç artık `sendOutboundMessage` çağırıyor: mesaj
    WhatsApp'tan müşteriye gidiyor. Düğme "Gönder" diyor ve altındaki not gönderimin GERİ
    ALINAMAZ olduğunu söylüyor — eski notun ("buradan gönderilmez") tersi, çünkü gerçek tersine
    döndü. Gerekçe: web `sendOutboundMessage` çağırırken mobilin defterde kalması aynı konuşmayı
    iki yüzeyde iki ayrı yetenek yapıyordu; operatör telefondayken cevap veremiyordu.
  · **Cevap süresi bandı KALDI** (v3'te yok): WhatsApp'ın 24 saatlik penceresi bir ÜCRET kararıdır
    ve kapalıyken serbest metin gitmez. Şablonun onu çizmemesi kuralın kalktığı anlamına gelmez.

  ── COMPLAINT'TEN BİLİNÇLİ SAPMALAR ─────────────────────────────────────────
  · Taslağın TEK çıkışı var ("Cevap kutusuna al"), iki değil: complaint'in "Cevaba çevir →"ü
    ticket dünyasınındır — orada gönderim gerçek. Burada defter evresindeyiz (uç künyesi): taslağı
    doğrudan "cevap" yapmak, müşteriye HİÇ GİTMEMİŞ bir metni gönderilmiş gibi kaydetmek olurdu.
    Web'in aynı kararı (`consumeConversationDraftAction` künyesi): tek dürüst çıkış kutuya taşınmak.
  · "Üstlen" yok, YÜRÜTÜCÜ seçici var (İnsan · Hibrit · AI) — konuşmanın sahibi bir durum geçişi
    değil bir moddur (kullanıcı kararı 16.08, talep ekranıyla aynı üçlü).
  · Çeviri/orijinal toggle'ı YOK: konuşma mesajında çeviri alanı henüz yok (AI ajan boşluk paketi
    №7 — kullanıcı onayı bekliyor); olmayan alana toggle çizmek boş bir vaat olurdu.

  ── PENCERE BANDI KANAL BAŞINA CÜMLE KURAR (web `WINDOW_NOTE` kararı) ───────
  "Kapalı" WhatsApp'ta bir ÜCRET kararıdır, Messenger/IG'de bir KURAL sınırıdır (insan-temsilci,
  7 gün, ücretsiz). Tek cümleyi üç kanala yaymak operatörü ya korkutur ya yanlış serbestliğe
  güvendirirdi. Kimlik satırı da kanal-duyarlı: WhatsApp'ta telefon okunur, Messenger/IG'de
  PSID/IGSID GÖSTERİLMEZ (webde de gösterilmiyor — operatöre hiçbir şey söylemeyen opak dize).
*/

const t = managementCopy.social;
const td = managementCopy.social.detail;

/*
  YÜRÜTÜCÜ MODLARI ENUM'DAN TÜRER, ELLE SAYILMAZ — kaynak tek: `ConversationHandlerEnum` (API
  isteği de onunla doğrulanır).

  Tarihçe kararın neden türetildiğini anlatıyor: enum bir tur boyunca `ai`yi DIŞLIYORDU çünkü
  arkasında koşan bir motor yoktu (cron yalnız hibrit sohbetleri tarıyordu) ve "AI" seçildiğinde
  sohbet, operatör AI'ın ilgilendiğini sanarken cevapsız kalıyordu. Kısıt 29.08'de kalktı (motor +
  cron + gönderim kanalı, üçü de ölçüldü); üçüncü çip bu ekranda TEK SATIR bile değişmeden doğdu.
*/
const MODES = ConversationHandlerEnum.options;

/** Ret anahtarı → operatör cümlesi; tanınmayan anahtar (taşıma hatası vs.) genel cümleye düşer. */
function failureText(key: string): string {
  const table: Record<string, string | undefined> = td.failure;
  return table[key] ?? td.failure.generic;
}

/*
  ══ MEDYA (21.287) ═══════════════════════════════════════════════════════════
  Buraya kadar medya mesajı ekranda `[görsel / dosya]` yazısıydı: sözleşme `mediaMime`i,
  `mediaTranscript`i ve adresi hiç taşımıyordu, yani ekran fotoğrafı da sesi de aynı yer tutucuyla
  çiziyordu. Web ikisini de çiziyordu (`social-sections.tsx`) — saha yüzeyi mobil olduğu hâlde
  operatör telefonundayken müşterinin gönderdiği fotoğrafı GÖREMİYORDU.

  ── ARDIŞIK FOTOĞRAFLAR TEK IZGARADA (kullanıcı kararı 07.09) ───────────────
  *"Arka arkaya gönderildiği zaman mesajlaşma alanı dolmamalı, tıpkı talebin ilk açıldığı zamanki
  gibi resimler yan yana."* Kural: aynı taraftan (yön + yazar) gelen, ALT YAZISIZ ardışık
  fotoğraflar tek baloncukta toplanır.

  Alt yazılı fotoğraf öbeği KIRAR ve kendi baloncuğunda çizilir: alt yazı okunacak bir sözdür ve
  ızgaraya karışsaydı hangi karonun sözü olduğu kaybolurdu. Ses ve öteki dosyalar hiç toplanmaz —
  her birinin kendi eylemi (dinle/aç) ve kendi transkripti var.

  Öbekleme SUNUM işidir ve yalnız burada yaşar: uç mesajları tek tek gönderiyor, defter tek tek
  tutuyor. "Beş fotoğraflı mesaj" diye bir kayıt yok — beş mesaj var, ekran onları bir arada
  gösteriyor.
*/

/** Sohbet akışının çizim birimi: ya tek mesaj ya da bir fotoğraf öbeği. */
type ThreadItem =
  | { key: string; kind: 'single'; message: SocialMessage }
  /** `head` öbeğin İLK mesajı — tonu (kim gönderdi) ondan okunur, damga son mesajdan. */
  | { key: string; kind: 'photos'; side: string; head: SocialMessage; messages: SocialMessage[] };

const mimeOf = (message: SocialMessage): string => message.mediaMime ?? '';
const isPhoto = (message: SocialMessage): boolean => message.kind === 'media' && mimeOf(message).startsWith('image/');
const isVoice = (message: SocialMessage): boolean => message.kind === 'media' && mimeOf(message).startsWith('audio/');
/** Izgaraya yalnız SÖZSÜZ fotoğraf girer (künye). */
const isBarePhoto = (message: SocialMessage): boolean => isPhoto(message) && !message.body.text?.trim();
/** Öbeğin tarafı: yön + yazar. Operatörün ve asistanın fotoğrafları aynı ızgarada toplanmaz — tonları ayrı. */
const sideOf = (message: SocialMessage): string => `${message.direction}:${message.author}`;

/** Mesaj dizisini çizim birimlerine böler — ESKİDEN YENİYE sıra korunur. */
function threadItemsOf(messages: readonly SocialMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];

  for (const message of messages) {
    const last = items.at(-1);
    if (isBarePhoto(message) && last?.kind === 'photos' && last.side === sideOf(message)) {
      last.messages.push(message);
      continue;
    }
    items.push(
      isBarePhoto(message)
        ? { key: message.id, kind: 'photos', side: sideOf(message), head: message, messages: [message] }
        : { key: message.id, kind: 'single', message },
    );
  }

  return items;
}

/** Karolar arası boşluk — ölçüyü hem satır genişliği hem stil okuyor, iki yerde yazılmasın. */
const PHOTO_GAP = operationsTheme.space.sm;

/**
 * Karonun DP ÖLÇÜSÜ — cihaz genişliğinden hesaplanır, yüzdeyle verilmez.
 *
 * ── ÇÖZÜLEN ARIZA: BOŞ BALONCUK (cihaz turu 07.09) ──────────────────────────
 * İlk turda karo `flexBasis: '31%'`, tek fotoğraf `width: '100%'` idi ve ekranda **boş, minik bir
 * baloncuk** çıktı. Sebep bir ölçüm döngüsü: baloncuk (`line`) genişliğini İÇERİĞİNDEN alıyor
 * (`maxWidth: 86%` bir tavan, bir genişlik değil), içerik ise genişliğini yüzdeyle baloncuktan
 * istiyordu. Referansı olmayan yüzde sıfıra çöküyor.
 *
 * Tek fotoğrafın çalışıyor görünmesi bir RASTLANTIYDI: o baloncukta alt yazı vardı ve genişliği
 * METİN veriyordu. Alt yazısız tek fotoğraf da aynı şekilde çökerdi — yani arıza "ızgarada" değil,
 * yüzdeli ölçünün kendisindeydi.
 *
 * Hesap `thread`/`line`/`bubble` ölçüleriyle AYNI kaynaklardan kurulur; sabit bir sayı yazılsaydı
 * dar ekranda taşar, geniş ekranda boşluk bırakırdı.
 */
function photoFrame(screenWidth: number, solo: boolean): { width: number; height: number } {
  const available = screenWidth - operationsTheme.space['6xl'] * 2; // `thread.paddingHorizontal`
  const inner = available * 0.86 - operationsTheme.space['2xl'] * 2; // `line.maxWidth` − `bubble.paddingHorizontal`
  // Tek fotoğraf baloncuğun genişliğini alır ve 4:3 durur; ızgarada üç kare + iki boşluk.
  if (solo) return { width: inner, height: Math.round((inner * 3) / 4) };
  const tile = Math.floor((inner - PHOTO_GAP * 2) / 3);
  return { width: tile, height: tile };
}

/**
 * Fotoğraf ızgarası — dokunuş UYGULAMA İÇİNDE tam ekran görüntüleyiciyi açar (kullanıcı kararı
 * 07.09: *"Uygulama dışına çıkışlar olmamalı."*).
 *
 * Bir tur boyunca `Linking.openURL` ile sistem tarayıcısı açılıyordu ve cihazda çalışıyordu — ama
 * operatörü yazışmadan çıkarıyordu. Görüntüleyici kitte (`components/ui/photo-viewer`) çünkü talep
 * ekleri de aynı kapıyı kullanıyor; ekranın içine yazılsaydı ikinci bir görüntüleyici doğardı.
 *
 * Görüntüleyiciye YALNIZ adresi olan fotoğraflar girer: indirmesi düşmüş bir karo tam ekranda
 * gösterilecek hiçbir şey taşımıyor. Bu yüzden karonun ızgaradaki sırası ile görüntüleyicideki
 * sırası AYRI hesaplanır — ikisini eşit saymak, boş karodan sonra yanlış fotoğrafı açardı.
 */
function PhotoGroup({ messages }: { messages: readonly SocialMessage[] }) {
  const [opened, setOpened] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const solo = messages.length === 1;
  const missing = messages.filter((message) => message.mediaUrl === null).length;
  const frame = photoFrame(width, solo);
  const uris = messages.map((message) => message.mediaUrl).filter((url): url is string => url !== null);

  return (
    <View style={styles.mediaWrap} testID="management-social-photos">
      <View style={[styles.photoRow, { width: solo ? frame.width : frame.width * 3 + PHOTO_GAP * 2 }]}>
        {messages.map((message, index) =>
          message.mediaUrl === null ? (
            /* İNDİRMESİ DÜŞMÜŞ FOTOĞRAF — satır yine var (varlık künyesi: defterin ilk kuralı
               mesajın kaybolmamasıdır). Boş karo "bir fotoğraf gönderildi ama elimizde yok"
               der; hiç çizmemek mesajı yok saymak olurdu. */
            <View key={message.id} style={[styles.photoFrame, frame, styles.mediaMissing]}>
              <Icon name="camera" size={operationsTheme.size.tileIcon} color={operationsTheme.colors.muted} />
            </View>
          ) : (
            <PressableSurface
              key={message.id}
              onPress={() => setOpened(uris.indexOf(message.mediaUrl ?? ''))}
              feedback="opacity"
              compact
              style={[styles.photoFrame, frame]}
              accessibilityLabel={fillCopy(td.media.photoLabel, { i: String(index + 1) })}
              testID={`management-social-photo-${index}`}
            >
              <Image source={{ uri: message.mediaUrl }} style={styles.photoImage} resizeMode="cover" />
            </PressableSurface>
          ),
        )}
      </View>
      {missing === 0 ? null : (
        <Text style={styles.mediaNote} testID="management-social-photo-missing">
          {fillCopy(td.media.missing, { n: String(missing) })}
        </Text>
      )}
      <PhotoViewer
        uris={uris}
        initialIndex={opened ?? 0}
        visible={opened !== null}
        onClose={() => setOpened(null)}
        labels={{ counter: td.media.viewerCounter, close: managementCopy.common.close }}
        testID="management-social-photo-viewer"
      />
    </View>
  );
}

/**
 * Sesli mesaj — UYGULAMA İÇİ çalar + TRANSKRİPT.
 *
 * ── ÇALMA ARTIK İÇERİDE ─────────────────────────────────────────────────────
 * Bir tur boyunca dokunuş sesi sistem tarayıcısında açıyordu. Cihazda ölçüldü ve çalıştı, ama
 * operatörü yazışmadan çıkarıyordu — bir sesli mesaj, cevabı yazarken dinlenmek ister. Kullanıcı
 * kararıyla `expo-audio` eklendi (natif modül; dev client yeniden derlendi) ve çalar kite girdi.
 *
 * Çalar YALNIZ adres varken çizilir: dosyası olmayan bir kayıt için oynatıcı çizmek, basılınca
 * hiçbir şey olmayan bir düğme göstermek olurdu — o hâlde sebebi yazan tek satır kalır.
 *
 * ── ASIL İÇERİK TRANSKRİPT ──────────────────────────────────────────────────
 * Ses çalınamasa bile operatör ne söylendiğini okuyabilmeli. Transkript `body.text`ten AYRI
 * çiziliyor ve makine çıktısı olduğu YAZIYOR (varlık künyesi 15.26): operatör hangi cümlenin
 * insandan geldiğini bilmek zorunda — makine çözümünü müşterinin kesin sözü sanmak, yanlış
 * cevabın en sessiz yoludur.
 */
function VoiceCard({ message }: { message: SocialMessage }) {
  const url = message.mediaUrl;
  const transcript = message.mediaTranscript?.trim();

  return (
    <View style={styles.mediaWrap} testID="management-social-voice">
      <View style={styles.voiceRow}>
        <Icon name="mic" size={operationsTheme.size.rowIcon} color={operationsTheme.colors.olive} />
        <Text style={styles.voiceLabel}>{url === null ? td.media.voiceMissing : td.media.voice}</Text>
      </View>
      {url === null ? null : (
        <AudioPlayer
          uri={url}
          labels={{ play: td.media.play, pause: td.media.pause, loading: td.media.loading }}
          testID="management-social-voice-play"
        />
      )}
      {transcript ? (
        <View style={styles.transcript} testID="management-social-transcript">
          <Text style={styles.transcriptEyebrow}>{td.media.transcript}</Text>
          <Text style={styles.transcriptBody}>{transcript}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Ne fotoğraf ne ses — belge/video. Türü söylenir ve sistem uygulamasında açılır. */
function FileCard({ message }: { message: SocialMessage }) {
  const [failed, setFailed] = useState(false);
  const url = message.mediaUrl;

  return (
    <View style={styles.mediaWrap} testID="management-social-file">
      <PressableSurface
        onPress={() => {
          if (url !== null) void Linking.openURL(url).catch(() => setFailed(true));
        }}
        disabled={url === null}
        feedback="opacity"
        compact
        style={styles.voiceRow}
        accessibilityLabel={td.media.fileLabel}
        testID="management-social-file-open"
      >
        <Icon name="packages" size={operationsTheme.size.rowIcon} color={operationsTheme.colors.olive} />
        {/* Tür HAM mime olarak yazılır: sözlük kurmak, her yeni türde ekranın "bilinmeyen dosya"
            demesi demekti — mime en azından operatöre ne beklediğini söyler. */}
        <Text style={styles.voiceLabel}>{url === null ? td.media.fileMissing : mimeOf(message) || td.media.file}</Text>
      </PressableSurface>
      {/* TEK KALAN DIŞ ÇIKIŞ ve operatöre SÖYLENİYOR (21.287): fotoğraf ve ses artık uygulama
          içinde açılıyor, video/belge için içeride bir görüntüleyici YOK — video ayrı bir natif
          modül (`expo-video`), belge ise hiç. Sessizce dışarı atmak yerine cümlesi yazılıyor;
          `BEKLEYEN(BACKLOG §1)` orada. */}
      {url === null ? null : <Text style={styles.mediaNote}>{td.media.fileNote}</Text>}
      {failed ? (
        <Text style={styles.mediaNote} testID="management-social-file-error">
          {td.media.openFailed}
        </Text>
      ) : null}
    </View>
  );
}

/** Mesajın baloncuk İÇERİĞİ — medya yoksa `undefined` ve baloncuk eskisi gibi yalnız söz taşır. */
function contentOf(message: SocialMessage) {
  if (message.kind !== 'media') return undefined;
  if (isPhoto(message)) return <PhotoGroup messages={[message]} />;
  if (isVoice(message)) return <VoiceCard message={message} />;
  return <FileCard message={message} />;
}

interface SocialConversationScreenProps {
  conversationId: string;
}

export function SocialConversationScreen({ conversationId }: SocialConversationScreenProps) {
  const router = useRouter();
  const chat = useSocialConversation(conversationId);
  const [reply, setReply] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  /** En alta kaydırma yalnız taze içerikte (ilk yük · cevap) — "daha eski" yüklerken dip aranmaz. */
  const scrollPending = useRef(true);

  const conversation = chat.conversation;
  const window = socialWindowOf(conversation?.windowExpiresAt ?? null);

  const send = async () => {
    const text = reply.trim();
    if (!text || chat.sending) return;
    const written = await chat.reply(text);
    if (written) {
      setReply('');
      scrollPending.current = true;
    }
  };

  const takeDraft = async () => {
    const draft = await chat.takeDraft();
    if (draft !== null) setReply(draft);
  };

  /**
   * Bir mesajın SATIRI — baloncuk + altındaki künye (v3:2246-2250).
   *
   * Künye baloncuğun DIŞINDA ve kendi tarafına hizalı; sarmalayıcı `View` yalnız o hizayı tutar.
   * Gelen mesajın künyesi damgadır, giden mesajınki "kim yazdı · ne zaman · hangi kalıp".
   */
  const toneOf = (message: SocialMessage) =>
    message.direction === 'inbound' ? 'customer' : message.author === 'ai' ? 'ai' : 'operator';

  const captionOf = (message: SocialMessage) => {
    const stamp = socialStamp(message.createdAt);
    if (message.direction === 'inbound') return stamp;

    const parts = [message.author === 'ai' ? td.ai : td.you, stamp];
    if (message.templateName) parts.push(fillCopy(td.template, { name: message.templateName }));
    return parts.join(' · ');
  };

  const bubbleOf = (message: SocialMessage) => {
    const content = contentOf(message);
    const text = message.body.text?.trim() ?? '';
    /* YER TUTUCU YALNIZ ÇİZİLECEK ŞEY YOKKEN (21.287). `[görsel / dosya]` yazısı medyanın kendisi
       çizilemediği sürece doğruydu; artık çiziliyor. Geriye yalnız gövdesi boş METİN-DIŞI mesaj
       kalıyor (etkileşimli kart, kalıp) — orada yer tutucu hâlâ tek doğru cevap. */
    const body = text || (content === undefined ? t.kind[message.kind] : '');

    return (
      <ManagementChatBubble
        key={message.id}
        tone={toneOf(message)}
        body={body}
        content={content}
        caption={captionOf(message)}
      />
    );
  };

  /** Çizim birimi → baloncuk. Öbeğin künyesi SON fotoğrafın damgasıdır (öbek orada bitiyor). */
  const itemOf = (item: ThreadItem) =>
    item.kind === 'single' ? (
      bubbleOf(item.message)
    ) : (
      <ManagementChatBubble
        key={item.key}
        tone={toneOf(item.head)}
        content={<PhotoGroup messages={item.messages} />}
        caption={captionOf(item.messages.at(-1) ?? item.head)}
      />
    );

  if (chat.status === 'loading') {
    return (
      <View style={styles.screen} testID="management-social-chat">
        <OperationsStackHeader
          title={t.title}
          onBack={() => router.back()}
          backLabel={managementCopy.common.back}
          testID="management-social-chat-header"
        />
        {/* Yazışmada iskelet YOK, halka var — gerekçe şikâyet ekranının künyesinde (baloncuğun
            ne genişliği ne sayısı önceden bilinir; iskelet bir LİSTE kalıbıdır). */}
        <View style={styles.pending}>
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      </View>
    );
  }

  if (chat.status === 'error' || conversation === null) {
    return (
      <View style={styles.screen} testID="management-social-chat">
        <OperationsStackHeader
          title={t.title}
          onBack={() => router.back()}
          backLabel={managementCopy.common.back}
          testID="management-social-chat-header"
        />
        <View style={styles.noticeWrap}>
          {/* Alt satır SEBEBİ söyler (gelen kutusuyla aynı karar): oturum · yetki · bağlantı ·
              beklenmedik. `conversation === null` hâlinde sonuç kaydı yoktur ve o zaman bir sebep
              iddia edilmez — `operationsFailureText` genel cümleye düşer. */}
          <OperationsNoticeBlock
            variant="error"
            title={td.notFound.title}
            description={operationsFailureText(chat.failure)}
            retry={{ label: td.notFound.retry, onPress: chat.retry }}
            testID="management-social-chat-error"
          />
        </View>
      </View>
    );
  }

  /** Kaydırıcının ÜSTÜNDE sabit duran şeritler — kaçınmanın içinde ama yazışmayla kaymazlar. */
  const above = (
    <>
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>{td.mode.label}</Text>
        {MODES.map((mode: ConversationHandler) => {
          const active = conversation.handledBy === mode;
          return (
            <PressableSurface
              key={mode}
              onPress={() => {
                if (!active) void chat.changeMode(mode);
              }}
              disabled={chat.busy || active}
              feedback="opacity"
              compact
              style={[styles.modeChip, active ? styles.modeChipActive : styles.modeChipIdle]}
              accessibilityLabel={td.mode[mode]}
              testID={`management-social-mode-${mode}`}
            >
              <Text style={active ? styles.modeChipActiveLabel : styles.modeChipIdleLabel}>{td.mode[mode]}</Text>
            </PressableSurface>
          );
        })}
        {conversation.awaitingReply ? <Text style={styles.ourTurn}>{managementCopy.common.ourTurn}</Text> : null}
      </View>

      {/* ÇIKIŞ UYARISI KALDIRILDI (29.08): `ai` modu artık seçilebiliyor ve arkasında koşan bir
          motor var (`ConversationHandlerEnum` künyesi). Uyarı *"AI modunda ama sohbette ajan yok"*
          diyordu — o cümle bugünden itibaren YALAN olurdu ve operatörü çalışan bir modu terk
          etmeye iterdi. Üçüncü çip zaten `MODES`ten kendiliğinden doğdu (enum'dan türüyor). */}

      <View style={[styles.windowBand, styles[`windowBand_${window.state}`]]} testID="management-social-window">
        <Text style={[styles.windowText, styles[`windowText_${window.state}`]]}>
          {window.state === 'open'
            ? fillCopy(td.window[conversation.source].open, { hours: String(window.hoursLeft) })
            : td.window[conversation.source][window.state]}
        </Text>
      </View>
    </>
  );

  /*
    BEKLEYEN TASLAK YUVASI (v3:2262) — cevap kutusunun hemen ÜSTÜ. Slotun iki hâli var ve ikisi
    aynı yeri kaplar: taslak varsa kart, hibrit modda taslak yoksa "öner" düğmesi. Öteki modlarda
    yuva hiç doğmaz — taslak yalnız hibritte üretilir (uç kuralı, `wrong_mode` reddi oradan gelir).
  */
  const draftSlot = conversation.aiDraftReply ? (
    <View style={styles.draft} testID="management-social-draft">
      <Text style={styles.draftEyebrow}>{td.draftEyebrow}</Text>
      {/* Taslak, ajanın YAZDIĞI hâliyle çizilir (07.09) — talep ekranının aynı kararı. Buradaki
          metin defterde biçim işareti taşıma ihtimali EN YÜKSEK metindir: onu yapay zekâ üretiyor
          ve biçimli üretiyor. Ham işaretle gösterilirse operatör, gönderilecek metnin görüneceği
          hâli GÖRMEDEN onaylamış olur. Mesaj baloncukları 21.279'da çizdirilmişti; taslak ayrı bir
          kutu olduğu için o turda atlanmıştı. */}
      <ChatText style={styles.draftBody}>{conversation.aiDraftReply}</ChatText>
      <PressableSurface
        onPress={() => void takeDraft()}
        disabled={chat.busy}
        feedback="scale"
        style={styles.draftButton}
        accessibilityLabel={td.draftTake}
        testID="management-social-draft-take"
      >
        <Text style={styles.draftButtonLabel}>{td.draftTake}</Text>
      </PressableSurface>
      {/* Kuralın kendisi yazılı: hibritte gönderen İNSANDIR. Kart bir onay kutusu olduğu için
          cümle tam burada duruyor — kararın verildiği yerde. */}
      <Text style={styles.draftNote}>{td.draftNote}</Text>
    </View>
  ) : conversation.handledBy === 'hybrid' ? (
    <PressableSurface
      onPress={() => void chat.suggestDraft()}
      disabled={chat.busy}
      feedback="opacity"
      compact
      style={styles.suggest}
      accessibilityLabel={td.suggest}
      testID="management-social-suggest"
    >
      <Text style={styles.suggestLabel}>{td.suggest}</Text>
    </PressableSurface>
  ) : null;

  /** Altta SABİT duran cevap çubuğu — kaydırılmaz, klavye açılınca onun üstünde kalır. */
  const composer = (
    <View style={styles.footer}>
      {draftSlot}
      {/* SEBEP TEK YERDE YAZILIR (21.287 düzeltmesi). 21.286'da gönderim reddi için İKİNCİ bir
          satır eklenmişti ve ikisi de `lastError`a bakıyordu: aynı sebep alt alta iki kez
          çiziliyordu, üstelik alttaki HAM ANAHTARI ("Gönderilemedi (window_closed)") operatöre
          gösteriyordu. Sözlük zaten anahtarı cümleye çeviren yer — gönderim sebepleri oraya
          eklendi, ikinci satır kaldırıldı. */}
      {chat.lastError === null ? null : (
        <Text style={styles.errorNote} testID="management-social-action-error">
          {failureText(chat.lastError)}
        </Text>
      )}
      <TextInput
        value={reply}
        onChangeText={setReply}
        multiline
        placeholder={td.replyPlaceholder}
        placeholderTextColor={operationsTheme.colors.muted}
        accessibilityLabel={td.replyLabel}
        style={styles.replyInput}
        testID="management-social-reply"
      />
      <PressableSurface
        onPress={() => void send()}
        disabled={chat.sending || reply.trim().length === 0}
        feedback="shadow"
        style={[styles.recordButton, chat.sending || reply.trim().length === 0 ? styles.recordDisabled : styles.recordEnabled]}
        accessibilityLabel={chat.sending ? td.sending : td.record}
        testID="management-social-record"
      >
        <Text style={styles.recordLabel}>{chat.sending ? td.sending : td.record}</Text>
      </PressableSurface>
      {/* GÖNDERİM REDDİ BİR CÜMLEDİR, HTTP hatası değil (21.286): pencere kapalıysa ya da sağlayıcı
          düştüyse uç 200 döner ama mesaj gitmez. Operatör bunu yukarıdaki tek hata satırında okur
          — ve metin kutuda DURUR, çünkü gitmeyen bir cevabı silmek onu yeniden yazdırmak olurdu. */}
      <Text style={styles.recordNote}>{td.recordNote}</Text>
    </View>
  );

  return (
    <View style={styles.screen} testID="management-social-chat">
      <OperationsStackHeader
        title={socialTitle(conversation)}
        // Kimlik satırı kanal-duyarlı: yalnız WhatsApp'ın anahtarı (telefon) operatöre bir şey söyler.
        subtitle={
          conversation.source === 'whatsapp'
            ? `${t.channel[conversation.source]} · ${conversation.externalRef}`
            : t.channel[conversation.source]
        }
        onBack={() => router.back()}
        backLabel={managementCopy.common.back}
        testID="management-social-chat-header"
      />

      {/*
        YAZIŞMA KABI KİTTEN (27.08) — klavye kaçınması, listenin esnemesi ve çubuğun sabit kalması
        onun kuralları (`chat-layout.tsx` künyesi: gerekçe, cihaz ölçümü ve açık kalan platform
        sorusu orada). Ekran üç parça veriyor: üstteki şeritler, yazışma, çubuk.

        Mod satırı ve pencere bandı `above`ta, yani kaçınmanın İÇİNDE ama kaydırılmıyorlar —
        yazışmayla birlikte kısalması gereken alanın parçası oldukları için.
      */}
      <ChatLayout
        above={above}
        composer={composer}
        scrollRef={scrollRef}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => {
          if (!scrollPending.current) return;
          scrollPending.current = false;
          scrollRef.current?.scrollToEnd({ animated: false });
        }}
        testID="management-social-thread"
      >
        {chat.hasOlder ? (
          <PressableSurface
            onPress={chat.loadOlder}
            feedback="opacity"
            compact
            style={styles.older}
            accessibilityLabel={td.older}
            testID="management-social-older"
          >
            <Text style={styles.olderLabel}>{chat.loadingOlder ? td.olderLoading : td.older}</Text>
          </PressableSurface>
        ) : null}

        {threadItemsOf(chat.messages).map(itemOf)}
      </ChatLayout>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  pending: {
    paddingTop: operationsTheme.space['7xl'],
  },
  noticeWrap: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['2xl'],
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  modeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  modeChip: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
  },
  modeChipActive: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  modeChipIdle: {
    borderColor: operationsTheme.colors['sand-500'],
  },
  modeChipActiveLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.card,
  },
  modeChipIdleLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  ourTurn: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  /** Pencere bandı — hâl başına zemin/metin: açık=zeytin, kapalı=terracotta, hiç=nötr. */
  windowBand: {
    marginTop: operationsTheme.space.md,
    marginHorizontal: operationsTheme.space['6xl'],
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
  },
  windowBand_open: { backgroundColor: operationsTheme.colors['olive-bg'] },
  windowBand_closed: { backgroundColor: operationsTheme.colors['terracotta-bg'] },
  windowBand_never: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  windowText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  windowText_open: { color: operationsTheme.colors['olive-dark'] },
  windowText_closed: { color: operationsTheme.colors.terracotta },
  windowText_never: { color: operationsTheme.colors.muted },
  /* Kaçınma kabının ve kaydırıcının ölçüleri BURADA DEĞİL: ikisi de `ChatLayout`ın kuralı. */
  thread: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  older: {
    alignSelf: 'center',
  },
  olderLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  /* KUYRUK KÖŞESİ (v3: 5px) — konuşanın tarafına bakan alt köşe sivrileşir, baloncuk ona
     "yapışır". Ölçekte 5'lik bir yarıçap yok; `tight` (8) en yakın durak ve rol olarak da doğru:
     küçük, kırpmayan bir kavis. */

  /* ── Bekleyen taslak kartı — çubuğun üstünde (v3:2262) ─────────────────── */
  draft: {
    gap: operationsTheme.space.md,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
  },
  draftEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['olive-dark'],
  },
  draftBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  draftButton: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.olive,
  },
  draftButtonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.card,
  },
  draftNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  suggest: {
    alignSelf: 'flex-end',
  },
  suggestLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  /** Çubuk kendi ŞERİDİ (v3:2260): üstten çizgiyle ayrılır, zemini sayfanın kremi. */
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.cream,
    borderTopWidth: operationsTheme.border.base,
    borderTopColor: operationsTheme.colors['neutral-bg'],
  },
  errorNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.error,
  },
  replyInput: {
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  recordButton: {
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  /* Gölgesiz — v3'te sert gölge yok (ölçüm 30.08). */
  recordEnabled: {
    backgroundColor: operationsTheme.colors.olive,
  },
  recordDisabled: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  recordLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  recordNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },

  /* ── MEDYA (21.287) ──────────────────────────────────────────────────────
     Ölçüler talep eklerinin ızgarasından devralındı (`complaint-screen`): aynı işi iki yerde iki
     ayrı ölçüyle çizmek, ikisini bir gün ayrıştırırdı. Tek fark tek fotoğrafın kendi karosu —
     sohbette yalnız bir kare geldiğinde ızgara ölçüsü onu gereksiz küçültüyordu. */
  mediaWrap: { gap: operationsTheme.space.md },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GAP,
  },
  /* Karonun ÖLÇÜSÜ burada YOK — `photoFrame` cihazdan hesaplayıp veriyor (künyesi orada). Burada
     yalnız görünüşü durur: dördüncü fotoğraf ikinci satıra sarar ve aynı kareyi korur, çünkü ölçü
     esnek değil. */
  photoFrame: {
    borderRadius: operationsTheme.radius.badge,
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  photoImage: { width: '100%', height: '100%' },
  /** İndirmesi düşen medya — boş ama GÖRÜNÜR karo; mesajın kendisi kaybolmaz. */
  mediaMissing: { alignItems: 'center', justifyContent: 'center' },
  mediaNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  voiceLabel: {
    flexShrink: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.olive,
  },
  /* Transkript KENDİ kutusunda: makine çıktısı, müşterinin sözüyle aynı zeminde durmamalı. */
  transcript: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  transcriptEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  transcriptBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
});
