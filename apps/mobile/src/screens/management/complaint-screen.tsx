import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { COMPLAINT } from './management-fixture';

/*
  Y1 · ŞİKÂYET (v2:530-579) — sohbet + YZ önerisi + üstlenme.

  ── YZ ÖNERİSİ BİR CEVAP DEĞİL, BİR TASLAKTIR ───────────────────────────────
  Baloncuğun künyesi bunu açıkça yazıyor ("operatör cevabı değildir") ve iki çıkışı var. Tasarım
  şablonunda ikisi de aynı sahte işlevi çağırıyor (mock), gerçekte AYRIŞIRLAR ve burada öyle
  yazıldı — aynı ekranda aynı işi yapan iki düğme bırakmak, ikisinden birini yalan yapardı:
  · "Cevaba çevir →"     — öneri OLDUĞU GİBİ operatörün cevabı olur, sohbete düşer.
  · "Düzenleyerek gönder" — öneri CEVAP ALANINA taşınır; düzenleme yeri zaten orasıdır.
  İkisinde de öneri "tüketilmiş" sayılır ve eylem satırı kapanır (v2'nin `yzBekliyor` kapısı).

  ── ÇEVİRİ VE ORİJİNAL BİRLİKTE DURUR ───────────────────────────────────────
  Müşteri baloncuğu çeviriyi gösterir, "orijinali gör" aslını açar (v2:546). Çevirinin yanlış
  olduğu an operatörün bakacağı yer asıldır; onu saklamak, hatayı görünmez yapardı.

  ── GÖNDERİM UCU BU ETAPTA YOK ──────────────────────────────────────────────
  Cevap alanı gerçek bir alandır (yazılır, düzenlenir) ama gönderme kapısı bu dilimde YAZILMIYOR
  (UI-only). Sahte bir "gönderildi" göstermemek için alanın yanına gönder düğmesi de KONMADI —
  tasarımda da yok. BAĞLANMA NOKTASI: cevabın gönderimi + `talep` durum geçişi (Üstlen → İşlemde)
  aynı uçtan gelir; ekranın yerel durumu o gün cevabın kendisiyle değişir.
*/

const t = managementCopy;

export function ComplaintScreen() {
  const router = useRouter();
  const complaint = COMPLAINT;

  /** v2 `talep` — "Açık" ile "İşlemde" arasındaki tek geçiş; ekranın kendi durumu. */
  const [claimed, setClaimed] = useState(false);
  /** v2 `yz` — öneri tüketildi mi (gönderildi ya da düzenlemeye alındı). */
  const [assistantSent, setAssistantSent] = useState(false);
  const [assistantMoved, setAssistantMoved] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [reply, setReply] = useState('');

  const assistantMessage = complaint.messages.find((message) => message.author === 'assistant');
  const assistantHandled = assistantSent || assistantMoved;

  return (
    <View style={styles.screen} testID="management-complaint">
      <OperationsStackHeader
        title={t.complaint.title}
        subtitle={fillCopy(t.complaint.caption, {
          reference: complaint.reference,
          source: complaint.source,
          ago: complaint.ago,
        })}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-complaint-header"
      />

      <View style={styles.tags}>
        <Text style={[styles.tag, styles.tagKind]}>{complaint.kind}</Text>
        <Text style={[styles.tag, claimed ? styles.tagInProgress : styles.tagOpen]} testID="management-complaint-status">
          {claimed ? t.complaint.status.inProgress : t.complaint.status.open}
        </Text>
        {complaint.ourTurn ? <Text style={[styles.tag, styles.tagOurTurn]}>{t.common.ourTurn}</Text> : null}
        {/* Ataç ikonu KİTTE YOK (v2:537 bir ataç çiziyor) ve ikon eklemek bu dilimin yazı alanı
            dışında — rozet metinle duruyor, sayı yine okunuyor. Raporlandı. */}
        <Text style={[styles.tag, styles.tagAttachments]}>
          {fillCopy(t.complaint.attachments, { n: String(complaint.attachmentCount) })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.thread} testID="management-complaint-thread">
        {complaint.messages.map((message) => {
          if (message.author === 'customer') {
            const original = message.originalBody;
            return (
              <View key={message.id} style={[styles.bubble, styles.bubbleLeft, styles.bubbleCustomer]}>
                <Text style={styles.bubbleCaption}>
                  {showOriginal && original !== undefined
                    ? fillCopy(t.complaint.author.customerOriginal, { from: complaint.customerLanguage })
                    : fillCopy(t.complaint.author.customer, {
                        from: complaint.customerLanguage,
                        to: complaint.surfaceLanguage,
                      })}
                </Text>
                <Text style={styles.bubbleBody}>
                  {showOriginal && original !== undefined ? original : message.body}
                </Text>
                {original === undefined ? null : (
                  <PressableSurface
                    onPress={() => setShowOriginal((value) => !value)}
                    feedback="opacity"
                    compact
                    accessibilityLabel={showOriginal ? t.complaint.translated : t.complaint.original}
                    testID="management-complaint-original"
                  >
                    <Text style={styles.bubbleLink}>
                      {showOriginal ? t.complaint.translated : t.complaint.original}
                    </Text>
                  </PressableSurface>
                )}
              </View>
            );
          }

          if (message.author === 'assistant') {
            return (
              <View key={message.id} style={[styles.bubble, styles.bubbleRight, styles.bubbleAssistant]}>
                <Text style={styles.bubbleCaption}>{t.complaint.author.assistant}</Text>
                <Text style={styles.bubbleBody}>{message.body}</Text>
                {assistantHandled ? (
                  assistantMoved ? (
                    <Text style={styles.bubbleNote} testID="management-complaint-assistant-moved">
                      {t.complaint.assistantMoved}
                    </Text>
                  ) : null
                ) : (
                  <View style={styles.assistantActions}>
                    <PressableSurface
                      onPress={() => setAssistantSent(true)}
                      feedback="scale"
                      compact
                      style={[styles.assistantChip, styles.assistantChipSend]}
                      accessibilityLabel={t.complaint.assistantSend}
                      testID="management-complaint-assistant-send"
                    >
                      <Text style={styles.assistantChipSendLabel}>{t.complaint.assistantSend}</Text>
                    </PressableSurface>
                    <PressableSurface
                      onPress={() => {
                        setReply(complaint.assistantReply);
                        setAssistantMoved(true);
                      }}
                      feedback="scale"
                      compact
                      style={[styles.assistantChip, styles.assistantChipEdit]}
                      accessibilityLabel={t.complaint.assistantEdit}
                      testID="management-complaint-assistant-edit"
                    >
                      <Text style={styles.assistantChipEditLabel}>{t.complaint.assistantEdit}</Text>
                    </PressableSurface>
                  </View>
                )}
              </View>
            );
          }

          return (
            <View key={message.id} style={[styles.bubble, styles.bubbleRight, styles.bubbleOperator]}>
              <Text style={styles.bubbleCaptionOperator}>
                {fillCopy(t.complaint.author.operator, { name: message.operatorName ?? complaint.operatorName })}
              </Text>
              <Text style={styles.bubbleBody}>{message.body}</Text>
            </View>
          );
        })}

        {assistantSent && assistantMessage !== undefined ? (
          <View
            style={[styles.bubble, styles.bubbleRight, styles.bubbleOperator]}
            testID="management-complaint-assistant-sent"
          >
            <Text style={styles.bubbleCaptionOperator}>
              {fillCopy(t.complaint.author.operatorFromAssistant, { name: complaint.operatorName })}
            </Text>
            <Text style={styles.bubbleBody}>{complaint.assistantReply}</Text>
            <Text style={styles.bubbleNote}>
              {fillCopy(t.complaint.sentNote, { language: complaint.customerLanguage })}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          multiline
          placeholder={t.complaint.replyPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.complaint.replyLabel}
          style={styles.replyInput}
          testID="management-complaint-reply"
        />
        <View style={styles.footerRow}>
          <PressableSurface
            onPress={() => setClaimed(true)}
            disabled={claimed}
            feedback="shadow"
            style={[styles.footerButton, claimed ? styles.claimDone : styles.claimOpen]}
            accessibilityLabel={claimed ? t.complaint.claimed : t.complaint.claim}
            testID="management-complaint-claim"
          >
            <Text style={styles.claimLabel}>{claimed ? t.complaint.claimed : t.complaint.claim}</Text>
          </PressableSurface>
          {/* "Masada devam et" tasarımda EYLEMSİZ (v2:575) ve öyle bırakıldı: mobilde açacağı bir
              kapı yok, dokunulabilir yapmak olmayan bir yol vaat ederdi. Cümlenin işi hatırlatmak —
              uzun iş masaüstünde sürer. */}
          <Text style={[styles.footerButton, styles.deskNote]}>{t.common.desk}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
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
  /** YZ baloncuğu KESİKLİ çerçeveli: taslak olduğu şeklinden okunur (v2:548). */
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
  bubbleNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
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
  footerButton: {
    flex: 1,
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
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
    textAlign: 'center',
  },
});
