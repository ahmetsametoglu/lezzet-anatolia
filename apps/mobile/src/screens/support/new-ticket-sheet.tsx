import type { LocalizedCopy, Locale } from '@lezzet/i18n';
import { TicketTypeEnum, type TicketType } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { createTicket, type TicketOpenInput } from '@/lib/api/tickets';
import { useOrders } from '@/screens/orders/use-orders.hook';
import { OrderLinePicker } from './order-line-picker';
import { OrderPicker } from './order-picker';
import messages from './messages.json';

/*
  YENİ TALEP · "BİZE YAZIN" — v3 `vTalepNew`in akışı, **ÇEKMECE olarak** (kullanıcı kararı 09.08).

  ── NEDEN SAYFA DEĞİL ÇEKMECE ───────────────────────────────────────────────
  Şablon bunu ayrı bir sayfa yapıyordu ve hesap menüsünde "Taleplerim" ile "Bize yazın" iki ayrı
  satırdı. Karar ikisini teke indirdi: talep yazmak, taleplerin listesinin İÇİNDEN yapılan bir
  eylemdir — yazılan talep zaten o listeye düşecek. Akışın tamamı (kapsam → sipariş → konu/anlatım)
  çekmecenin içinde ilerler; adımlar arası sayfa geçişi YOKTUR, içerik değişir.

  ── KAPALIYKEN DOĞMAZ ───────────────────────────────────────────────────────
  Çağıran bu komponenti KOŞULLU çizer (liste ekranı). İki kazancı var: her açılış temiz bir
  taslakla başlar (kapatılan yarım form ikinci açılışta karşımıza çıkmaz) ve kapalı bir çekmece
  sipariş listesini çekmek için ağa çıkmaz.

  ── GÖNDERİMDEN SONRA ───────────────────────────────────────────────────────
  Başarıda çekmece kapanır, liste tazelenir ve onay toast'la söylenir — üçünü de ÇAĞIRAN yapar
  (`onCreated`): liste kendi verisinin sahibidir, çekmece onu uzaktan tazeleyemez. RET hâlinde
  çekmece AÇIK kalır ve sebep içeride, gönder düğmesinin üstünde söylenir; kapanan bir çekmece
  müşteriye "gitti" der ve yazdığı metni de götürürdü.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Anlatım ZORUNLU** (v3 kalem işaretini yeterli sayıp gövdeye "(ürünler işaretlendi)" yazıyor).
     Sözleşme boş gövdeyi reddediyor (`body: z.string().min(1)` — "anlatımsız talep, çözülemeyen
     taleptir") ve müşteri adına cümle uydurmak, operatöre hiçbir şey anlatmayan bir talep açmaktır.
     Web müşteri formunun da aynı kapısı var.
  2. **Boş gönderim reddi ALANIN ALTINDA**, toast değil: kuralı alanın kendi hata satırına yazmak
     onu basınca değil, bakınca gösterir (sepet ekranının kupon reddiyle aynı karar).
  3. **Konu çipleri ŞEMADAN türer** (`TicketTypeEnum.options`), elle yazılmaz; sıra şablonun sırası.
     Siparişsiz talepte konu SORULMAZ ve `other` gider (web'in ölçülmüş kararı): "Soru" bizim
     yapmadığımız bir iddiadır — gelen mesaj şikâyet de olabilir, operatör okuyup sınıflandırır.
  4. **Fotoğraf ekleme DEMO** — şablonda da öyle (`photoT` yalnız bir bayrak çeviriyor). Gerçek
     seçici yerel bir modül ister (`expo-image-picker`) ve talep açılış ucu bugün EK KABUL ETMİYOR
     (sözleşme künyesi: "kabul edeceği bir anahtar üretecek uç yok"). İkisi de bu görevin kapsamı
     dışında; ihtiyaç rapor edildi.
  5. **Ucun adlı retleri müşteri cümlesine çevrilir** (şablonda hata hâli yok): sipariş bağlanamadı ·
     oturum kapandı · kalanı. Sessizce başarısız olan bir gönderim, gönderilmemiş bir talepten
     kötüdür.
  6. **Adımlar arasında "Geri"** (şablonda cihazın geri hareketi vardı, burada sayfa yok): çekmecede
     tek çıkış kapatmak olsaydı, yanlış siparişi seçen müşteri baştan başlardı.
  7. **Kapsam sorusu SORULACAK bir şey varken sorulur** (kullanıcı kararı 09.08). Şablon soruyu her
     hâlde soruyordu; siparişi olmayan müşteri "evet, bir siparişimle ilgili" diyebiliyor ve
     karşısında boş liste buluyordu. Tek cevabı olan soru, soru değildir: sipariş yoksa adım
     ATLANIR ve akış doğrudan genel talebe açılır. Bunu bilmek için sipariş listesi ARTIK BURADA
     okunuyor (seçicide değil) — seçici de aynı okumayı kullanır, sayfa iki kez istenmez.
     Liste OKUNAMAZSA soru yine sorulur: "bilmiyoruz" ile "yok" ayrı şeylerdir (CLAUDE §1) ve
     müşterinin siparişini bir ağ arızası yüzünden sessizce elinden almayız.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Akışın üç adımı; çekmece içinde yer değiştirirler. */
type Step = 'scope' | 'order' | 'form';

/** Ucun adlı retleri → sayfanın sözlüğündeki cümle. Tabloda olmayan her şey `generic`. */
type SubmitError = keyof Messages['new']['errors'];

const SUBMIT_ERRORS: Record<string, SubmitError> = {
  order_unavailable: 'order',
  unauthorized: 'guest',
};

interface NewTicketSheetProps {
  locale: Locale;
  /** Sipariş detayından gelindiyse referans — akış doğrudan forma açılır (şablonun kendi kuralı). */
  orderReference?: string;
  onClose: () => void;
  /** Talep açıldı — liste tazelenir, onay basılır, çekmece kapanır (hepsi çağıranın işi). */
  onCreated: () => void;
}

export function NewTicketSheet({ locale, orderReference, onClose, onCreated }: NewTicketSheetProps) {
  // Bekleme dalının satır yüksekliklerini yazı kademelerinden türetir (kapsam adımı).
  const { theme } = useUnistyles();
  const t: Messages = messages[locale];
  const router = useRouter();

  const [step, setStep] = useState<Step>(orderReference === undefined ? 'scope' : 'form');
  const [reference, setReference] = useState<string | null>(orderReference ?? null);
  const [orderItemIds, setOrderItemIds] = useState<string[]>([]);
  const [type, setType] = useState<TicketType | null>(null);
  const [body, setBody] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [showError, setShowError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);

  const toggleLine = (id: string) =>
    setOrderItemIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const goGeneral = () => {
    setReference(null);
    setOrderItemIds([]);
    setStep('form');
  };

  /* Kapsam sorusunun ÖN KOŞULU: seçilebilecek en az bir sipariş. Okuma burada duruyor çünkü karar
     burada veriliyor; sipariş detayından gelindiğinde kapsam zaten belli olduğu için ağa hiç
     çıkılmaz (künye §7). */
  const orderList = useOrders(locale, { enabled: orderReference === undefined });
  const askScope = orderList.status === 'error' || (orderList.status === 'ready' && orderList.orders.length > 0);

  /* ETKİN ADIM: kapsam sorulmayacaksa "scope" hiç çizilmez, akış forma düşer. Durumu `setStep` ile
     zorlamak yerine türetmek, listenin gecikmeli cevabıyla adımın bir kez sıçramasını da önler. */
  const resolvedStep: Step = step === 'scope' && orderList.status !== 'loading' && !askScope ? 'form' : step;

  /* Sipariş detayından gelen akışın geri adımı YOKTUR: kapsam zaten belli, tek çıkış kapatmaktır.
     Sorulmamış bir kapsam adımına da dönülmez (`askScope`). */
  const backStep =
    orderReference !== undefined || resolvedStep === 'scope'
      ? null
      : resolvedStep === 'order'
        ? 'scope'
        : reference === null
          ? askScope
            ? 'scope'
            : null
          : 'order';

  /* Seçilmeyen konu şablonun kendi varsayılanına düşer; siparişsiz talepte konu hiç sorulmaz. */
  const resolvedType: TicketType = reference === null ? 'other' : (type ?? 'other');

  const submit = () => {
    if (submitting) return;
    if (body.trim().length === 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setSubmitError(null);
    setSubmitting(true);

    /* Gövde SÖZLEŞMENİN girdi tipiyle yazılır (`z.input<TicketOpenSchema>`): alan adı değişirse
       ekran derlemede kırılır, çalışma zamanında 400 ile değil. */
    const payload: TicketOpenInput = {
      type: resolvedType,
      body: body.trim(),
      orderReference: reference,
      // Kalem kimlikleri YALNIZ siparişli talepte gider: gövdesi tutarsız istek
      // (`items_without_order`) ucun reddidir ve buraya gelmemeli — kapı ekranda da duruyor.
      ...(reference === null || orderItemIds.length === 0 ? {} : { orderItemIds }),
    };

    void createTicket(payload).then((result) => {
      setSubmitting(false);
      if (result.error !== null) {
        setSubmitError(SUBMIT_ERRORS[result.error] ?? 'generic');
        return;
      }
      onCreated();
    });
  };

  return (
    <BottomSheet visible title={t.new.title} onClose={onClose} testID="new-ticket-sheet">
      {/* İçerik KENDİ kaydırmasını taşır: çekmece paneli ekranın %82'siyle sınırlı ve bu form
          (sipariş listesi + kalemler + anlatım) o sınırı aşabilir — sığmayan adım sessizce
          kırpılırdı. `keyboardShouldPersistTaps`: klavye açıkken gönder düğmesi ilk dokunuşta
          çalışır, önce klavyeyi kapatıp ikinci dokunuş beklemez. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="new-ticket-form"
      >
        {backStep === null ? null : (
          <TextAction label={t.back} onPress={() => setStep(backStep)} testID="new-ticket-back" />
        )}

        {/* Kapsam sorusunun cevabı henüz bilinmiyor: soru da, form da çizilmez — yanlış adımı
            gösterip bir an sonra değiştirmek, müşterinin gözünde ekranın zıplaması olurdu. */}
        {resolvedStep === 'scope' && orderList.status === 'loading' ? (
          /* Halka yerine ADIMIN KENDİSİ bekler (kullanıcı kararı 10.08): burada bekleyen şey bir
             işlem değil, gelecek olan SORU ve iki cevap düğmesi. Halka onların yerini tutmuyordu
             ve çekmece cevap gelince bir anda uzuyordu. Ölçüler adımın kendi stillerinden. */
          <View
            style={styles.content}
            testID="new-ticket-scope-loading"
            accessible
            accessibilityRole="progressbar"
            accessibilityState={{ busy: true }}
          >
            <Skeleton width="72%" height={theme.text['card-title-sm'] * theme.text['h1--line-height']} tone="deep" />
            <Skeleton width="90%" height={theme.text.note * theme.text['lead--line-height']} />
            <Skeleton width="100%" height={theme.size.controlLg} radius="control" tone="deep" />
            <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
          </View>
        ) : null}

        {resolvedStep === 'scope' && orderList.status !== 'loading' ? (
          <>
            <Text style={styles.question} accessibilityRole="header">
              {t.new.scope.question}
            </Text>
            <Text style={styles.body}>{t.new.scope.body}</Text>
            <PrimaryButton label={t.new.scope.yes} onPress={() => setStep('order')} testID="new-ticket-scope-order" />
            <SecondaryButton label={t.new.scope.no} onPress={goGeneral} testID="new-ticket-scope-general" />
          </>
        ) : null}

        {resolvedStep === 'order' ? (
          <>
            <Text style={styles.question} accessibilityRole="header">
              {t.new.order.question}
            </Text>
            <OrderPicker
              locale={locale}
              t={t}
              orders={orderList}
              onPick={(picked) => {
                setReference(picked);
                setOrderItemIds([]);
                setStep('form');
              }}
              onGeneral={goGeneral}
            />
          </>
        ) : null}

        {resolvedStep === 'form' ? (
          <>
            {reference === null ? null : (
              <>
                <OrderLinePicker
                  reference={reference}
                  locale={locale}
                  t={t}
                  selected={orderItemIds}
                  onToggle={toggleLine}
                />

                <Text style={styles.question} accessibilityRole="header">
                  {t.new.typeTitle}
                </Text>
                <View style={styles.typeRow}>
                  {TicketTypeEnum.options.map((option) => (
                    <Chip
                      key={option}
                      label={t.type[option]}
                      selected={type === option}
                      onPress={() => setType(option)}
                      testID={`new-ticket-type-${option}`}
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={styles.question} accessibilityRole="header">
              {t.new.message.title}
            </Text>
            <TextField
              value={body}
              onChangeText={(value) => {
                setBody(value);
                // Yazmaya başlayınca eski ret düşer: kapanmış bir kapının uyarısı ekranda durmaz.
                if (showError) setShowError(false);
              }}
              accessibilityLabel={t.new.message.label}
              placeholder={t.new.message.placeholder}
              multiline
              editable={!submitting}
              errorText={showError ? t.new.message.error : undefined}
              testID="new-ticket-message"
            />

            <PressableSurface
              onPress={() => setPhotoAdded(!photoAdded)}
              feedback="opacity"
              style={styles.photoBox}
              accessibilityLabel={photoAdded ? t.new.photo.added : t.new.photo.add}
              testID="new-ticket-photo"
            >
              <Text style={styles.photoLabel}>{photoAdded ? t.new.photo.added : t.new.photo.add}</Text>
            </PressableSurface>
            <Text style={styles.note}>{t.new.photo.note}</Text>

            {submitError === null ? null : (
              <Note description={t.new.errors[submitError]} tone="error" testID="new-ticket-error" />
            )}
            {/* Oturum kapanmışsa cümle yetmez, kapı da gerekir: çekmece kapanır ve giriş açılır. */}
            {submitError === 'guest' ? (
              <SecondaryButton
                label={t.guest.cta}
                onPress={() => {
                  onClose();
                  router.push('/login');
                }}
                testID="new-ticket-login"
              />
            ) : null}

            <PrimaryButton
              label={submitting ? t.new.submitting : t.new.submit}
              onPress={submit}
              disabled={submitting}
              testID="new-ticket-submit"
            />
          </>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Panel yüksekliği sınırlı; kaydırma alanı kalan boşluğu alır ve İÇERİK KADAR yer kaplar
     (`flexShrink`) — kısa adımlarda çekmece boşuna uzamaz. */
  scroll: { flexShrink: 1 },
  content: { gap: theme.space['2xl'] },
  question: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  photoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-500'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  photoLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },
}));
