import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ChatLayout } from '@/components/ui/chat-layout';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { stampOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { ComplaintDetail, ComplaintMessage } from '@lezzet/types';
import { ManagementChatBubble } from './chat-bubble';
import { managementCopy } from './copy';
import { useComplaint } from './use-complaint.hook';

/*
  Y1 · ŞİKÂYET / TALEP (Operasyon Mobil v3:2141-2177) — sohbet + YZ önerisi + üstlenme.

  ── v3'ÜN ÜÇ DÜZEN KARARI (30.08) ───────────────────────────────────────────
  1. **BAŞLIK KÜNYESİ "REFERANS · MÜŞTERİ" OLDU** (v3:2149). v2 oraya kaynağı ve damgayı
     yazıyordu; v3 ekranın ilk satırında "hangi kayıt, kimin" sorusunu cevaplıyor. Kaynak ve damga
     kaybolmadı, BAĞLI KAYITLAR bloğuna indi — orası zaten "bu talep neye asılı" bölümü.
  2. **BAĞLI KAYITLAR BLOĞU GELDİ** (v3:2156). Talebin asılı olduğu kayıtlar tek gömülü blokta
     durur; operatör siparişi aramak için başlığa geri bakmaz.
  3. **EYLEM ALANI "KARAR" BAŞLIĞI ALTINDA TOPLANDI** (v3:2159). v3 orada bir karar listesi
     çiziyor; bizim karar kapılarımız cevap ve üstlenmedir, ikisi de aynı başlığın altında.

  ── TASARIMIN İSTEDİĞİ AMA SÖZLEŞMEDE OLMAYAN ŞEYLER (yazılmadı) ────────────
  · **Karar seçenekleri** ("jest · iade · yeniden gönderim" — v3:2162'nin dört düğmesi) ve onları
    onaylayan "Kararı uygula" kapısı: talep sözleşmesinde ne seçenek listesi, ne de böyle bir yazma
    ucu var (`ComplaintDetail` + cevap/üstlen/taslak üçlüsü). Düğmeleri çizmek, basıldığında hiçbir
    şey yazmayan bir karar ekranı olurdu.
  · **Talep referansı** ("SK-26-8H2P"): sözleşme talebe kimlik (`ticketId`, uuid) veriyor, insan
    okuyabilir bir referans NUMARASI vermiyor. Künyeye SİPARİŞ referansı yazıldı — o gerçek.
  · **Bağlı kayıtların dökümü** ("kurye kabul etmedi kaydı · dönen 2 tepsi · parti SKT 30.08.26"):
    talep ile teslimat/parti kayıtları arasında bir bağ alanı sözleşmede yok. Blok yalnız
    gerçekten bilinen bağı (sipariş referansı) ve kaydın künyesini yazar.

  Okuma web talepler sayfasıyla AYNI motordan (`getStaffTicketDetail` terfisi): çeviri yönü, yazar
  adları ve top-bizde bayrağı sunucuda çözülür. Kimlik `?id=` ile gelir (hub'ın karar kartı);
  parametresiz açılış cevap bekleyen EN TAZE talebi getirir.

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
                customer: state.complaint.customerName,
              })
            : ''
        }
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-complaint-header"
      />

      {state.status === 'loading' ? (
        /* BURADA İSKELET YOK, HALKA VAR — bilinçli. v3'ün ilk-yük dili (`OperationsSkeletonList`)
           bir LİSTE kalıbıdır: eşit yükseklikte kutular gelecek satırların ölçüsünü tutar. Yazışma
           öyle değil — baloncuklar en fazla %80 genişlikte, yönü konuşana göre değişiyor ve kaç
           tane geleceği bilinmiyor. Tam genişlikte kutular çizmek, gelmeyecek bir biçimin sözünü
           vermek olurdu (yönetimin liste ekranları iskelete geçti, 21.164). */
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

  /*
    BEKLEYEN TASLAK YUVASI — cevap kutusunun hemen ÜSTÜ (kullanıcı kararı 30.08, N10; sosyal
    sohbetle aynı yer, v3:2262).

    Taslak eskiden yazışmanın İÇİNDE bir baloncuktu ve kullanıcı farkı cihazda gördü: taslak bir
    MESAJ DEĞİLDİR — gönderilmemiş, onay bekleyen bir öneridir. Yazışmanın içinde durduğunda
    "gönderilmiş" gibi okunuyor, üstelik ekranın en altındaki cevap kutusundan uzakta kalıyordu.
    Yuva şimdi kararın verildiği yerde: metni okuyup düğmeye basacağın nokta.
  */
  const draftSlot =
    detail.aiDraftReply === null ? null : (
      <View style={styles.draft} testID="management-complaint-draft">
        <Text style={styles.draftEyebrow}>{t.complaint.author.assistantDraft}</Text>
        <Text style={styles.draftBody}>{detail.aiDraftReply}</Text>
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
    );

  const composer = (
    <View style={styles.footer}>
      {draftSlot}
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
      {/* v3:2159 — eylemler "KARAR" başlığının altında toplanır: cevap ve üstlenme bu ekranın iki
          gerçek karar kapısıdır ve başlıksız duruşları onları girdi alanının kuyruğu gibi
          gösteriyordu. */}
      <Text style={styles.decisionLabel}>{t.complaint.decision}</Text>
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
  );

  const tags = (
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
  );

  return (
    /*
      YAZIŞMA KABI KİTTEN (27.08) — klavye kaçınması, listenin esnemesi ve çubuğun sabit kalması
      onun kuralları. Ekran yalnız üç parçayı veriyor: üstteki şeritler, yazışma, çubuk.

      Kalıp önce talep detayında çözülmüştü (16.08, iki cihazda ölçülerek) ve bu ekrana KOPYALANDI;
      aynı gün kitte bileşene çıktı (`chat-layout.tsx` künyesi: gerekçe, ölçüm ve açık kalan
      platform sorusu orada). Kopya kaldı, kural tek yerde.
    */
    <ChatLayout above={tags} composer={composer} contentContainerStyle={styles.thread} testID="management-complaint-thread">
        {/*
          BAĞLI KAYITLAR (v3:2156) — yazışmanın ÜSTÜNDE, kaydırılan alanın içinde: talebin neye
          asılı olduğu bir kere okunur, sonra yazışmaya bakılır. Yapışkan şeride konmadı; sabit
          duran şey ekranın DURUMU olmalı (etiketler), geçmişi değil.
        */}
        <View style={styles.linked} testID="management-complaint-linked">
          <Text style={styles.linkedEyebrow}>{t.complaint.linked.eyebrow}</Text>
          <Text style={styles.linkedLine}>
            {detail.orderReferenceNo === null
              ? t.complaint.linked.orderNone
              : fillCopy(t.complaint.linked.order, { reference: detail.orderReferenceNo })}
          </Text>
          {/* Kaynak ve son mesaj damgası başlıktan BURAYA indi (v3'ün künye kararı). */}
          <Text style={styles.linkedLine}>
            {fillCopy(t.complaint.linked.trace, {
              source: t.complaint.source[detail.source],
              stamp: stampOf(detail.lastMessageAt),
            })}
          </Text>
        </View>

        {detail.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

    </ChatLayout>
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
      <ManagementChatBubble
        tone="customer"
        body={showOriginal ? message.originalBody : message.body}
        caption={
          message.bodyTranslated
            ? showOriginal
              ? fillCopy(t.complaint.author.customerOriginal, { from })
              : fillCopy(t.complaint.author.customer, { from })
            : t.complaint.author.customerPlain
        }
        /* Çeviri düğmesi künyenin ALTINDA (ortak baloncuk künyesi): baloncuk yalnız söyleneni
           taşır, düğme içindeyken mesajın parçası gibi okunuyordu. */
        footer={
          message.bodyTranslated ? (
            <PressableSurface
              onPress={() => setShowOriginal((value) => !value)}
              feedback="opacity"
              compact
              accessibilityLabel={showOriginal ? t.complaint.translated : t.complaint.original}
              testID={`management-complaint-original-${message.id}`}
            >
              <Text style={styles.bubbleLink}>{showOriginal ? t.complaint.translated : t.complaint.original}</Text>
            </PressableSurface>
          ) : null
        }
      />
    );
  }

  const caption =
    message.sender === 'ai'
      ? t.complaint.author.ai
      : message.authorName === null
        ? t.complaint.author.operatorUnknown
        : fillCopy(t.complaint.author.operator, { name: message.authorName });

  /* AI'ın GÖNDERİLMİŞ mesajı operatörden ayrı tonda (sosyal sohbetin kararı): ekran, cevabı kimin
     yazdığını gizlemez. */
  return <ManagementChatBubble tone={message.sender === 'ai' ? 'ai' : 'operator'} body={message.body} caption={caption} />;
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
  /* Kaçınma kabının ve kaydırıcının kendi ölçüleri BURADA DEĞİL: ikisi de `ChatLayout`ın kuralı
     (klavye açılınca kısalması gereken listedir, çubuk değil). Ekran yalnız yazışmanın dolgusunu
     ve aralığını söylüyor. */
  thread: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  /** Gömülü nötr blok (v3:2156) — kartın içinde değil, sayfanın üstünde duran bir künye kutusu. */
  linked: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.sm,
  },
  linkedEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.body,
  },
  linkedLine: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  bubbleLink: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  /* TASLAK YUVASI — sosyal sohbetin yuvasıyla AYNI kabuk (zeytin zemin + zeytin çizgi + kontrol
     yarıçapı): iki yazışma ekranı aynı şeye aynı biçimi veriyor. Yazışmanın içindeki kesikli
     baloncuk kalktı; taslak artık cevap kutusunun üstünde, kararın verildiği yerde. */
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
  /** "KARAR" — eylem alanının üstbaşlığı (v3:2159). */
  decisionLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /* İki karar düğmesi YAN YANA kaldı; v3 onları alt alta diziyor (v3:2161) ama o ekranda yazı
     alanı YOK — bizde alanın altında klavye de açılıyor ve dikey dizilim küçük ekranda yazışmayı
     tamamen kapatırdı. */
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
  /* Gölgesiz: v3 sert gölgeyi bıraktı (ölçüldü 30.08 — müşteri v3'te 26, operasyon v2'de 3,
     operasyon v3'te SIFIR). Düğmeyi yüzeyden ayıran şey artık dolgunun kendisi. */
  claimOpen: {
    backgroundColor: operationsTheme.colors.olive,
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
