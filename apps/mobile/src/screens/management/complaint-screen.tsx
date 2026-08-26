import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { stampOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { ComplaintDetail, ComplaintMessage } from '@lezzet/types';
import { managementCopy } from './copy';
import { useComplaint } from './use-complaint.hook';

/*
  Y1 · ŞİKÂYET / TALEP (v2:530-579) — sohbet + YZ önerisi + üstlenme; ARTIK GERÇEK UÇTAN (21.12).

  Okuma web talepler sayfasıyla AYNI motordan (`getStaffTicketDetail` terfisi): çeviri yönü, yazar
  adları ve top-bizde bayrağı sunucuda çözülür. Kimlik `?id=` ile gelir (hub'ın karar satırı);
  parametresiz açılış cevap bekleyen EN TAZE talebi getirir.

  ── YZ ÖNERİSİ BİR CEVAP DEĞİL, BİR TASLAKTIR ───────────────────────────────
  Öneri artık bir mesaj DEĞİL, talebin bekleyen taslağıdır (`aiDraftReply`, 16.5) ve iki çıkışı
  gerçek kapıya bağlı (`consumeTicketDraft`):
  · "Cevaba çevir →"     — taslak OLDUĞU GİBİ operatörün cevabı olur, sohbete sunucudan döner.
  · "Düzenleyerek gönder" — taslak düşer, metni cevap kutusuna taşınır; düzenleme yeri orasıdır.

  ── GÖNDER DÜĞMESİ GELDİ (UI-only döneminden sapmanın kapanışı) ─────────────
  Eski künye "gönderme kapısı yok, düğme de konmadı" diyordu; kapı geldi (`replyAsStaff`), düğme
  de geldi — düğmesiz alan, yazdığını gönderemeyen ölü bir alan olurdu.

  ── ÇEVİRİ VE ORİJİNAL BİRLİKTE DURUR ───────────────────────────────────────
  Müşteri baloncuğu çeviriyi gösterir, "orijinali gör" aslını açar (v2:546). Yalnız GERÇEKTEN
  çevrilmiş mesajda çizilir (`bodyTranslated`) — aynı metni iki kez açan düğme yalan olurdu.
*/

const t = managementCopy;

export function ComplaintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const complaint = useComplaint(typeof params.id === 'string' ? params.id : undefined);
  const { state } = complaint;

  return (
    <View style={styles.screen} testID="management-complaint">
      <OperationsStackHeader
        title={t.complaint.title}
        subtitle={
          state.status === 'ready' && state.complaint !== null
            ? fillCopy(t.complaint.caption, {
                reference: state.complaint.orderReferenceNo ?? t.complaint.noRef,
                source: t.complaint.source[state.complaint.source],
                stamp: stampOf(state.complaint.lastMessageAt),
              })
            : ''
        }
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-complaint-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="management-complaint-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.noticeBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: complaint.retry }}
            testID="management-complaint-error"
          />
        </View>
      ) : state.complaint === null ? (
        <View style={styles.noticeBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.complaint.empty.title}
            description={t.complaint.empty.body}
            testID="management-complaint-empty"
          />
        </View>
      ) : (
        <ComplaintBody detail={state.complaint} complaint={complaint} />
      )}
    </View>
  );
}

interface ComplaintBodyProps {
  detail: ComplaintDetail;
  complaint: ReturnType<typeof useComplaint>;
}

function ComplaintBody({ detail, complaint }: ComplaintBodyProps) {
  const attachmentCount = detail.messages.reduce((sum, message) => sum + message.attachmentUrls.length, 0);
  const claimed = detail.status !== 'open';

  return (
    <>
      <View style={styles.tags}>
        <Text style={[styles.tag, styles.tagKind]}>{t.complaint.kind[detail.type]}</Text>
        <Text style={[styles.tag, claimed ? styles.tagInProgress : styles.tagOpen]} testID="management-complaint-status">
          {t.complaint.status[detail.status]}
        </Text>
        {detail.awaitingReply ? <Text style={[styles.tag, styles.tagOurTurn]}>{t.common.ourTurn}</Text> : null}
        {attachmentCount === 0 ? null : (
          <Text style={[styles.tag, styles.tagAttachments]}>
            {fillCopy(t.complaint.attachments, { n: String(attachmentCount) })}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.thread} testID="management-complaint-thread">
        {detail.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* YZ TASLAĞI — mesaj değil, bekleyen öneri (16.5): tüketilince satırdan düşer. */}
        {detail.aiDraftReply === null ? null : (
          <View style={[styles.bubble, styles.bubbleRight, styles.bubbleAssistant]} testID="management-complaint-draft">
            <Text style={styles.bubbleCaption}>{t.complaint.author.assistantDraft}</Text>
            <Text style={styles.bubbleBody}>{detail.aiDraftReply}</Text>
            <View style={styles.assistantActions}>
              <PressableSurface
                onPress={() => complaint.consumeDraft(true)}
                feedback="scale"
                compact
                style={[styles.assistantChip, styles.assistantChipSend]}
                accessibilityLabel={t.complaint.assistantSend}
                testID="management-complaint-assistant-send"
              >
                <Text style={styles.assistantChipSendLabel}>{t.complaint.assistantSend}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={() => complaint.consumeDraft(false)}
                feedback="scale"
                compact
                style={[styles.assistantChip, styles.assistantChipEdit]}
                accessibilityLabel={t.complaint.assistantEdit}
                testID="management-complaint-assistant-edit"
              >
                <Text style={styles.assistantChipEditLabel}>{t.complaint.assistantEdit}</Text>
              </PressableSurface>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {complaint.lastError === null ? null : (
          <Text style={styles.actionError} testID="management-complaint-action-error">
            {fillCopy(t.complaint.actionFailed, { reason: complaint.lastError })}
          </Text>
        )}
        <TextInput
          value={complaint.reply}
          onChangeText={complaint.setReply}
          multiline
          placeholder={t.complaint.replyPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.complaint.replyLabel}
          style={styles.replyInput}
          testID="management-complaint-reply"
        />
        <View style={styles.footerRow}>
          <PressableSurface
            onPress={complaint.sendReply}
            disabled={complaint.sending || complaint.reply.trim().length === 0}
            feedback="shadow"
            grow
            style={[
              styles.footerButton,
              complaint.sending || complaint.reply.trim().length === 0 ? styles.claimDone : styles.claimOpen,
            ]}
            accessibilityLabel={complaint.sending ? t.complaint.sending : t.complaint.send}
            testID="management-complaint-send"
          >
            <Text style={styles.claimLabel}>{complaint.sending ? t.complaint.sending : t.complaint.send}</Text>
          </PressableSurface>
          <PressableSurface
            onPress={complaint.claim}
            disabled={claimed || complaint.sending}
            feedback="shadow"
            grow
            style={[styles.footerButton, claimed ? styles.claimDone : styles.claimOpen]}
            accessibilityLabel={claimed ? t.complaint.claimed : t.complaint.claim}
            testID="management-complaint-claim"
          >
            <Text style={styles.claimLabel}>{claimed ? t.complaint.claimed : t.complaint.claim}</Text>
          </PressableSurface>
        </View>
        {/* "Masada devam et" tasarımda EYLEMSİZ (v2:575) ve öyle kaldı: mobilde açacağı bir kapı
            yok, dokunulabilir yapmak olmayan bir yol vaat ederdi. */}
        <Text style={styles.deskNote}>{t.common.desk}</Text>
      </View>
    </>
  );
}

interface MessageBubbleProps {
  message: ComplaintMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  /* Orijinal/çeviri geçişi BALONCUĞUN kendi durumu — tek mesajın düğmesi bütün yazışmayı çevirmez. */
  const [showOriginal, setShowOriginal] = useState(false);

  if (message.sender === 'customer') {
    const from = (message.language ?? '?').toUpperCase();
    return (
      <View style={[styles.bubble, styles.bubbleLeft, styles.bubbleCustomer]}>
        <Text style={styles.bubbleCaption}>
          {message.bodyTranslated
            ? showOriginal
              ? fillCopy(t.complaint.author.customerOriginal, { from })
              : fillCopy(t.complaint.author.customer, { from })
            : t.complaint.author.customerPlain}
        </Text>
        <Text style={styles.bubbleBody}>{showOriginal ? message.originalBody : message.body}</Text>
        {message.bodyTranslated ? (
          <PressableSurface
            onPress={() => setShowOriginal((value) => !value)}
            feedback="opacity"
            compact
            accessibilityLabel={showOriginal ? t.complaint.translated : t.complaint.original}
            testID={`management-complaint-original-${message.id}`}
          >
            <Text style={styles.bubbleLink}>{showOriginal ? t.complaint.translated : t.complaint.original}</Text>
          </PressableSurface>
        ) : null}
      </View>
    );
  }

  const caption =
    message.sender === 'ai'
      ? t.complaint.author.ai
      : message.authorName === null
        ? t.complaint.author.operatorUnknown
        : fillCopy(t.complaint.author.operator, { name: message.authorName });

  return (
    <View style={[styles.bubble, styles.bubbleRight, styles.bubbleOperator]}>
      <Text style={styles.bubbleCaptionOperator}>{caption}</Text>
      <Text style={styles.bubbleBody}>{message.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  pending: {
    paddingTop: operationsTheme.space['8xl'],
    alignItems: 'center',
  },
  noticeBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  tag: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  tagKind: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  tagOpen: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  tagInProgress: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  tagOurTurn: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.terracotta,
  },
  tagAttachments: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    color: operationsTheme.colors.muted,
  },
  thread: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  bubble: {
    // v2: `max-width:86%` — baloncuk satırı doldurmaz, kimin konuştuğu hizadan okunur.
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
  /** YZ taslağı KESİKLİ çerçeveli: taslak olduğu şeklinden okunur (v2:548). */
  bubbleAssistant: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors.muted,
    gap: operationsTheme.space.sm,
  },
  bubbleOperator: {
    backgroundColor: operationsTheme.colors['olive-bg'],
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
  bubbleLink: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  assistantActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.sm,
  },
  assistantChip: {
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
  },
  assistantChipSend: {
    backgroundColor: operationsTheme.colors.olive,
  },
  assistantChipEdit: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  assistantChipSendLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
  assistantChipEditLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.ink,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  /** Reddin sebebi görünür durur — sessiz yutulan yazım, basılmamış düğmeyle aynı şey olurdu. */
  actionError: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
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
  footerRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  /** Esneme `grow` prop'undadır, buraya flex YAZILMAZ — iç yüzeye giden flex metni ezer
      (pressable-surface künyesi; cihazda ölçüldü 26.08: iki düğme de metinsiz kalmıştı). */
  footerButton: {
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  claimOpen: {
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  /** Üstlenilmiş iş SÖNER: aynı düğme ikinci kez basılacak bir kapı değildir (v2:429). */
  claimDone: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  claimLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  deskNote: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space['2xl'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
    textAlign: 'center',
  },
});
