import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsIconButton } from '@/components/operations/icon-button';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsPartyAvatar } from '@/components/operations/party-avatar';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ChatLayout } from '@/components/ui/chat-layout';
import { ChatText } from '@/components/ui/chat-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { agoOf, dayGroupLabelOf, stampOf, timeOf } from '@/lib/operations/stamp';
import { fillCopy, operationsFailureText } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { allowedTicketTransitions } from '@lezzet/domain-core';
import { type ComplaintDetail, type ComplaintMessage, TicketHandlerEnum, type TicketStatus, TicketTypeEnum } from '@lezzet/types';
import { ManagementChatBubble } from './chat-bubble';
import { managementCopy } from './copy';
import { useComplaint } from './use-complaint.hook';

/*
  Y1 · ŞİKÂYET / TALEP — YAZIŞMA YARISI (Operasyon Mobil v3:30, kareler
  `design/project/screenshots/Yonetim/Talepler/02·04·05`).

  ── EKRANIN İKİ YARISI VAR; BU DOSYA BİRİNCİSİ ──────────────────────────────
  Tasarım talebi tek ekranda iki yarım olarak kuruyor: **yazışma** (oku · çevir · taslağı al ·
  cevapla) ve **karar** (⋮ ile açılan Aksiyonlar çekmecesi: talep türü · asistan modu · karar ·
  kaydı yönet). Bu tur YALNIZ yazışma yarısını tasarıma getirdi (kullanıcı kararı 06.09:
  *"Talepler kısmındaki mesajlaşma bölümüne odaklan ve tasarım ile aynı olsun"*). Çekmece
  çizilmedi ve künyesi aşağıda; ⋮ düğmesi de konmadı — açacağı yer yokken duran bir düğme,
  basıldığında hiçbir şey olmayan bir vaattir.

  ── TASARIMIN ANATOMİSİ, SIRASIYLA ──────────────────────────────────────────
  1. **Başlık**: geri · karşı taraf avatarı · müşteri adı · altında "tür · kanal".
  2. **Durum bandı**: topun kimde olduğu ve ne kadar beklediği.
  3. **Gün ayracı** ("28 AĞUSTOS") — yazışmanın başladığı gün.
  4. **TALEP METNİ kartı**: müşterinin ilk anlatımı KENDİ kartında; çeviri satırı, ekli görseller
     ızgarası ve BAĞLI KAYIT bloğu onun içinde.
  5. **"YAZIŞMA · N MESAJ" ayracı**, sonra baloncuklar.
  6. **Bekleyen asistan taslağı** cevap kutusunun üstünde, kesikli değil DOLU zeytin kartta.
  7. **Cevap kutusu + dolu daireli gönder düğmesi.**

  ── İLK MESAJ ARTIK BALONCUK DEĞİL, KART ────────────────────────────────────
  Şema talebin ilk anlatımını da bir MESAJ olarak tutuyor (`0026_ticket.sql`: *"ayrı bir
  `description` kolonu olsaydı ekran ikisini birleştirmek zorunda kalırdı"*) — ekran onu yine
  yazışmadan alıp öne çıkarıyor, çünkü kararın dayanağı odur ve baloncuk dizisinin içinde
  kaybolup gidiyordu. Veri tek yerde, sunum iki türlü: şemanın kararı bozulmadı.

  ── TASARIMIN İSTEDİĞİ AMA ÖLÇÜLDÜĞÜNDE KARŞILIĞI OLMAYAN ÜÇ ŞEY ────────────
  Üçü de ÇİZİLMEDİ; uydurulmuş bir sayı, olmayan bir kaydı varmış gibi gösterir.
  · **Talep referansı** ("SK-26-8H2P"). `public.ticket`te insan okuyabilir bir referans kolonu
    YOK (ölçüldü `0026_ticket.sql`) — kimlik uuid. Başlık künyesi bu yüzden "tür · kanal" diyor.
  · **Süre sayacı** ("22 sa kaldı"). Talepte SLA yok ve bu bilinçli: `TicketStatusEnum` künyesi
    *"karmaşık ticket mekaniği YOK (atama/öncelik/SLA yok)"* diyor. Bandın taşıdığı zaman, GERÇEK
    olan tek zamandır: son mesajın üstünden ne kadar geçtiği.
  · **Karar rozeti** ("Karar: Jest — bedelsiz yeniden gönderim"). Karar kavramı sözleşmede yok;
    ayrıca tasarımın "jest" adı sistemdekinin TERSİNİ söylüyor (`ReturnDispositionEnum.goodwill`:
    *"mal müşteride kaldı"*), yani rozet çizilse yanlış bir sözlükle çizilecekti.

  ── EKLER: IZGARA GERÇEK, "BÜYÜT" SİSTEM TARAYICISINDA ──────────────────────
  `attachmentUrls` sözleşmede zaten var ve uçta İMZALI (15 dk) üretiliyor (`ticket/read.ts` →
  `privateReadUrls`) — ızgara uydurma değil, gerçek fotoğrafları çiziyor. Dokununca uygulama içi
  bir görüntüleyici DEĞİL, sistem tarayıcısı açılıyor: webin talepler ekranı da aynı şeyi yapıyor
  ("yeni sekmede açılır çünkü karar çoğu kez fotoğraftan verilir") ve uygulama içi tam ekran
  görüntüleyici ayrı bir komponent + testi demek. İmzalı adres süreliyken açılırsa tarayıcı
  hatayı kendisi gösterir; ekran "açılamadı" cümlesini yalnız `openURL` reddederse yazar.

  ── ÜSTLEN NEREYE GİTTİ ─────────────────────────────────────────────────────
  Tasarımda üstlenme çekmecenin içinde ("KAYDI YÖNET"). Çekmece yokken düğmeyi silmek, var olan
  TEK karar kapısını sökmek olurdu; bu yüzden cevap kutusunun altında sessiz bir metin eylemi
  olarak durdu. Çekmece geldiği gün oraya taşınır.

  ── YZ ÖNERİSİ BİR CEVAP DEĞİL, BİR TASLAKTIR ───────────────────────────────
  Öneri talebin bekleyen taslağıdır (`aiDraftReply`, 16.5) ve iki çıkışı gerçek kapıya bağlı
  (`consumeTicketDraft`): "Gönder" taslağı olduğu gibi cevaba çevirir, "düzenle" metni cevap
  kutusuna taşır. Tasarımın kutucuk üstündeki × (taslağı at) çizilmedi: atmayı yazan bir uç yok.
*/

const t = managementCopy;

export function ComplaintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const complaint = useComplaint(typeof params.id === 'string' ? params.id : undefined);
  const { state } = complaint;
  const detail = state.status === 'ready' ? state.complaint : null;
  /* AKSİYON ÇEKMECESİ (v3:30'un ⋮ menüsü) — İKİ kapısı var, tasarım ikisini de çiziyor: başlıktaki
     ⋮ ve durum bandındaki "aksiyon ›". Gerekçe ölçülebilir — bant kaydırılınca yukarı çıkar, başlık
     yerinde durur; bant okunurken de göz zaten oradadır. Durum EKRANDA, çünkü çekmeceyi hem başlık
     hem gövde açıyor. */
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <View style={styles.screen} testID="management-complaint">
      <OperationsStackHeader
        /* Başlık MÜŞTERİNİN ADI (v3:30): ekranın konusu bir kayıt değil, bir insandır. Talep
           yüklenmeden ad bilinmiyor — o hâlde bölümün genel adı durur. */
        title={detail === null ? t.complaint.title : detail.customerName}
        subtitle={
          detail === null
            ? undefined
            : fillCopy(t.complaint.headCaption, {
                kind: t.complaint.kind[detail.type].toLocaleLowerCase('tr'),
                source: t.complaint.source[detail.source],
              })
        }
        leading={detail === null ? undefined : <OperationsPartyAvatar name={detail.customerName} testID="management-complaint-avatar" />}
        right={
          detail === null ? undefined : (
            <OperationsIconButton
              icon="more"
              tone="plain"
              onPress={() => setActionsOpen(true)}
              accessibilityLabel={t.complaint.actions.openLabel}
              testID="management-complaint-actions-open"
            />
          )
        }
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-complaint-header"
      />

      {state.status === 'loading' ? (
        /* BURADA İSKELET YOK, HALKA VAR — bilinçli. v3'ün ilk-yük dili (`OperationsSkeletonList`)
           bir LİSTE kalıbıdır: eşit yükseklikte kutular gelecek satırların ölçüsünü tutar. Yazışma
           öyle değil — baloncuklar en fazla %86 genişlikte, yönü konuşana göre değişiyor ve kaç
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
            description={operationsFailureText(state.failure)}
            retry={{ label: t.common.error.retry, onPress: complaint.retry }}
            testID="management-complaint-error"
          />
        </View>
      ) : detail === null ? (
        <View style={styles.noticeBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.complaint.empty.title}
            description={t.complaint.empty.body}
            testID="management-complaint-empty"
          />
        </View>
      ) : (
        <ComplaintBody detail={detail} complaint={complaint} onOpenActions={() => setActionsOpen(true)} />
      )}

      {detail === null ? null : (
        <ComplaintActionsSheet
          visible={actionsOpen}
          detail={detail}
          busy={complaint.sending}
          complaint={complaint}
          onClose={() => setActionsOpen(false)}
          /* Durum geçişi çekmeceyi KAPATMIYOR artık: tasarımın çekmecesi bir karar masasıdır,
             operatör türü düzeltip modu değiştirip sonra kapatabilmeli. Kapatma tek yerde —
             alttaki "Bitti" düğmesi ve perde. */
          onStatus={(to) => complaint.setStatus(to)}
        />
      )}
    </View>
  );
}

interface ComplaintActionsSheetProps {
  visible: boolean;
  detail: ComplaintDetail;
  busy: boolean;
  complaint: ReturnType<typeof useComplaint>;
  onClose: () => void;
  onStatus: (to: TicketStatus) => void;
}

/**
 * AKSİYONLAR ÇEKMECESİ (v3:30) — kaydın kendisine ait kararlar, yazışmanın dışında.
 *
 * ── BUGÜN TEK BÖLÜM VAR, VE SEBEBİ ÖLÇÜLDÜ ─────────────────────────────────
 * Tasarımın çekmecesi dört bölüm çiziyor: talep türü · asistan modu · karar · kaydı yönet.
 * Bugün yalnız **DURUM** çizildi çünkü ötekilerin arkasında mobilden çağrılabilir bir kapı yok:
 *  · **asistan modu** ve **iade tetikleme** motorda VAR ama `apps/web/lib/ticket/write.ts`te
 *    gövdesiyle duruyor, `@lezzet/application`a terfi etmemiş — terfi web şeridiyle
 *    konuşuluyor (21.276 görev satırı).
 *  · **talep türü** ve dört maddelik **karar seti** hiçbir yerde yok; ikincisi 30.08'de zaten
 *    bildirilmiş bir tasarım sorusu (`design/BACKLOG.md §5`) ve tasarımın "jest" adı sistemin
 *    `goodwill` tanımının TERSİNİ söylüyor. Basıldığında hiçbir şey yazmayan bir çip, kararın
 *    verildiğini sanan bir operatör demektir.
 *
 * ── HANGİ GEÇİŞİN AÇIK OLDUĞUNU MOTOR SÖYLER ───────────────────────────────
 * `allowedTicketTransitions` (domain-core, saf) — künyesi zaten *"ekranın sunacağı geçişler"*
 * diyor. Ekran üç durumu da çiziyor ama yalnız motorun izin verdiğine bastırıyor; şu anki durum
 * seçili görünür ve basılamaz. İzin listesini burada yeniden hesaplamak, kuralı ikinci bir yerde
 * yaşatmak olurdu (CLAUDE §1) — üstelik sunucu yine reddederdi, yani ekran yalancı olurdu.
 */
function ComplaintActionsSheet({ visible, detail, busy, complaint, onClose, onStatus }: ComplaintActionsSheetProps) {
  const allowed = allowedTicketTransitions(detail.status, 'staff');
  const canReturn = detail.orderReferenceNo !== null;

  return (
    /* Başlığı ÇEKMECE çiziyor (kitin kendi satırı) — ekranın ikinci bir başlık yazması, aynı
       cümleyi iki kez söylemek olurdu. */
    <BottomSheet visible={visible} title={t.complaint.actions.title} onClose={onClose} testID="management-complaint-actions">
      <View style={styles.sheet}>
        <Text style={styles.sheetCaption}>
          {fillCopy(t.complaint.actions.caption, {
            kind: t.complaint.kind[detail.type].toLocaleLowerCase('tr'),
            source: t.complaint.source[detail.source],
          })}
        </Text>

        {/* ── TALEP TÜRÜ ─────────────────────────────────────────────────────
            Tasarım üç çip çiziyor (soru · şikâyet · talep), sözleşmenin enum'u DÖRT değerli
            (bozuk · eksik · soru · diğer). Dördü de çizildi: üçe kırpmak, kuyruğun kendi
            sözlüğünden bir sınıfı ekranda görünmez yapardı. */}
        <Text style={styles.sheetLabel}>{t.complaint.actions.typeLabel}</Text>
        <View style={styles.sheetChips}>
          {TicketTypeEnum.options.map((type) => (
            <SheetChip
              key={type}
              label={t.complaint.kind[type].toLocaleLowerCase('tr')}
              current={type === detail.type}
              disabled={busy}
              onPress={() => complaint.setType(type)}
              testID={`management-complaint-type-${type}`}
            />
          ))}
        </View>

        {/* ── ASİSTAN MODU ───────────────────────────────────────────────────
            Tasarım ikisini çiziyor (insan · hibrit), enum ÜÇ değerli. Üçü de çizildi çünkü
            aynı kavram sosyal konuşma ekranında zaten üç seçenekle duruyor — birinde üç,
            ötekinde iki göstermek aynı ayarı iki farklı şeymiş gibi okuturdu. */}
        <Text style={styles.sheetLabel}>{t.complaint.actions.modeLabel}</Text>
        <View style={styles.sheetChips}>
          {TicketHandlerEnum.options.map((mode) => (
            <SheetChip
              key={mode}
              label={t.complaint.actions.mode[mode]}
              current={mode === detail.handledBy}
              disabled={busy}
              onPress={() => complaint.setMode(mode)}
              testID={`management-complaint-mode-${mode}`}
            />
          ))}
        </View>

        {/* ── KARAR ──────────────────────────────────────────────────────────
            Tasarım DÖRT satır çiziyor; sistemde ikisinin karşılığı var ve kullanıcı kararı
            (06.09) "sistemin diline çevir" oldu:
             · "Kısmi iade" + "Tam iade" → TEK damga (`triggerReturnFromTicket`). Tutarı talep
               belirlemiyor, iade siparişte yaşıyor (DOMAIN §8); iki düğme aynı yazımı yapardı.
             · "Jest — bedelsiz yeniden gönderim" ÇİZİLMEDİ: adı sistemin `goodwill` tanımının
               TERSİ ("mal müşteride kaldı, para iade edildi") ve yeniden gönderim diye bir
               yetenek motorda hiç yok — akıbet siparişin iade akışında seçiliyor.
             · "Kapat — işlem yok" → durum geçişi, tasarımın adıyla. */}
        <Text style={styles.sheetLabel}>{t.complaint.actions.decisionLabel}</Text>
        <SheetRow
          label={detail.orderReferenceNo === null ? t.complaint.actions.returnNoOrder : t.complaint.actions.return}
          disabled={!canReturn || busy}
          onPress={complaint.triggerReturn}
          testID="management-complaint-return"
        />
        <SheetRow
          label={t.complaint.actions.resolve}
          disabled={!allowed.includes('resolved') || busy}
          onPress={() => onStatus('resolved')}
          testID="management-complaint-status-resolved"
        />

        {/* ── KAYDI YÖNET ────────────────────────────────────────────────────
            Tasarımda "Üstlen" + "Masada devam et" yan yana iki düğme. İkincisi TASARIMDA DA
            eylemsiz (`onClick`i yok, ölçüldü) ve bizde de açacağı bir kapı yok — düğme olarak
            değil CÜMLE olarak duruyor: dokunulacakmış gibi duran ama hiçbir şey yapmayan bir
            kutu, bölümün sınırını anlatmaz, yalanlar.

            CÜMLE BAŞLIĞIN ALTINDA DEĞİL DİPTE (kullanıcı bulgusu 07.09): "kuyruk, kurulum ve
            derin inceleme masaüstünde kalır" kaydı yönetmenin bir yolu değil, çekmecenin
            SINIRIDIR — eylem başlığının altında durunca bölüm yarı ölü okunuyordu. Dipnotun
            yanına indi: orası zaten "buranın yapMAdığı şeyler"in yeri. */}
        <Text style={styles.sheetLabel}>{t.complaint.actions.manageLabel}</Text>
        <View style={styles.sheetChips}>
          <SheetChip
            label={t.complaint.actions.claim}
            current={detail.status === 'in_progress'}
            disabled={!allowed.includes('in_progress') || busy}
            onPress={() => onStatus('in_progress')}
            testID="management-complaint-status-in_progress"
          />
          {allowed.includes('open') ? (
            <SheetChip
              label={t.complaint.actions.reopen}
              current={false}
              disabled={busy}
              onPress={() => onStatus('open')}
              testID="management-complaint-status-open"
            />
          ) : null}
        </View>

        {/* Tasarımın koyu düğmesi ("Kararı kaydet — cevaba dön") ÖLÇÜLDÜ: tek işlevi çekmeceyi
            KAPATMAK (`onClick="{{ closeAksiyon }}"`). Bizde de öyle ve adı bunu söylüyor —
            "kaydet" demek, yukarıdaki her dokunuşun zaten yazılmış olduğunu gizlerdi. */}
        <PressableSurface
          onPress={onClose}
          feedback="scale"
          style={styles.sheetDone}
          accessibilityLabel={t.complaint.actions.done}
          testID="management-complaint-actions-done"
        >
          <Text style={styles.sheetDoneLabel}>{t.complaint.actions.done}</Text>
        </PressableSurface>

        <Text style={styles.sheetNote}>{t.complaint.actions.note}</Text>
        <Text style={styles.sheetNote}>{t.complaint.actions.desk}</Text>
      </View>
    </BottomSheet>
  );
}

interface SheetChipProps {
  label: string;
  current: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

/** Seçim çipi — şu anki seçenek KOYU ve basılamaz (basılsa sunucu `already_in_*` ile reddederdi). */
function SheetChip({ label, current, disabled, onPress, testID }: SheetChipProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={current || disabled}
      feedback="scale"
      compact
      grow
      style={[styles.sheetChip, current ? styles.sheetChipCurrent : disabled ? styles.sheetChipShut : styles.sheetChipOpen]}
      accessibilityLabel={current ? `${label} — ${t.complaint.actions.now}` : label}
      testID={testID}
    >
      <Text style={[styles.sheetChipLabel, current ? styles.sheetChipLabelCurrent : disabled ? styles.sheetChipLabelShut : null]}>
        {label}
      </Text>
    </PressableSurface>
  );
}

/** Karar satırı — tasarımın tam genişlikte, sola yaslı satırları. */
function SheetRow({ label, disabled, onPress, testID }: { label: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback="scale"
      compact
      style={[styles.sheetRow, disabled ? styles.sheetChipShut : styles.sheetChipOpen]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.sheetRowLabel, disabled ? styles.sheetChipLabelShut : null]}>{label}</Text>
    </PressableSurface>
  );
}

/** Bandın zaman cümlesi — "40 dk önce". "şimdi önce" diye bir Türkçe yok (hub'la aynı kural). */
function agoLabelOf(iso: string): string {
  const ago = agoOf(iso, new Date());
  return ago === 'şimdi' ? t.complaint.band.agoNow : fillCopy(t.complaint.band.ago, { ago });
}

interface ComplaintBodyProps {
  detail: ComplaintDetail;
  complaint: ReturnType<typeof useComplaint>;
  /** Bandın "aksiyon ›" bağı — çekmeceyi ekran açıyor, gövde yalnız niyeti bildiriyor. */
  onOpenActions: () => void;
}

function ComplaintBody({ detail, complaint, onOpenActions }: ComplaintBodyProps) {
  const claimed = detail.status !== 'open';
  /* Taslağı "düzenle" ile alan operatöre yerini söyleyen satır. Yerel durum, çünkü olay yerel:
     sunucu taslağı tüketti (artık `null`), metin kutuda — ikisini birleştiren tek bilgi budur.
     Kutu boşalınca satır da düşer: boş bir kutunun üstünde "kutuya alındı" yazmak yalan olurdu. */
  const [tookDraft, setTookDraft] = useState(false);
  const draftInBox = tookDraft && complaint.reply.trim().length > 0;

  /* İlk mesaj TALEP METNİDİR (şemanın kararı: anlatım da bir mesajdır), kalanı yazışma. */
  const [request, ...thread] = detail.messages;

  /* BANT — topun kimde olduğu + son mesajın yaşı. Rengi de bilgidir: bizde bekleyen iş dikkat
     tonunda, onlarda bekleyen sessiz nötrde. */
  const band = (
    <View style={[styles.band, detail.awaitingReply ? styles.bandOurTurn : styles.bandTheirTurn]}>
      <View style={styles.bandLead}>
        <View style={[styles.bandDot, detail.awaitingReply ? styles.bandDotOurTurn : styles.bandDotTheirTurn]} />
        <Text
          style={[styles.bandText, detail.awaitingReply ? styles.bandTextOurTurn : styles.bandTextTheirTurn]}
          testID="management-complaint-band"
        >
          {fillCopy(detail.awaitingReply ? t.complaint.band.ourTurn : t.complaint.band.theirTurn, {
            ago: agoLabelOf(detail.lastMessageAt),
          })}
        </Text>
      </View>
      <View style={styles.bandTail}>
        {/* Durum tasarımın bandında YOK (orada karar durumu var, bizde karar kavramı yok) ama
            çekmece onu değiştiriyor ve değişimin görüldüğü tek yer burası. */}
        <Text style={[styles.statusTag, claimed ? styles.statusInProgress : styles.statusOpen]} testID="management-complaint-status">
          {t.complaint.status[detail.status]}
        </Text>
        <PressableSurface
          onPress={onOpenActions}
          feedback="opacity"
          compact
          accessibilityLabel={t.complaint.actions.openLabel}
          testID="management-complaint-actions-band"
        >
          <Text style={[styles.bandAction, detail.awaitingReply ? styles.bandTextOurTurn : styles.bandTextTheirTurn]}>
            {t.complaint.actions.open}
          </Text>
        </PressableSurface>
      </View>
    </View>
  );

  const draftSlot =
    detail.aiDraftReply !== null ? (
      <View style={styles.draft} testID="management-complaint-draft">
        <Text style={styles.draftEyebrow}>{t.complaint.draft.eyebrow}</Text>
        {/* Taslak, ajanın yazdığı hâliyle çizilir — gönderilecek metnin biçimi burada görünmezse
            operatör onaylamadığı bir şeyi onaylamış olur. */}
        <ChatText style={styles.draftBody}>{detail.aiDraftReply}</ChatText>
        <View style={styles.draftActions}>
          <PressableSurface
            onPress={() => {
              setTookDraft(true);
              complaint.consumeDraft(false);
            }}
            feedback="opacity"
            compact
            accessibilityLabel={t.complaint.draft.edit}
            testID="management-complaint-assistant-edit"
          >
            <Text style={styles.draftEditLabel}>{t.complaint.draft.edit}</Text>
          </PressableSurface>
          <PressableSurface
            onPress={() => complaint.consumeDraft(true)}
            feedback="scale"
            compact
            style={styles.draftSend}
            accessibilityLabel={t.complaint.draft.send}
            testID="management-complaint-assistant-send"
          >
            <Text style={styles.draftSendLabel}>{t.complaint.draft.send}</Text>
          </PressableSurface>
        </View>
        <Text style={styles.draftNote}>{t.complaint.draft.note}</Text>
      </View>
    ) : draftInBox ? (
      <Text style={styles.draftTaken} testID="management-complaint-draft-taken">
        {t.complaint.draft.taken}
      </Text>
    ) : null;

  const canSend = !complaint.sending && complaint.reply.trim().length > 0;

  const composer = (
    <View style={styles.footer}>
      {draftSlot}
      {complaint.lastError === null ? null : (
        <Text style={styles.actionError} testID="management-complaint-action-error">
          {fillCopy(t.complaint.actionFailed, { reason: complaint.lastError })}
        </Text>
      )}
      {/* KUTU VE GÖNDER AYNI SATIRDA (v3:30) — düğme kutunun altındayken cevap yazmak iki katlı bir
          iş gibi okunuyordu; tasarım ikisini tek harekete indiriyor. */}
      <View style={styles.composerRow}>
        <TextInput
          value={complaint.reply}
          onChangeText={(value) => {
            complaint.setReply(value);
            if (value.trim().length === 0) setTookDraft(false);
          }}
          multiline
          placeholder={t.complaint.replyPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.complaint.replyLabel}
          style={styles.replyInput}
          testID="management-complaint-reply"
        />
        <OperationsIconButton
          icon="navigate"
          tone="accent"
          onPress={complaint.sendReply}
          disabled={!canSend}
          accessibilityLabel={complaint.sending ? t.complaint.sending : t.complaint.send}
          testID="management-complaint-send"
        />
      </View>
      {/* "Üstlen" DE "Masada devam et" DE BURADAN ÇEKMECEYE TAŞINDI (v3'ün "KAYDI YÖNET"i, ortak
          çekmece şablonunda) — ikisi de yazışmanın altında değil, çekmecede duruyor. Tasarımın
          yazışma çubuğunda kutu ve gönderten başka hiçbir şey yok; buraya konan her satır cevap
          yazmakla ilgisi olmayan bir işi cevap yazma sırasına sokar. */}
    </View>
  );

  return (
    /*
      YAZIŞMA KABI KİTTEN (27.08) — klavye kaçınması, listenin esnemesi ve çubuğun sabit kalması
      onun kuralları. Ekran yalnız üç parçayı veriyor: üstteki bant, yazışma, çubuk.
    */
    <ChatLayout above={band} composer={composer} contentContainerStyle={styles.thread} testID="management-complaint-thread">
      {request === undefined ? null : (
        <>
          <Text style={styles.daySeparator}>{dayGroupLabelOf(request.createdAt, new Date())}</Text>
          <RequestCard detail={detail} request={request} />
        </>
      )}

      {thread.length === 0 ? null : (
        <Text style={styles.threadSeparator} testID="management-complaint-thread-separator">
          {fillCopy(t.complaint.threadSeparator, { n: String(detail.messages.length) })}
        </Text>
      )}

      {thread.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </ChatLayout>
  );
}

interface RequestCardProps {
  detail: ComplaintDetail;
  request: ComplaintMessage;
}

/** TALEP METNİ kartı — anlatım, çevirisi, ekleri ve bağlı kaydı tek kutuda (v3:30). */
function RequestCard({ detail, request }: RequestCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const from = (request.language ?? '?').toLocaleUpperCase('tr');

  return (
    <View style={styles.request} testID="management-complaint-request">
      <View style={styles.requestHead}>
        <Text style={styles.requestEyebrow}>{t.complaint.request.eyebrow}</Text>
        <Text style={styles.requestStamp}>
          {fillCopy(t.complaint.request.stamp, {
            source: t.complaint.source[detail.source],
            stamp: stampOf(request.createdAt),
          })}
        </Text>
      </View>

      <ChatText style={styles.requestBody}>{showOriginal ? request.originalBody : request.body}</ChatText>

      {/* Çeviri satırı yalnız GERÇEKTEN çevrilmiş metinde çizilir — aynı metni iki kez açan bir
          düğme yalan olurdu. */}
      {request.bodyTranslated ? (
        <View style={styles.requestTranslation}>
          <Text style={styles.requestTranslationLabel}>
            {fillCopy(t.complaint.request.translation, { from })}
          </Text>
          <PressableSurface
            onPress={() => setShowOriginal((value) => !value)}
            feedback="opacity"
            compact
            accessibilityLabel={showOriginal ? t.complaint.translated : t.complaint.original}
            testID={`management-complaint-original-${request.id}`}
          >
            <Text style={styles.bubbleLink}>{showOriginal ? t.complaint.translated : t.complaint.original}</Text>
          </PressableSurface>
        </View>
      ) : null}

      {request.attachmentUrls.length === 0 ? null : <AttachmentGrid urls={request.attachmentUrls} />}

      {/* BAĞLI KAYIT kartın İÇİNDE (v3:30): talebin neye asılı olduğu, anlatımın hemen altında
          okunur — ayrı bir blok olarak yukarıda dururken göz onu anlatımdan önce buluyordu. */}
      <View style={styles.linked} testID="management-complaint-linked">
        <Text style={styles.linkedEyebrow}>{t.complaint.linked.eyebrow}</Text>
        <Text style={styles.linkedLine}>
          {detail.orderReferenceNo === null
            ? t.complaint.linked.orderNone
            : fillCopy(t.complaint.linked.order, { reference: detail.orderReferenceNo })}
        </Text>
        <Text style={styles.linkedLine}>
          {fillCopy(t.complaint.linked.trace, {
            source: t.complaint.source[detail.source],
            stamp: stampOf(detail.lastMessageAt),
          })}
        </Text>
      </View>
    </View>
  );
}

/** Ekli görseller — üçlü ızgara; dokunuş imzalı adresi sistem tarayıcısında açar. */
function AttachmentGrid({ urls }: { urls: readonly string[] }) {
  const [failed, setFailed] = useState(false);

  return (
    <View style={styles.attachments} testID="management-complaint-attachments">
      <Text style={styles.attachmentsEyebrow}>
        {fillCopy(t.complaint.request.attachments, { n: String(urls.length) })}
      </Text>
      <View style={styles.attachmentRow}>
        {urls.map((url, index) => (
          <PressableSurface
            key={url}
            onPress={() => void Linking.openURL(url).catch(() => setFailed(true))}
            feedback="opacity"
            compact
            style={styles.attachmentTile}
            accessibilityLabel={fillCopy(t.complaint.request.attachmentLabel, { i: String(index + 1) })}
            testID={`management-complaint-attachment-${index}`}
          >
            <Image source={{ uri: url }} style={styles.attachmentImage} resizeMode="cover" />
          </PressableSurface>
        ))}
      </View>
      <Text style={styles.attachmentsNote}>{t.complaint.request.attachmentsNote}</Text>
      {failed ? (
        <Text style={styles.actionError} testID="management-complaint-attachment-error">
          {t.complaint.request.attachmentFailed}
        </Text>
      ) : null}
    </View>
  );
}

interface MessageBubbleProps {
  message: ComplaintMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  /* Orijinal/çeviri geçişi BALONCUĞUN kendi durumu — tek mesajın düğmesi bütün yazışmayı çevirmez. */
  const [showOriginal, setShowOriginal] = useState(false);
  const time = timeOf(message.createdAt);

  if (message.sender === 'customer') {
    const from = (message.language ?? '?').toLocaleUpperCase('tr');
    return (
      <ManagementChatBubble
        tone="customer"
        body={showOriginal ? message.originalBody : message.body}
        /* KÜNYE SATIRI TEK SATIRDIR (v3:30): çeviri yönü, "orijinali gör" ve saat yan yana. Ayrı
           satırlara bölündüklerinde baloncuğun altı üç kata çıkıyor ve yazışma seyrekleşiyordu. */
        footer={
          <View style={styles.bubbleMeta}>
            {message.bodyTranslated ? (
              <>
                <Text style={styles.bubbleMetaText}>
                  {showOriginal
                    ? fillCopy(t.complaint.author.customerOriginal, { from })
                    : fillCopy(t.complaint.request.translation, { from })}
                </Text>
                <PressableSurface
                  onPress={() => setShowOriginal((value) => !value)}
                  feedback="opacity"
                  compact
                  accessibilityLabel={showOriginal ? t.complaint.translated : t.complaint.original}
                  testID={`management-complaint-original-${message.id}`}
                >
                  <Text style={styles.bubbleLink}>{showOriginal ? t.complaint.translated : t.complaint.original}</Text>
                </PressableSurface>
              </>
            ) : null}
            <Text style={styles.bubbleMetaText}>{time}</Text>
          </View>
        }
      />
    );
  }

  const caption =
    message.sender === 'ai'
      ? fillCopy(t.complaint.author.ai, { time })
      : message.authorName === null
        ? fillCopy(t.complaint.author.operatorUnknown, { time })
        : fillCopy(t.complaint.author.operator, { name: message.authorName, time });

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

  /* ── DURUM BANDI ─────────────────────────────────────────────────────────── */
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    marginHorizontal: operationsTheme.space['6xl'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  bandOurTurn: { backgroundColor: operationsTheme.colors['terracotta-bg'] },
  bandTheirTurn: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  bandLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    flexShrink: 1,
  },
  /** Nokta rengi bandın kendi tonunu tekrarlar; tasarımın bandı da bir nokta ile açılıyor. */
  bandDot: {
    width: operationsTheme.space.md,
    height: operationsTheme.space.md,
    borderRadius: operationsTheme.space.md,
  },
  bandDotOurTurn: { backgroundColor: operationsTheme.colors.terracotta },
  bandDotTheirTurn: { backgroundColor: operationsTheme.colors['sand-500'] },
  bandText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    flexShrink: 1,
  },
  bandTextOurTurn: { color: operationsTheme.colors.terracotta },
  bandTextTheirTurn: { color: operationsTheme.colors.muted },
  bandTail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    flexShrink: 0,
  },
  bandAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  statusTag: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  statusOpen: {
    backgroundColor: operationsTheme.colors.card,
    color: operationsTheme.colors.muted,
  },
  statusInProgress: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },

  /* Kaçınma kabının ve kaydırıcının kendi ölçüleri BURADA DEĞİL: ikisi de `ChatLayout`ın kuralı. */
  thread: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space.xl,
    gap: operationsTheme.space.lg,
  },
  /** Gün ayracı — bildirim listesiyle aynı dil (ortada, seyrek harf, sessiz). */
  daySeparator: {
    alignSelf: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
    overflow: 'hidden',
  },
  threadSeparator: {
    alignSelf: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['sand-600'],
    paddingTop: operationsTheme.space.md,
  },

  /* ── TALEP METNİ KARTI ───────────────────────────────────────────────────── */
  request: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
  },
  requestHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  requestEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.body,
  },
  requestStamp: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
    flexShrink: 1,
    textAlign: 'right',
  },
  requestBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  requestTranslation: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  requestTranslationLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['sand-600'],
  },

  /* ── EKLER ───────────────────────────────────────────────────────────────── */
  attachments: { gap: operationsTheme.space.md },
  attachmentsEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.body,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
  },
  /* Karo ESNER, sabit genişlik yazılmaz: üç ek de bir ek de aynı ızgarada durmalı ve sabit ölçü
     dar ekranda taşardı. `aspectRatio` kareyi korur. */
  attachmentTile: {
    flexGrow: 1,
    flexBasis: '30%',
    aspectRatio: 1,
    borderRadius: operationsTheme.radius.badge,
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  attachmentImage: { width: '100%', height: '100%' },
  attachmentsNote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },

  /* ── BAĞLI KAYIT ─────────────────────────────────────────────────────────── */
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

  /* ── BALONCUK KÜNYESİ ────────────────────────────────────────────────────── */
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
  },
  bubbleMetaText: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
  bubbleLink: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },

  /* ── TASLAK YUVASI ───────────────────────────────────────────────────────── */
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
  /* Tasarımın hizası: "düzenle" sessiz metin, "Gönder" dolu düğme — ikisi SAĞA yaslı. */
  draftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: operationsTheme.space.xl,
  },
  draftEditLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  draftSend: {
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.olive,
  },
  draftSendLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
  draftNote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
    textAlign: 'right',
  },
  draftTaken: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },

  /* ── CEVAP KUTUSU ────────────────────────────────────────────────────────── */
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
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: operationsTheme.space.lg,
  },
  replyInput: {
    flex: 1,
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
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  claimLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Üstlenilmiş iş SÖNER: aynı eylem ikinci kez basılacak bir kapı değildir. */
  claimLabelDone: {
    color: operationsTheme.colors.muted,
  },

  /* ── AKSİYON ÇEKMECESİ ───────────────────────────────────────────────────── */
  sheet: {
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['4xl'],
  },
  sheetCaption: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  sheetLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.body,
    marginTop: operationsTheme.space.md,
  },
  sheetChips: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  sheetChip: {
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    alignItems: 'center',
  },
  /** Şu anki durum: KOYU dolgu — seçili olan, basılacak olan değil. */
  sheetChipCurrent: { backgroundColor: operationsTheme.colors.ink },
  /** Motorun izin verdiği geçiş: çerçeveli, basılabilir. */
  sheetChipOpen: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    backgroundColor: operationsTheme.colors.card,
  },
  /** Motorun kapattığı geçiş: sönük — gizlemek yerine SÖNDÜRÜYORUZ, üç durumun tamamı görünsün
      ki operatör "hangi hâller var" sorusunu da bu çekmeceden okusun. */
  sheetChipShut: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  sheetChipLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  sheetChipLabelCurrent: { color: operationsTheme.colors.card },
  sheetChipLabelShut: { color: operationsTheme.colors['disabled-text'] },
  /** Karar satırı: tam genişlik, sola yaslı — tasarımın "KARAR" listesi çip değil satırdır. */
  sheetRow: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  sheetRowLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  sheetDone: {
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.ink,
    alignItems: 'center',
    marginTop: operationsTheme.space.md,
  },
  sheetDoneLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
  },
  sheetNote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
