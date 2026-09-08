import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextField } from '@/components/ui/text-field';
import { fillCopy, operationsCopy, operationsFailureText } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { B2bCheckResponse } from '@lezzet/types';
import { managementCopy } from './copy';
import { b2bAgeText, b2bFlagBg, b2bFlagTone, b2bSignalGlyph, b2bStatusTone } from './b2b-format';
import { useB2bCheck } from './use-b2b-check.hook';

/*
  KURUMSAL BAŞVURU KARTI (21.217 · tasarım `b2bOnay`).

  ── İKİ KARAR AYRI ELLERDE (DOMAIN §8) ──────────────────────────────────────
  Bu ekran hesabın toptan fiyat görüp görmeyeceğine karar veriyor. Malın AKIBETİ (stoğa dön/imha)
  buranın işi değil — o depo kabulünde verilir. Ekranda o yüzden akıbet seçici yok.

  ── ONAY VE RET EŞİT AĞIRLIKTA DEĞİL ────────────────────────────────────────
  Onay tek dokunuşla biter; ret sebep isteyen ikinci bir adım açar (çekmece). İkisi aynı ağırlıkta
  çizilseydi ekran, olmayan bir simetri vaat ederdi.
*/

const t = managementCopy;

const SKELETON_HEIGHT = operationsTheme.space['2xl'] * 2 + operationsTheme.size.controlLg * 2;

export function B2bApplicationScreen({ customerId }: { customerId: string }) {
  const router = useRouter();
  const check = useB2bCheck(customerId);
  const { state, outcome } = check;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  /* Çubuğun ÖLÇÜLEN yüksekliği — formülle tahmin edilse dipnot uzayınca sessizce yanlış olurdu
     (kitin künyesi, kullanıcı bulgusu 01.09). Ölçülene dek 0: ilk karede çubuk zaten çizilmemiş. */
  const [barHeight, setBarHeight] = useState(0);

  const header = (
    <OperationsStackHeader
      title={t.b2b.detailTitle}
      subtitle={
        state.status === 'ready' && state.check !== null
          ? fillCopy(t.b2b.detailCaption, { age: b2bAgeText(state.check.appliedAt) })
          : undefined
      }
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="management-b2b-detail-header"
    />
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.screen} testID="management-b2b-detail">
        {header}
        <View style={styles.block}>
          <OperationsSkeletonList heights={[SKELETON_HEIGHT, SKELETON_HEIGHT]} label={t.b2b.loading} testID="management-b2b-detail-loading" />
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.screen} testID="management-b2b-detail">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={operationsFailureText(state.failure)}
            retry={{ label: t.common.error.retry, onPress: check.retry }}
            testID="management-b2b-detail-error"
          />
        </View>
      </View>
    );
  }

  if (state.check === null) {
    return (
      <View style={styles.screen} testID="management-b2b-detail">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.b2b.notFound.title}
            description={t.b2b.notFound.body}
            testID="management-b2b-detail-missing"
          />
        </View>
      </View>
    );
  }

  const kart = state.check;
  const karari = kart.status !== 'pending';

  return (
    <View style={styles.screen} testID="management-b2b-detail">
      <OperationsScreenScroll
        title={kart.name}
        caption={operationsCopy.sections.management.tab}
        /* Alt dolgu TOKEN'DAN + ölçülen çubuk. Bir tur `styles.body.paddingBottom` okunuyordu ve
           cihazda kusur şuydu: unistyles'ın stil nesnesi o alanı render anında vermiyor, toplam
           `NaN` çıkıyor ve RN'yi sessizce atlatıyordu — "masada devam et" cümlesi çubuğun ardında
           kalmıştı. Ölçülemeyen bir değerle aritmetik yapılmaz. */
        contentContainerStyle={[styles.body, { paddingBottom: operationsTheme.space['8xl'] + barHeight }]}
        testID="management-b2b-detail-body"
      >
        {/* BAŞLIK GÖVDE DOLGUSUNDAN MUAF (kullanıcı bulgusu 08.09) — künyesi `styles.headBleed`de. */}
        <View style={styles.headBleed}>{header}</View>

        {/*
          BAYRAK BİR ŞERİT, ROZET DEĞİL (tasarım · cihaz turu 07.09).

          İlk yazımda bayrağı kartın içine küçük bir rozet olarak koymuştum; tasarım onu başlığın
          hemen altında TAM GENİŞLİKTE bir bant olarak çiziyor — nokta + cümle, tonun kendi zemini
          ve kenarıyla. Fark görsel değil işlevsel: operatörün ilk okuduğu şey bu ve rozet
          boyunda bir yargı, kartın içinde kaybolur.

          Şeritte yazan şey CÜMLE (`reason`), tek kelime değil (cihaz turu 07.09): bant "Dikkat"
          diye duruyordu ve operatöre hangi satıra bakacağını söylemiyordu. Tek kelime kuyruk
          satırının işi, orada göz taramak için; burada yargı açıldı, gerekçesi de açılmalı.
        */}
        <View style={[styles.flagBanner, { backgroundColor: b2bFlagBg(kart.flag.tone), borderColor: b2bFlagTone(kart.flag.tone) }]}>
          <View style={[styles.flagDot, { backgroundColor: b2bFlagTone(kart.flag.tone) }]} />
          <Text style={[styles.flagText, { color: b2bFlagTone(kart.flag.tone) }]} testID="management-b2b-flag">
            {kart.flag.reason}
          </Text>
        </View>

        {/* KÜNYE KART DEĞİL, DÜZ BLOK — tasarım şirket bilgisini sayfanın zemininde tutuyor; kart
            yapmak onu sinyaller kartıyla eşit ağırlığa çıkarıyordu, oysa bu ekranın ÖZNESİ. */}
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{kart.name}</Text>
            <OperationsStatusBadge label={t.b2b.status[kart.status]} tone={b2bStatusTone(kart.status)} />
          </View>
          {/* RESMÎ UNVAN YALNIZ TİCARİ ADDAN FARKLIYSA (tasarım `unvanFarkli`): ikisi aynıysa satır
              aynı adı bir kez daha yazar ve okunacak bir şey söylemez. Ekli açıklama ("· resmî
              unvan") olmadan da satır, adın neden iki kez yazıldığını anlatmıyordu. */}
          {kart.legalName === null || kart.legalName === kart.name ? null : (
            <Text style={styles.legal}>{fillCopy(t.b2b.legalName, { name: kart.legalName })}</Text>
          )}
          {/* BAŞVURAN KİŞİ (kullanıcı bulgusu 08.09) — başlık işletmeye geçince kişi kartta hiç
              görünmez olmuştu. Operatörün ihtiyacı var: kapıda onu arayacak ve mükerrer şüphesi
              kişi üzerinden bakılıyor. Aynıysa çizilmiyor — hesap işletme adına açılmış demektir. */}
          {kart.contactName === kart.name ? null : (
            <Text style={styles.legal}>{fillCopy(t.b2b.contact, { name: kart.contactName })}</Text>
          )}

          {/* KİMLİK KUTUSU — etiket + numara + kaynak + ülke çipi; numara okunacak bir VERİ, bu
              yüzden kendi çerçevesinde ve gövde metninden kalın. Etiket MOTORDAN geliyor: Fransa'da
              SIRET, Almanya'da USt-IdNr — hangi numaranın hangi adla anıldığı bir iş kuralı. */}
          {kart.identity === null ? null : (
            <View style={styles.idBox}>
              <View style={styles.idBoxBody}>
                <Text style={styles.idLabel}>{kart.identity.label}</Text>
                <Text style={styles.idValue}>{kart.identity.value}</Text>
                {/* Kaynak satırı (tasarım `kaynak`): doğrulanmış numara ile başvuranın yazdığı
                    numara aynı ağırlıkta okunmamalı. */}
                <Text style={styles.idSource}>{kart.identity.source}</Text>
              </View>
              <Text style={styles.countryChip}>{kart.country}</Text>
            </View>
          )}

          {/* İKİ KARO — telefon ve adres DOKUNULABİLİR: kapıyı arayacak ya da haritada bakacak
              operatör için numarayı okuyup elle yazmak bir iş, dokunmak değil. */}
          <View style={styles.tiles}>
            {kart.phone === null ? null : (
              <PressableSurface
                onPress={() => void Linking.openURL(`tel:${kart.phone ?? ''}`)}
                feedback="scale"
                grow
                style={styles.tile}
                accessibilityLabel={kart.phone}
                testID="management-b2b-phone"
              >
                <Icon name="phone" size={operationsTheme.text.note} color={operationsTheme.colors.olive} />
                <Text style={styles.tileText} numberOfLines={1}>
                  {kart.phone}
                </Text>
              </PressableSurface>
            )}
            {kart.addressLine === null ? null : (
              <PressableSurface
                onPress={() => {
                  if (kart.mapsHref !== null) void Linking.openURL(kart.mapsHref);
                }}
                feedback="scale"
                grow
                /* Harita bağlantısı yoksa karo YİNE ÇİZİLİR ama dokunuşu bir şey yapmaz olurdu —
                   o yüzden bağlantısızda salt metin: ölü düğme doğmuyor. */
                disabled={kart.mapsHref === null}
                style={styles.tile}
                accessibilityLabel={kart.addressLine}
                testID="management-b2b-address"
              >
                <Icon name="navigate" size={operationsTheme.text.note} color={operationsTheme.colors.olive} />
                <Text style={styles.tileText} numberOfLines={1}>
                  {kart.addressLine}
                </Text>
              </PressableSurface>
            )}
          </View>
        </View>

        {/*
          SİNYALLER — kararın gövdesi.

          Satırın düzeni tasarımın: etiket solda soluk, DEĞER sağda kalın, tonu ise en sağdaki
          yuvarlak rozette. Bir tur soldaki çıplak noktaydı ve iki kusuru vardı — göz değeri okurken
          tonu görmüyordu (satırın öteki ucunda), ve renk tek başına anlam taşıyordu. Rozet ikisini
          de kapatıyor: işaret renge değil SİMGEYE de yaslanıyor.
        */}
        <OperationsSurface tone="panel" padding="md" style={styles.card}>
          <Text style={styles.sectionTitle}>{t.b2b.signals}</Text>
          <Text style={styles.sectionNote}>{t.b2b.signalsNote}</Text>
          {/* Satırlar BİTİŞİK, aralarını ince ayraç açıyor (tasarım `border-top:1px`). Boşlukla
              ayırmak — ilk yazımdaki hâl — altı satırlık ızgarayı iki ekrana yayıyordu; oysa
              ızgaranın işi tek bakışta karşılaştırılmak. */}
          <View style={styles.signals}>
            {kart.signals.map((signal) => (
              <View key={signal.label} style={styles.signalRow} testID={`management-b2b-signal-${signal.label}`}>
                <Text style={styles.signalLabel}>{signal.label}</Text>
                <Text style={styles.signalValue}>{signal.value}</Text>
                <View style={[styles.signalChip, { backgroundColor: b2bFlagBg(signal.tone) }]}>
                  <Text style={[styles.signalChipText, { color: b2bFlagTone(signal.tone) }]}>{b2bSignalGlyph(signal.tone)}</Text>
                </View>
              </View>
            ))}
          </View>
        </OperationsSurface>

        {/* MÜKERRER — SORU tonunda, uyarı değil. Sıfırsa bölüm HİÇ çizilmez: boş bir başlık,
            olmayan bir soruyu sordurur. */}
        {kart.duplicates.length === 0 ? null : (
          <OperationsSurface tone="panel" padding="md" style={styles.card} testID="management-b2b-duplicates">
            <Text style={styles.sectionTitle}>{t.b2b.duplicates}</Text>
            <Text style={styles.sectionNote}>{t.b2b.duplicatesNote}</Text>
            {kart.duplicates.map((row) => (
              <Text key={row.id} style={styles.meta}>
                {`${row.name}${row.phone === null ? '' : ` · ${row.phone}`}${row.isDraft ? ` · ${t.b2b.duplicateDraft}` : ''}`}
              </Text>
            ))}
          </OperationsSurface>
        )}

        {/*
          ASİSTAN ÖZETİ — OKUMA YARDIMI, KARAR DEĞİL (tasarım bloğu · 21.285).

          Tasarımın İKİ ayrı hâli var ve ikisi de burada: özet VARSA kesikli çerçeveli blok
          (başlığıyla birlikte), YOKSA yalnız soluk bir cümle. Yokluğa da blok çizmek, olmayan bir
          şeye kartın görünür yerinde yer ayırmaktı.

          Başlık cümlenin kendisi kadar önemli: "karar değil" yazısı olmadan tek cümlelik bir
          makine metni, sinyallerin üstünde bir hüküm gibi okunur. Motorun kendi sistem talimatı da
          karar vermeyi yasaklıyor (`b2bSummaryTask`) — ekran o çizgiyi görünür kılıyor.

          Bekleme hâlinde HİÇBİR ŞEY çizilmiyor: "yükleniyor" iskeleti, kararın dayanağı olmayan
          bir kolaylık için kartı oynatırdı; cümle geldiğinde zaten yerine oturuyor.
        */}
        {check.summary.kind === 'pending' ? null : check.summary.kind === 'ready' ? (
          <View style={styles.summaryBox} testID="management-b2b-summary">
            <Text style={styles.summaryTitle}>{t.b2b.summary}</Text>
            <Text style={styles.summaryText}>{check.summary.summary}</Text>
          </View>
        ) : (
          <Text style={styles.footnote} testID="management-b2b-summary">
            {t.b2b.summaryEmpty}
          </Text>
        )}

        {karari ? (
          <Text style={styles.footnote} testID="management-b2b-decided">
            {t.b2b.decided}
          </Text>
        ) : null}

        {/*
          "MASADA DEVAM ET" DÜĞME DEĞİL CÜMLE — talep ekranının 07.09'daki kararının aynısı.

          Tasarımda düğme ve prototipte karar kutusuna dönüyor (`go.karar`), yani "masa"ya açılan
          bir kapı yok. Mobilde de yok: dokunulacakmış gibi duran ama hiçbir şey yapmayan bir kutu,
          bölümün sınırını anlatmaz — YALANLAR. Bölüm kuralı (*"her ekran masada devam et
          diyebilmeli"*) sınırı söylemeyi ister, sahte bir düğme koymayı değil.
        */}
        <Text style={styles.footnote} testID="management-b2b-desk">
          {t.b2b.desk}
        </Text>

        {/* KARARIN AKIBETİ SATIRDA — bayat karar sessizce yutulmuyor. */}
        {outcome === null || outcome.kind === 'sending' ? null : (
          <Text style={styles.outcome} testID="management-b2b-outcome">
            {outcome.kind === 'stale'
              ? fillCopy(t.b2b.stale, { status: t.b2b.status[outcome.status] })
              : outcome.kind === 'not_found'
                ? t.b2b.notFound.body
                : outcome.kind === 'failed'
                  ? t.common.error.title
                  : outcome.status === 'approved'
                    ? t.b2b.approved
                    : t.b2b.rejected}
          </Text>
        )}
      </OperationsScreenScroll>

      {/*
        EYLEMLER SAYFAYA YAPIŞIK (tasarım `position:sticky;bottom:0`) — bir tur akışın içindeydi
        ve cihazda ölçülen kusur şuydu: kart uzun, düğmeler en altta, yani operatör karar vermek
        için önce SONA KADAR kaydırmak zorundaydı. Kararın kapısı hep görünür durmalı.

        Çubuk kitten (`OperationsStickyBar`, 11 ekranın ortak şeridi); yüksekliği ÖLÇÜLÜP listenin
        alt dolgusuna veriliyor, formülle tahmin edilmiyor — çubuk mutlak konumlu ve son satırı
        örterdi (kitin künyesi).

        IŞIMA ÖLÇÜMDEN: v3'te bu gölge (`0 4px 14px` zeytin) dokuz yerde geçiyor ve dokuzuncusu
        tam olarak bu düğme — "Onayla — toptan fiyatı aç" (tasarım satır 3247). Kitin ışıma künyesi
        onu *okutma* düğmesinin imzası diye yazıyor; ölçüm daha geniş söylüyor: ışıma, EKRANIN TEK
        BAĞLAYICI eylemi zeytin dolguluysa onun. Bu ekranda o eylem onaydır. Ret ışımaz.
      */}
      {karari ? null : (
        <OperationsStickyBar onHeight={setBarHeight} testID="management-b2b-actions">
          <PrimaryButton
            label={t.b2b.approve}
            icon="check"
            elevation="glow"
            onPress={check.approve}
            disabled={outcome?.kind === 'sending'}
            testID="management-b2b-approve"
          />
          <SecondaryButton
            label={t.b2b.reject}
            elevation="flat"
            onPress={() => setRejectOpen(true)}
            disabled={outcome?.kind === 'sending'}
            testID="management-b2b-reject"
          />
          <Text style={styles.footnote}>{t.b2b.actionsNote}</Text>
        </OperationsStickyBar>
      )}

      {/* RET ÇEKMECESİ — sebep zorunlu; boş sebeple düğme açılmıyor (uç da reddeder). */}
      <BottomSheet visible={rejectOpen} title={t.b2b.rejectTitle} onClose={() => setRejectOpen(false)} testID="management-b2b-reject-sheet">
        <Text style={styles.sectionNote}>{t.b2b.rejectHint}</Text>
        <TextField
          value={reason}
          onChangeText={setReason}
          placeholder={t.b2b.rejectPlaceholder}
          accessibilityLabel={t.b2b.rejectTitle}
          testID="management-b2b-reject-reason"
        />
        <PrimaryButton
          label={t.b2b.rejectConfirm}
          elevation="flat"
          disabled={reason.trim().length === 0}
          onPress={() => {
            setRejectOpen(false);
            check.reject(reason.trim());
            setReason('');
          }}
          testID="management-b2b-reject-confirm"
        />
        <SecondaryButton
          label={t.b2b.cancel}
          elevation="flat"
          onPress={() => setRejectOpen(false)}
          testID="management-b2b-reject-cancel"
        />
      </BottomSheet>
    </View>
  );
}

export type B2bCheck = NonNullable<B2bCheckResponse['check']>;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  block: { paddingTop: operationsTheme.space['7xl'], paddingHorizontal: operationsTheme.space['6xl'] },
  /*
    BAŞLIK GÖVDENİN YATAY DOLGUSUNU YEMEZ (kullanıcı bulgusu 08.09).

    `OperationsStackHeader`ın KENDİ dolgusu var ve tasarımın ölçüsü o: sayfa kenarı 20
    (`stack-header` künyesi, v3 ölçümü). Ama hazır dalda başlık kaydırıcının gövdesinin İÇİNDE
    duruyor ve gövdenin dolgusu (22) onun üstüne biniyordu → 42. Yükleme/hata/boş dallarında ise
    gövde yok, başlık kendi 20'sinde kalıyordu.

    Sonucu cihazda ölçüldü (Oppo CPH1907, ölçek 2,55): geri düğmesinin kenarı düzeltme öncesi
    107 px = **42 birim** (20 + 22), sonrasında 51 px = **20 birim**. Fark tam olarak gövdenin
    yatay dolgusu. Ters işaretli kenar boşluğu onu geri alıyor — başlık her hâlde tasarımın
    20'sinde, ve iki hâl arasında yer değiştiren bir şey kalmıyor.
  */
  headBleed: { marginHorizontal: -operationsTheme.space['6xl'] },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  card: { gap: operationsTheme.space.sm },
  /* ŞERİT — tasarımın ölçüleri: 9 px nokta, 1.5 px kenar, tonun soluk zemini. */
  flagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.lg,
  },
  flagDot: { width: 9, height: 9, borderRadius: 4.5 },
  flagText: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['snug--line-height'],
  },
  identity: { gap: operationsTheme.space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: operationsTheme.space.md },
  /* AD BAŞLIK FONTUYLA (tasarım `Lora 600/23`): ekranın öznesi bu ve gövde fontunda yazınca
     sinyal satırlarıyla aynı ağırlıkta okunuyordu. */
  name: {
    flex: 1,
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    lineHeight: operationsTheme.text['h2-sm'] * operationsTheme.text['snug--line-height'],
    color: operationsTheme.colors.ink,
  },
  legal: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.note, color: operationsTheme.colors.body },
  idBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.lg,
  },
  idBoxBody: { flex: 1, gap: operationsTheme.space['2xs'] },
  idLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    letterSpacing: 1.2,
    color: operationsTheme.colors.muted,
  },
  idValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  idSource: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /* ÜLKE ÇİPİ ÇERÇEVELİ, DOLGUSUZ — tasarımın kararı: ülke bir durum değil bir künye. */
  countryChip: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    letterSpacing: 0.9,
    color: operationsTheme.colors.ink,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.md,
  },
  tiles: { flexDirection: 'row', gap: operationsTheme.space.sm },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    minHeight: operationsTheme.size.controlMd,
    paddingHorizontal: operationsTheme.space.md,
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
  },
  tileText: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.ink,
  },
  meta: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.note, color: operationsTheme.colors.body },
  sectionTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    letterSpacing: 1,
    color: operationsTheme.colors.ink,
  },
  sectionNote: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.micro, color: operationsTheme.colors.muted },
  /* Izgaranın kendi kabı: kartın `gap`i buraya İŞLEMESİN — satırlar ayraçla ayrılıyor. */
  signals: { marginTop: operationsTheme.space['2xs'] },
  /*
    Satır yüksekliğini DOLGU kuruyor, dokunma hedefi değil (kullanıcı bulgusu 07.09).

    Bir tur `size.controlSm` (46) verilmişti; o durak "arama kutusu, hap kontrol" içindir, yani
    BASILABİLİR öğenin asgarisi. Bu satır basılamaz — okunur. Dokunma ölçüsünü okuma ızgarasına
    uygulamak altı satırı gereksiz yere yayıyordu ve göz karşılaştırmak için kaydırmak zorunda
    kalıyordu; oysa ızgaranın işi tek bakışta karşılaştırılmak.

    Ayraç `sand-300`: token dosyasının künyesinde "satır ayracı / ince hat" rolü bu durakta.
  */
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.lg,
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['sand-300'],
  },
  signalLabel: { flex: 1, fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.note, color: operationsTheme.colors.body },
  signalValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
    textAlign: 'right',
  },
  signalChip: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  signalChipText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  /* KESİKLİ ÇERÇEVE (tasarım `1.5px dashed`) — kartların düz kenarından ayrı duruyor ve ayrım
     kasıtlı: buradaki metin ölçülmüş bir veri değil, makinenin okuma yardımı. */
  summaryBox: {
    gap: operationsTheme.space.xs,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.lg,
  },
  summaryTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    letterSpacing: 1.2,
    color: operationsTheme.colors.muted,
  },
  summaryText: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  outcome: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['olive-dark'],
  },
});
