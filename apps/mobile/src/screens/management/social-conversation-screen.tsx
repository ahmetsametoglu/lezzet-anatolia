import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationHandlerEnum, type ConversationHandler } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import type { SocialMessage } from '@/lib/api/social';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { socialStamp, socialTitle, socialWindowOf } from './social-format';
import { useSocialConversation } from './use-social-conversation.hook';

/*
  SOSYAL SOHBET — web sohbet panelinin mobil aynası; gövde deseni `complaint-screen`den (baloncuk
  renkleri, kesikli YZ taslağı, footer), verisi gerçek uçtan (`use-social-conversation.hook`).

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
  Sohbette İKİ mod (15.13 · 22.08) — `ai` listede YOK ve bu bir kısıtlama değil, yalanın kaldırılması:
  özerk sohbet motoru yazılmadı (15.8; gönderim kanalı 15.11'e bağlı), yani "AI" seçildiğinde arkada
  hiçbir şey koşmuyordu — cron yalnız hibrit sohbetleri tarıyor. Sohbet, operatör AI'ın ilgilendiğini
  sanarken cevapsız kalıyordu. Kaynak tek: `ConversationHandlerEnum` (API isteği de onunla doğrulanır).
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

  const bubbleOf = (message: SocialMessage) => {
    const body = message.body.text?.trim() || t.kind[message.kind];
    const stamp = socialStamp(message.createdAt);

    if (message.direction === 'inbound') {
      return (
        <View key={message.id} style={[styles.bubble, styles.bubbleLeft, styles.bubbleCustomer]}>
          <Text style={styles.bubbleCaption}>{stamp}</Text>
          <Text style={styles.bubbleBody}>{body}</Text>
        </View>
      );
    }

    const fromAi = message.author === 'ai';
    const caption = [fromAi ? td.ai : td.you, stamp];
    if (message.templateName) caption.push(fillCopy(td.template, { name: message.templateName }));
    return (
      <View key={message.id} style={[styles.bubble, styles.bubbleRight, fromAi ? styles.bubbleAi : styles.bubbleOperator]}>
        <Text style={fromAi ? styles.bubbleCaption : styles.bubbleCaptionOperator}>{caption.join(' · ')}</Text>
        <Text style={styles.bubbleBody}>{body}</Text>
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

      {/* Eski `ai` satırının ÇIKIŞ uyarısı: mod artık seçilemiyor ama kolonda durabilir (16.08 ile
          22.08 arası). Hiçbir çip aktif görünmez ve sebebi söylenmezse ekran bozuk sanılır. */}
      {conversation.handledBy === 'ai' ? (
        <Text style={styles.modeOrphan} testID="management-social-mode-orphan">
          {td.mode.aiOrphan}
        </Text>
      ) : null}

      <View style={[styles.windowBand, styles[`windowBand_${window.state}`]]} testID="management-social-window">
        <Text style={[styles.windowText, styles[`windowText_${window.state}`]]}>
          {window.state === 'open'
            ? fillCopy(td.window[conversation.source].open, { hours: String(window.hoursLeft) })
            : td.window[conversation.source][window.state]}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
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

        {conversation.aiDraftReply ? (
          <View style={[styles.bubble, styles.bubbleRight, styles.bubbleDraft]} testID="management-social-draft">
            <Text style={styles.bubbleCaption}>{td.draftCaption}</Text>
            <Text style={styles.bubbleBody}>{conversation.aiDraftReply}</Text>
            <PressableSurface
              onPress={() => void takeDraft()}
              disabled={chat.busy}
              feedback="scale"
              compact
              style={styles.draftChip}
              accessibilityLabel={td.draftTake}
              testID="management-social-draft-take"
            >
              <Text style={styles.draftChipLabel}>{td.draftTake}</Text>
            </PressableSurface>
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
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
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
  /** Yetim `ai` satırının uyarısı — pencere bandı gibi zeminli değil, tek satır not (uyarı değil bilgi). */
  modeOrphan: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
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
  bubble: {
    maxWidth: '86%',
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubbleCustomer: {
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  bubbleOperator: {
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  /** AI'ın GÖNDERİLMİŞ mesajı — operatörden ayrı ton (varlık künyesi: ekran AI'ı ayrı gösterir), taslak DEĞİL: çerçeve düz. */
  bubbleAi: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  /** Bekleyen taslak complaint'in kesikli dili: taslak olduğu şeklinden okunur. */
  bubbleDraft: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors.muted,
    gap: operationsTheme.space.sm,
  },
  bubbleCaption: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  bubbleCaptionOperator: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['olive-dark'],
  },
  bubbleBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  draftChip: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.olive,
  },
  draftChipLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
  suggest: {
    alignSelf: 'flex-end',
  },
  suggestLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
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
