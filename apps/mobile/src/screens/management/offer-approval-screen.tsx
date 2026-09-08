import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Chip } from '@/components/ui/chip';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { centsToAmountText, money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy, operationsCopy, operationsFailureText } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { OfferCandidate } from '@lezzet/types';
import { managementCopy } from './copy';
import { useOfferApproval } from './use-offer-approval.hook';

/*
  Y3 · YAKIN-SKT TEKLİFİ (Operasyon Mobil v3:30) — aday partiler burada teklife dönüşür.

  ── v3 SATIRI KARTA ÇEVİRDİ, EKRANI DEĞİL ───────────────────────────────────
  v3 bu ekranı TEK partinin künye kartı gibi çiziyor: dört ölçüm alt alta (kalan adet · kalan ömür ·
  liste fiyatı · önerilen), altında iki karar düğmesi. Kart dili birebir uygulandı; ama ekran TEKİL
  hâle GETİRİLMEDİ ve bu ölçülmüş bir karar: uç bir LİSTE döndürüyor (`/management/offers` →
  `candidates[]`) ve hub da "N aday parti" diyerek buraya gönderiyor. Tek partiye indirseydik, N
  parti için N kez aynı yolculuk gerekirdi — teklif kararı günde bir kez ve TOPLU verilen bir
  karardır. Yani her aday kendi kartını alır, kararlar tek turda toplanır ve tek onayla yazılır.

  ── SÖZLEŞMEDE OLMAYAN İKİ ŞEY YAZILMADI ────────────────────────────────────
  · **"%18 kalan ömür"**: v3 kalan günün yanına raf ömrünün yüzdesini koyuyor. Oranı hesaplamak için
    partinin ÜRETİM tarihi (ya da toplam raf ömrü) gerekir; `OfferCandidate` yalnız `daysLeft`
    taşıyor. Yüzde uydurmak, operatöre ölçülmemiş bir kesinlik satmaktı — kalan gün yazılıyor.
  · ~~**Üç oranlı indirim çipi (%20/%30/%40)**~~ — **08.09'da GELDİ, ama sabit değil TÜREYEN olarak**
    (21.296, kullanıcı kararı). Eski gerekçe şuydu: tasarımın üç sabit oranından ikisi uydurma olur
    ve ayar değişince yalan söylerdi. Gerekçe hâlâ doğru; çözüm oranları SABİTLEMEMEK oldu —
    merdiven motorun kendi oranından türüyor (`P−10 · P · P+10`) ve motorun önerdiği basamak
    "öneri" diye İŞARETLİ. Ayar %30'ken tasarımın tam çipleri çıkıyor; %25'e çekilirse merdiven
    de kayıyor ve hiçbir çip motorun adına konuşmuş olmuyor. Fiyat yine sözleşmenin son sözü
    (`offerPriceCents`): çip fiyatı yazar, operatör üstüne yazabilir.

  ── ÜÇÜNCÜ YOL: LİSTE + ÇEKMECE (21.296, kullanıcı kararı 08.09) ────────────
  Tasarımın ekranı TEK partinin detayıdır; bizimki liste. İkisi karşılaştırıldı ve ikisi de yarım
  çıktı: tasarımın akışı 49 aday için 49 ziyaret demek, bizim listede ise oran seçimi yok —
  telefonda her partiye "0,89" yazmak, orana dokunmaktan pahalı. Kurulan yol ikisinin birleşimi:
  **kartlar listede kalır, karar ÇEKMECEDE verilir.** Çekmece tasarımın detay kartının ta kendisi
  (ölçümler + oran çipleri + dipnot + iki düğme), yalnız ekran değil katman olarak.

  **Toplu düğme DURUYOR ve bu bilinçli:** çekmece bir partiyi hemen yayınlar, alt çubuk ise
  dokunulmamış partileri önerilen oranla toplu açar. Hızlı yol (49'u tek dokunuşta) kaybolmadan
  hassas yol (bu partiye %40) eklenmiş olur — biri ötekinin yerine geçmiyor, ikisi ayrı iş.

  ── İKİ KARAR, İKİSİ DE GERİ ALINABİLİR ─────────────────────────────────────
  · "Teklif verme — imhaya bırak" (v3'ün ikinci düğmesi) partiyi bu turun DIŞINA çıkarır; kart
    solar, üstü çizilir ama SİLİNMEZ — aday listesinde kalır, yarınki turda yeniden önerilir.
    Sunucuya bir şey gitmez: "bugün teklif vermedim" bir yazma değil, bir yazmamadır.
  · Fiyat düzeltilir; motorun önerdiği oran etiketin içinde AYNEN durur — operatör neyi
    değiştirdiğini görür.

  ── BOŞ GİRDİ SIFIR DEĞİLDİR ────────────────────────────────────────────────
  Boş/bozuk fiyat `null` ayrıştırılır (CLAUDE §1) ve satır GÖNDERİLMEZ; CTA onu saymaz. Sıfıra
  düşürmek, bedava satılan bir parti demekti.

  ── AKIBET SATIR SATIR ──────────────────────────────────────────────────────
  DLC kapısı SUNUCUDADIR (web'in `setOfferPriceAction`ı ile aynı motor). Açılamayan parti kartında
  İŞARETLİ kalır, "bir şeyler ters gitti"ye indirgenmez.

  ── İKİNCİL DÜĞMENİN ÇERÇEVESİ `error-line` ─────────────────────────────────
  v3 "imhaya bırak" düğmesini AÇIK kırmızı bir çerçeveyle çiziyor; dolu `error` tonu çerçevede bir
  kademe yüksek sesli kalıyor ve ikincil düğme birincilden daha çok bağırıyordu. Token seti bu
  durağı zaten taşıyor (`error-line`, kırmızı ailenin `olive-line` karşılığı) — yeni durak
  açılmadı, var olan kullanıldı. YAZI rengi `error` kalır: okunması gereken şey çerçeve değil,
  cümlenin kendisi.
*/

const t = managementCopy;

/**
 * İskelet kutusu aday kartının KENDİ ölçüsünden türer (bildirimler emsali): iki dolgu + künye iki
 * satır + üç ölçüm satırı + öneri satırı (kutu yüksekliğinde) + ikincil düğme + iç aralıklar.
 */
const SKELETON_CARD_HEIGHT =
  operationsTheme.space['3xl'] * 2 +
  operationsTheme.space.lg * 5 +
  operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.tag * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.note * operationsTheme.text['lead--line-height'] * 3 +
  operationsTheme.size.controlMd * 2;

export function OfferApprovalScreen() {
  const router = useRouter();
  const approval = useOfferApproval();
  const { state } = approval;
  /** Çekmecenin açtığı parti — `null` = kapalı. Kimlik tutuluyor, nesne değil: liste tazelenince
      künye kendiliğinden yeni satırdan gelir, elde eskimiş bir kopya kalmaz. */
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetCandidate =
    state.status === 'ready' ? (state.candidates.find((row) => row.stockId === sheetId) ?? null) : null;

  const header = (
    <OperationsStackHeader
      title={t.offer.title}
      subtitle={t.offer.caption}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="management-offer-approval-header"
    />
  );

  return (
    <View style={styles.screen} testID="management-offer-approval">
      {/* Başlık DEĞİŞKEN, çünkü iki yere giriyor (21.178): kaydırılan dalda kabın İÇİNE, öteki
          hâllerde doğrudan ekrana. */}
      {state.status === 'ready' && state.candidates.length > 0 ? null : header}

      {state.status === 'loading' ? (
        /* İLK YÜK İSKELETLE (v3 dili). Bu ekranda fark en büyük: aday listesi 49 parti getiriyor
           ve cihazda ölçüldü (30.08) — halka sekiz saniye boyunca BOŞ bir sayfanın ortasında
           dönüyordu, yani ekran "veri yok" ile "veri geliyor"u aynı biçimde gösteriyordu. */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[SKELETON_CARD_HEIGHT, SKELETON_CARD_HEIGHT, SKELETON_CARD_HEIGHT]}
            label={t.offer.loading}
            testID="management-offer-loading"
          />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={operationsFailureText(state.failure)}
            retry={{ label: t.common.error.retry, onPress: approval.retry }}
            testID="management-offer-error"
          />
        </View>
      ) : state.candidates.length === 0 ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.offer.empty.title}
            description={approval.lastOpenedCount === null ? t.offer.empty.body : t.offer.ctaDone}
            testID="management-offer-empty"
          />
        </View>
      ) : (
        <>
          {/* AŞAĞI ÇEKİNCE YENİLE: aday listesi partilerin SKT'sinden türüyor ve gün içinde
              değişiyor; kabın kendi `refresh` desteği kullanıldı (`FormScroll` künyesi). */}
          {/* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178) — `FormScroll` sarılamadığı için KROM kapısı. */}
          <OperationsScreenChrome title={t.offer.title} caption={operationsCopy.sections.management.tab}>
            {(bind) => (
          <FormScroll
            {...bind}
            contentContainerStyle={styles.body}
            refresh={{ onRefresh: approval.refresh, refreshing: approval.reloading }}
            testID="management-offer-approval-body"
          >
            <OperationsHeadBleed pad="5xl" padTop="sm">
              {header}
            </OperationsHeadBleed>
            {state.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.stockId}
                candidate={candidate}
                approval={approval}
                onOffer={setSheetId}
              />
            ))}
            {approval.lastOpenedCount !== null && Object.keys(approval.failures).length > 0 ? (
              <Text style={styles.partialNote} testID="management-offer-partial">
                {fillCopy(t.offer.partialNote, {
                  ok: String(approval.lastOpenedCount),
                  failed: String(Object.keys(approval.failures).length),
                })}
              </Text>
            ) : null}
            {/* v3'ün dipnotu (teklifin ömrü) + v2'den kalan "çıkarılan parti kaybolmaz" sözü:
                ikisi de operatörün "bu düğmeye basarsam ne olur" sorusunun parçası. */}
            <Text style={styles.footnote}>{t.offer.publishNote}</Text>
            <Text style={styles.footnote}>{t.offer.footnote}</Text>
          </FormScroll>
            )}
          </OperationsScreenChrome>

          {/* Yapışkan çubuk KİTTEN (`OperationsStickyBar`): gradyan + mutlak konum + dolgular 11
              ekranda elle yazılıyordu. `glow` VERİLMEDİ — ışıma bir OKUTMA işaretidir (kitin
              künyesi), toplu onay düğmesinin değil. */}
          <OperationsStickyBar>
            <PressableSurface
              onPress={approval.submit}
              disabled={approval.sending || approval.openableCount === 0}
              feedback="shadow"
              style={[styles.cta, approval.sending || approval.openableCount === 0 ? styles.ctaClosed : styles.ctaOpen]}
              accessibilityLabel={ctaLabel(approval.sending, approval.openableCount)}
              testID="management-offer-cta"
            >
              <Text style={styles.ctaLabel}>{ctaLabel(approval.sending, approval.openableCount)}</Text>
            </PressableSurface>
          </OperationsStickyBar>
        </>
      )}

      {/* KARAR KATMANI — tasarımın tek-parti ekranı, çekmece olarak (künye yukarıda).
          Liste tazelenip parti aday olmaktan çıkınca `sheetCandidate` null'a düşer ve çekmece
          kendiliğinden kapanır: yayınlanmış bir partinin künyesi ekranda asılı kalmaz. */}
      <BottomSheet
        visible={sheetCandidate !== null}
        title={t.offer.sheet.title}
        onClose={() => setSheetId(null)}
        testID="management-offer-sheet"
      >
        {sheetCandidate === null ? null : (
          <OfferSheet candidate={sheetCandidate} approval={approval} onClose={() => setSheetId(null)} />
        )}
      </BottomSheet>
    </View>
  );
}

interface OfferSheetProps {
  candidate: OfferCandidate;
  approval: ReturnType<typeof useOfferApproval>;
  onClose: () => void;
}

/**
 * TEKLİF ÇEKMECESİ (21.296) — tasarımın tek-parti ekranının içeriği, katman olarak.
 *
 * Sırası tasarımın sırası: künye · üç ölçüm · ayraç · oran merdiveni · fiyat · dipnot · iki düğme.
 * Fiyat alanı çekmecede DURUYOR (kartta değil): oran bir kestirmedir, son sözü hâlâ rakam söyler
 * ve pazarlıklı bir parti için operatörün elini bağlamak istemedik.
 */
function OfferSheet({ candidate, approval, onClose }: OfferSheetProps) {
  const value = approval.prices[candidate.stockId] ?? '';
  const ladder = rateLadderOf(candidate);
  const gonderiliyor = approval.sendingId === candidate.stockId;
  /* Seçili basamak FİYATTAN türüyor, ayrı bir durumda tutulmuyor: iki kaynak olsaydı operatör
     rakamı elle değiştirdiğinde çip hâlâ eski oranı işaretli gösterirdi — yani ekran, yazılacak
     olandan başka bir şey söylerdi. Elle yazılmış bir rakam hiçbir çipe uymayabilir; o hâlde
     hiçbiri işaretli değildir ve bu doğru cevaptır. */
  const cents = parseAmountToCents(value);
  const seciliOran = ladder.find((rate) => priceForRate(candidate, rate) === cents) ?? null;

  return (
    <View style={styles.sheet} testID="management-offer-sheet-body">
      {/* GÖRSEL + KÜNYE (kullanıcı isteği 08.09) — adlar birbirine çok benziyor ("Limonlu Artisan
          Kek · 90 g" ile "· 9 × 90 g" aynı listede), indirim kararı ise ürüne bakılarak veriliyor.
          Kitin kendi yer tutuculu küçük görseli (`OperationsProductThumb`): görseli olmayan üründe
          baş harfi çizer, uydurma bir resim koymaz. */}
      <View style={styles.sheetHead}>
        <OperationsProductThumb name={candidate.title} photoUri={candidate.imageUrl} size="md" />
        <View style={styles.sheetHeadText}>
          <Text style={styles.sheetTitle}>{candidate.title}</Text>
          <Text style={styles.cardMeta}>
            {fillCopy(t.offer.meta, {
              batch: candidate.lotNumber ?? t.offer.noLot,
              warehouse:
                candidate.warehouse === null ? '' : fillCopy(t.offer.warehousePart, { code: candidate.warehouse.code }),
            })}
          </Text>
        </View>
      </View>

      <DetailRow label={t.offer.rows.qty} value={String(candidate.qty)} />
      <DetailRow label={t.offer.rows.life} value={lifeValueOf(candidate)} watch />
      <DetailRow
        label={t.offer.rows.listPrice}
        value={candidate.listPriceCents === null ? t.offer.noSuggestion : money(candidate.listPriceCents)}
      />

      <View style={styles.divider} />

      {/* YENİ FİYAT ÜSTTE VE BÜYÜK (kullanıcı bulgusu 08.09: *"yeni fiyat görünür bir hâl alsın,
          şu an çok küçük ve anlaşılmıyor"*).

          Sıra ANLAMI izliyor: çekmecenin sonucu FİYATTIR, oran ona giden kestirmedir. Altta ve
          ölçüm satırlarıyla aynı puntoda dururken, kararın kendisi ölçümlerden ayırt edilemiyordu.
          Rakam artık tasarımın büyük Lora sayısı (v3:3062 "15,40 €") ve kutu onu taşıyacak
          genişlikte — yazılabilir olması küçük olmasını gerektirmiyor. */}
      <View style={styles.priceBlock}>
        <Text style={styles.priceBlockLabel}>{t.offer.sheet.newPrice}</Text>
        <View style={styles.priceField}>
          <TextInput
            value={value}
            onChangeText={(next) => approval.setPrice(candidate.stockId, next)}
            keyboardType="decimal-pad"
            accessibilityLabel={fillCopy(t.offer.priceLabel, { name: candidate.title })}
            style={styles.priceInputLarge}
            testID={`management-offer-price-${candidate.stockId}`}
          />
          <Text style={styles.priceCurrencyLarge}>€</Text>
        </View>
      </View>

      {/* ORAN MERDİVENİ — liste fiyatı yoksa hiç çizilmez: hesaplanacak bir şey yok ve boş çipler
          dokunulunca hiçbir şey yapmayan düğmeler olurdu. O hâlde fiyat elle yazılır. */}
      {candidate.listPriceCents === null ? (
        <Text style={styles.sheetNote}>{t.offer.sheet.noListPrice}</Text>
      ) : (
        <>
          <Text style={styles.sheetLabel}>{t.offer.sheet.rate}</Text>
          <View style={styles.rateRow}>
            {ladder.map((rate) => {
              const motorun = rate === Math.round(candidate.offerDiscountPercent);
              const rateCents = priceForRate(candidate, rate);
              return (
                <Chip
                  key={rate}
                  /* Motorun kendi basamağı ETİKETİNDE işaretli: hangi çipin bir ÖNERİ, hangisinin
                     operatörün seçimi olduğu görünmezse merdiven motorun ağzından konuşurdu. */
                  label={fillCopy(motorun ? t.offer.sheet.rateEngine : t.offer.sheet.ratePercent, {
                    percent: String(rate),
                  })}
                  selected={rate === seciliOran}
                  grow
                  onPress={() =>
                    rateCents === null ? undefined : approval.setPrice(candidate.stockId, centsToAmountText(rateCents))
                  }
                  testID={`management-offer-rate-${rate}`}
                />
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.sheetNote}>{t.offer.publishNote}</Text>

      {/* YAYINLA — fiyat okunamıyorsa KAPALI: boş girdi sıfır değildir (CLAUDE §1) ve sıfır,
          bedava satılan parti demekti. */}
      <PressableSurface
        onPress={() => {
          approval.submitOne(candidate.stockId);
          onClose();
        }}
        disabled={gonderiliyor || cents === null}
        feedback="shadow"
        style={[styles.cta, gonderiliyor || cents === null ? styles.ctaClosed : styles.ctaOpen]}
        accessibilityLabel={sheetCtaLabel(gonderiliyor, seciliOran)}
        testID="management-offer-sheet-publish"
      >
        <Text style={styles.ctaLabel}>{sheetCtaLabel(gonderiliyor, seciliOran)}</Text>
      </PressableSurface>

      <PressableSurface
        onPress={() => {
          approval.toggleRemoved(candidate.stockId);
          onClose();
        }}
        feedback="scale"
        style={[styles.secondary, styles.secondaryRemove]}
        accessibilityLabel={t.offer.remove}
        testID="management-offer-sheet-remove"
      >
        <Text style={styles.secondaryLabelRemove}>{t.offer.remove}</Text>
      </PressableSurface>
    </View>
  );
}

/** Çekmecenin yayın düğmesi — oran seçiliyse onu yazar; elle yazılmış rakamda oran İDDİA ETMEZ. */
function sheetCtaLabel(sending: boolean, rate: number | null): string {
  if (sending) return t.offer.ctaSending;
  if (rate === null) return t.offer.sheet.publishCustom;
  return fillCopy(t.offer.sheet.publish, { percent: String(rate) });
}

function ctaLabel(sending: boolean, openableCount: number): string {
  if (sending) return t.offer.ctaSending;
  if (openableCount === 0) return t.offer.ctaEmpty;
  return fillCopy(t.offer.cta, { n: String(openableCount) });
}

interface DetailRowProps {
  label: string;
  value: string;
  /** Terracotta okunan değer — "izle" demektir; kırmızı bir HATA iddiası olurdu. */
  watch?: boolean;
}

function DetailRow({ label, value, watch = false }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, watch ? styles.detailValueWatch : undefined]}>{value}</Text>
    </View>
  );
}

/**
 * "Kalan ömür" satırının değeri — tasarım günü ve YÜZDEYİ yan yana yazıyor (v3:30 · *"2 gün · %18"*).
 *
 * İkisi ayrı şey söyler ve biri ötekinin yerine geçmez: gün ne kadar zaman kaldığını, yüzde partinin
 * ömrünün ne kadarını tükettiğini. Bir haftalık börekte 2 gün normaldir, üç aylık konservede aynı
 * 2 gün alarmdır — motorun eşikleri de bu yüzden günle değil yüzdeyle veriliyor (`shelf-life` künyesi).
 *
 * Yüzde İKİ hâlde yazılmaz:
 * · **Raf ömrü tanımsızsa** motor `null` döner — ölçemedik. "%0" yazmak ölçemediğimizi ölçmüş gibi
 *   gösterirdi (CLAUDE §1).
 * · **Tarih geçmişse** motor yüzdeyi 0'a sabitliyor (`remainingShelfLifePercent` künyesi), yani
 *   "%0" o partide bir ölçüm değil bir sabit; satır zaten hâli söylüyor.
 *
 * NEGATİF GÜN "SÜRESİ GEÇTİ" DEĞİLDİR: listeye yalnız `can_offer` partiler giriyor ve tarihi geçmiş
 * olup da satılabilen tek küme DDM'si (tavsiye edilen tüketim tarihi) geçmiş partilerdir — DLC'si
 * geçen parti imhalıktır ve aday bile sayılmaz (`offerDecisionOf`). Karar kutusundaki kardeş cümleyle
 * aynı kural (`management-hub-screen` → `offerLifeOf`).
 */
function lifeValueOf(candidate: OfferCandidate): string {
  const copy = t.offer.rows;
  if (candidate.daysLeft < 0) return copy.lifeValuePast;

  const days = String(candidate.daysLeft);
  if (candidate.remainingPercent === null) return fillCopy(copy.lifeValue, { days });
  return fillCopy(copy.lifeValueWithPercent, {
    days,
    percent: String(Math.round(candidate.remainingPercent)),
  });
}

interface CandidateCardProps {
  candidate: OfferCandidate;
  approval: ReturnType<typeof useOfferApproval>;
  /** Kartın "Teklif ver"i — kararın verildiği çekmeceyi açar. */
  onOffer: (stockId: string) => void;
}

function CandidateCard({ candidate, approval, onOffer }: CandidateCardProps) {
  const isRemoved = approval.removed[candidate.stockId] === true;
  const failure = approval.failures[candidate.stockId];

  const lifeValue = lifeValueOf(candidate);

  return (
    /* Kabuk kitten (`panel`, `lg` dolgu); ekranda kalan yalnız iç aralık ve "turdan çıkarıldı"
       solgunluğu. */
    <OperationsSurface
      tone="panel"
      style={[styles.card, isRemoved ? styles.cardRemoved : undefined]}
      testID={`management-offer-${candidate.stockId}`}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, isRemoved ? styles.cardTitleRemoved : undefined]}>{candidate.title}</Text>
        <Text style={styles.cardMeta}>
          {fillCopy(t.offer.meta, {
            batch: candidate.lotNumber ?? t.offer.noLot,
            warehouse:
              candidate.warehouse === null ? '' : fillCopy(t.offer.warehousePart, { code: candidate.warehouse.code }),
          })}
        </Text>
      </View>

      <DetailRow label={t.offer.rows.qty} value={String(candidate.qty)} />
      <DetailRow label={t.offer.rows.life} value={lifeValue} watch />
      <DetailRow
        label={t.offer.rows.listPrice}
        value={candidate.listPriceCents === null ? t.offer.noSuggestion : money(candidate.listPriceCents)}
      />

      <View style={styles.divider} />

      {/* FİYAT SATIRI ARTIK OKUNUR, YAZILIR DEĞİL (21.296) — yazma çekmecede.
          Etiket motorun İDDİASINI korur: fiyat motorun önerdiğiyse "Önerilen (%N)" der; operatör
          başka bir oran ya da rakam seçtiyse "Teklif fiyatı"na döner. Tek etiketi bırakıp rakamı
          değiştirmek, motorun ağzından operatörün sayısını söyletmek olurdu. */}
      <View style={styles.detailRow}>
        <Text style={styles.suggestLabel}>
          {motorunSayisiMi(candidate, approval.prices[candidate.stockId] ?? '')
            ? fillCopy(t.offer.rows.suggested, { percent: String(candidate.offerDiscountPercent) })
            : t.offer.rows.chosen}
        </Text>
        {isRemoved ? null : <Text style={styles.suggestValue}>{fiyatMetni(approval, candidate)}</Text>}
      </View>

      {failure === undefined ? null : (
        <Text style={styles.cardFailure} testID={`management-offer-failed-${candidate.stockId}`}>
          {t.offer.failed[failure === 'must_discard' ? 'must_discard' : 'not_found']}
        </Text>
      )}

      {/* İKİ DÜĞME YAN YANA: "Teklif ver" ÇEKMECEYİ açar (yayınlamaz — karar bir katman ötede,
          yanlışlıkla basılan bir düğme fiyat yazmaz), "imhaya bırak" turdan çıkarır. */}
      {isRemoved ? null : (
        <PressableSurface
          onPress={() => onOffer(candidate.stockId)}
          feedback="scale"
          style={styles.cardAction}
          accessibilityLabel={fillCopy(t.offer.sheet.openLabel, { name: candidate.title })}
          testID={`management-offer-open-${candidate.stockId}`}
        >
          <Text style={styles.cardActionLabel}>{t.offer.sheet.open}</Text>
        </PressableSurface>
      )}

      <PressableSurface
        onPress={() => approval.toggleRemoved(candidate.stockId)}
        feedback="scale"
        style={[styles.secondary, isRemoved ? styles.secondaryRestore : styles.secondaryRemove]}
        accessibilityLabel={isRemoved ? t.offer.restore : t.offer.remove}
        testID={`management-offer-toggle-${candidate.stockId}`}
      >
        <Text style={isRemoved ? styles.secondaryLabelRestore : styles.secondaryLabelRemove}>
          {isRemoved ? t.offer.restore : t.offer.remove}
        </Text>
      </PressableSurface>
    </OperationsSurface>
  );
}

/** Karttaki fiyat — okunamayan girdi "—" yazar, SIFIR değil (CLAUDE §1). */
function fiyatMetni(approval: ReturnType<typeof useOfferApproval>, candidate: OfferCandidate): string {
  const cents = parseAmountToCents(approval.prices[candidate.stockId] ?? '');
  return cents === null ? t.offer.noSuggestion : money(cents);
}

/** Ekrandaki rakam motorun önerisinin TA KENDİSİ mi — etiket buna göre kurulur. */
function motorunSayisiMi(candidate: OfferCandidate, value: string): boolean {
  return candidate.suggestedCents !== null && parseAmountToCents(value) === candidate.suggestedCents;
}

/**
 * İNDİRİM MERDİVENİ — motorun kendi oranından TÜREYEN üç basamak (`P−10 · P · P+10`).
 *
 * Tasarım üç sabit oran çiziyor (%20/%30/%40) ve sabitlemek elendi: ayar %25'e çekilse çipler
 * motorun önerdiği oranı hiç içermez, üstelik ikisi motorun adına konuşmuş olurdu. Merdiven
 * türeyince ayar nereye giderse çipler onunla gidiyor ve orta basamak DAİMA motorun önerisi.
 *
 * Sınır dışına taşan basamak DÜŞER: %5'lik bir ayarda "−%5" bir indirim değildir, %95'te "%105"
 * hiç değildir. Kalan basamak sayısı bir ya da iki olabilir — merdiven eksik değil, kısadır.
 */
function rateLadderOf(candidate: OfferCandidate): number[] {
  const p = Math.round(candidate.offerDiscountPercent);
  return [p - 10, p, p + 10].filter((rate) => rate > 0 && rate < 100);
}

/**
 * Bir orana karşılık gelen fiyat. Motorun KENDİ basamağında motorun kendi sayısı kullanılır
 * (`suggestedCents`) — aynı oranı burada yeniden hesaplamak, yuvarlama farkıyla motordan bir
 * kuruş sapan bir "öneri" üretebilirdi. Liste fiyatı yoksa hesap da yok: `null`.
 */
function priceForRate(candidate: OfferCandidate, rate: number): number | null {
  if (rate === Math.round(candidate.offerDiscountPercent) && candidate.suggestedCents !== null) {
    return candidate.suggestedCents;
  }
  if (candidate.listPriceCents === null) return null;
  return Math.round((candidate.listPriceCents * (100 - rate)) / 100);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet listenin kendi kenar boşluğunda durur — kutular kartların yerini tutuyor. */
  skeleton: {
    paddingTop: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    // Yapışkan CTA mutlak konumlu: listenin kuyruğu onun altında kalmasın.
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },

  /* ── Aday kartı (v3:30) ───────────────────────────────────────────────────── */
  card: {
    gap: operationsTheme.space.lg,
  },
  /** Turun dışına çıkarılan kart SOLUR ama durur — "bugün değil" ile "bir daha asla" ayrı şeyler. */
  cardRemoved: {
    opacity: operationsTheme.soldOutOpacity,
  },
  cardHead: {
    gap: operationsTheme.space['2xs'],
  },
  cardTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  cardTitleRemoved: {
    textDecorationLine: 'line-through',
  },
  cardMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  detailLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  detailValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  detailValueWatch: {
    color: operationsTheme.colors.terracotta,
  },
  divider: {
    height: operationsTheme.border.base,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  /** Motorun oranı etiketin İÇİNDE durur — operatör neyin üstüne yazdığını görsün. */
  suggestLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Karttaki okunur fiyat — girdi kutusunun yerini aldı (21.296), ağırlığı aynı kalsın diye
      tasarımın büyük Lora rakamı (v3:3062 "15,40 €"). */
  suggestValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
  },
  /** Çekmecenin SONUÇ bloğu — etiket üstte, rakam altında ve büyük (kullanıcı bulgusu 08.09). */
  priceBlock: {
    gap: operationsTheme.space.sm,
  },
  priceBlockLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /**
   * Kararın rakamı — ölçüm satırlarının puntosunda değil, tasarımın büyük Lora sayısında.
   * Kutu ESNER (`flex: 1`): sabit 72 dp'lik alan iki haneli euro'da rakamı kırpardı ve büyüyen
   * punto o riski büyütür.
   */
  priceInputLarge: {
    flex: 1,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    textAlign: 'right',
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  priceCurrencyLarge: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors['olive-dark'],
  },
  /** Kartın "Teklif ver"i — kararın kapısı; birincil düğme DEĞİL (o alt çubukta), çerçeveli. */
  cardAction: {
    height: operationsTheme.size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  cardActionLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['olive-dark'],
  },

  /* ── Teklif çekmecesi (21.296) ───────────────────────────────────────────── */
  sheet: {
    gap: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /** Metin sütunu esner ve KENDİ İÇİNDE kırpılır — uzun ürün adı görseli itmesin. */
  sheetHeadText: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  sheetLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  sheetNote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  rateRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.sm,
  },
  /* Basamağın kendi stili YOK: çip kitten geliyor (`Chip`, `grow`). Elle yazılmış bir kopyası
     vardı ve cihazda tam da kopya olduğu için bozuktu — `flex` stile yazılınca dış yüzey
     içerik kadar daralıyordu (kitin `grow` künyesi bunu 23.08'de yazmış). */
  /* Küçük fiyat kutusunun stilleri SİLİNDİ (21.296): tek girdi çekmecede ve büyük
     (`priceInputLarge`). Ölü stil bırakmak, bir sonraki okuyana "iki fiyat kutusu var" dedirtirdi. */
  /** Açılamayan partinin sebebi KARTINDA durur — toplu bir hataya indirgenmez. */
  cardFailure: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
  secondary: {
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
  },
  secondaryRemove: {
    borderColor: operationsTheme.colors['error-line'],
  },
  secondaryRestore: {
    borderColor: operationsTheme.colors['olive-line'],
  },
  secondaryLabelRemove: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  secondaryLabelRestore: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  partialNote: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  /* Gölgesiz (v3'te sert gölge yok, ölçüm 30.08). Yapışkan çubuğun kendi ışıması ayrı bir
     karardır ve OKUTMA CTA'sınındır — teklif düğmesi sayfanın üstünde yüzmez, listenin sonudur. */
  ctaOpen: {
    backgroundColor: operationsTheme.colors.olive,
  },
  ctaClosed: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
});
