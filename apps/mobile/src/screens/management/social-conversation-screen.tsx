import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
// `ScrollView` artık yalnız TİP: kaydırıcıyı `ChatLayout` çiziyor, ekran ona yalnız ref veriyor.
import { ActivityIndicator, Text, TextInput, View, type ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationHandlerEnum, type ConversationHandler } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ChatLayout } from '@/components/ui/chat-layout';
import { PressableSurface } from '@/components/ui/pressable-surface';
import type { SocialMessage } from '@/lib/api/social';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
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
  · **Kâğıt uçak düğmesi** (v3:2276): buradan mesaj GİTMEZ, deftere yazılır (uç künyesi). Uçak
    ikonu "gönderildi" vaat ederdi; düğme adıyla ("Deftere işle") duruyor.
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
  const bubbleOf = (message: SocialMessage) => {
    const body = message.body.text?.trim() || t.kind[message.kind];
    const stamp = socialStamp(message.createdAt);

    if (message.direction === 'inbound') {
      return (
        <View key={message.id} style={[styles.line, styles.lineLeft]}>
          <View style={[styles.bubble, styles.bubbleCustomer]}>
            <Text style={styles.bubbleBody}>{body}</Text>
          </View>
          <Text style={styles.bubbleCaption}>{stamp}</Text>
        </View>
      );
    }

    const fromAi = message.author === 'ai';
    const caption = [fromAi ? td.ai : td.you, stamp];
    if (message.templateName) caption.push(fillCopy(td.template, { name: message.templateName }));
    return (
      <View key={message.id} style={[styles.line, styles.lineRight]}>
        <View style={[styles.bubble, fromAi ? styles.bubbleAi : styles.bubbleOperator]}>
          <Text style={fromAi ? styles.bubbleBody : styles.bubbleBodyOnInk}>{body}</Text>
        </View>
        <Text style={fromAi ? styles.bubbleCaption : styles.bubbleCaptionOperator}>{caption.join(' · ')}</Text>
      </View>
    );
  };

  if (chat.status === 'loading') {
    return (
      <View style={styles.screen} testID="management-social-chat">
        <OperationsStackHeader
          title={t.title}
          onBack={() => router.back()}
          backLabel={managementCopy.common.back}
          testID="management-social-chat-header"
        />
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
          <OperationsNoticeBlock
            variant="error"
            title={td.notFound.title}
            description={td.notFound.body}
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
      <Text style={styles.draftBody}>{conversation.aiDraftReply}</Text>
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
        accessibilityLabel={td.record}
        testID="management-social-record"
      >
        <Text style={styles.recordLabel}>{td.record}</Text>
      </PressableSurface>
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

        {chat.messages.map(bubbleOf)}
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
  /** Mesaj SATIRI — baloncuk ve altındaki künye; hiza satırın kendisinde (v3:2246). */
  line: {
    maxWidth: '86%',
    gap: operationsTheme.space['2xs'],
  },
  lineLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  lineRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  /* KUYRUK KÖŞESİ (v3: 5px) — konuşanın tarafına bakan alt köşe sivrileşir, baloncuk ona
     "yapışır". Ölçekte 5'lik bir yarıçap yok; `tight` (8) en yakın durak ve rol olarak da doğru:
     küçük, kırpmayan bir kavis. */
  bubbleCustomer: {
    borderBottomLeftRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
  },
  /** BİZİM sözümüz koyu (v3:2249): kontrast "kim konuşuyor"u hizadan bağımsız söyler. */
  bubbleOperator: {
    borderBottomRightRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.ink,
  },
  /** AI'ın GÖNDERİLMİŞ mesajı — operatörden ayrı ton (varlık künyesi: ekran AI'ı ayrı gösterir). */
  bubbleAi: {
    borderBottomRightRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  bubbleCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
  bubbleCaptionOperator: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
  bubbleBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  bubbleBodyOnInk: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-image'],
  },

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
  recordEnabled: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
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
});
