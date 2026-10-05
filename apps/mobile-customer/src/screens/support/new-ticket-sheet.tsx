import { MAX_ATTACHMENTS_PER_MESSAGE, asksForItems } from '@lezzet/domain-core';
import type { LocalizedCopy, Locale } from '@lezzet/i18n';
import { TicketTypeEnum, type TicketType } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { createTicket, type TicketOpenInput } from '@/lib/api/tickets';
import { useOrders } from '@/screens/orders/use-orders.hook';
import { OrderLinePicker } from './order-line-picker';
import { OrderPicker } from './order-picker';
import { TicketPhotoThumb } from './ticket-photo-thumb';
import { useTicketPhotos, type TicketPhotoFailure } from './use-ticket-photos.hook';
import messages from '@lezzet/i18n/customer/support';

/*
  Yeni talep, taleplerin listesinin çekmecesidir: talep yazmak listenin içinden yapılan bir eylemdir ve adımlar (kapsam → sipariş →
  konu ve anlatım) sayfa değiştirmeden çekmecenin içinde ilerler. Ret çekmeceyi kapatmaz, çünkü kapanan çekmece "gitti" der ve yazılanı götürür.
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
  /** Talep açıldı; çekmeceyi kapatıp yazışmayı açmak çağıranın işi, çünkü liste kendi verisinin sahibi. */
  onCreated: (ticketId: string) => void;
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
  const [showError, setShowError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [photoError, setPhotoError] = useState<TicketPhotoFailure | null>(null);
  const photos = useTicketPhotos({ onFailed: setPhotoError });
  const uploading = photos.pending.length > 0;

  const pickPhoto = (source: 'camera' | 'library') => {
    // Yeni bir deneme eski reddi düşürür: kapanmış bir kapının uyarısı ekranda durmaz.
    setPhotoError(null);
    void photos.pick(source);
  };

  const toggleLine = (id: string) =>
    setOrderItemIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const pickType = (option: TicketType) => {
    setType(option);
    // Ürünle ilgisi olmayan konuya geçilince işaretler düşer: görünmeyen bir seçim talebe girip operatörü yanıltmasın.
    if (!asksForItems(option)) setOrderItemIds([]);
  };

  const goGeneral = () => {
    setReference(null);
    setOrderItemIds([]);
    setStep('form');
  };

  /* Kapsam sorusu ancak seçilecek bir sipariş varken sorulur; liste okunamazsa yine sorulur, çünkü "bilmiyoruz" ile "yok" ayrı
     şeydir. Siparişten gelindiğinde kapsam belli olduğu için liste hiç okunmaz. */
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

  /* Siparişsiz talepte konu sorulmaz ve `other` gider, çünkü "Soru" bizim yapmadığımız bir iddiadır; seçilmeyen konu da oraya düşer. */
  const resolvedType: TicketType = reference === null ? 'other' : (type ?? 'other');

  const submit = () => {
    if (submitting || uploading) return;
    // Anlatım zorunlu: sözleşme boş gövdeyi reddeder ve müşteri adına cümle uydurmak operatöre bir şey anlatmazdı.
    if (body.trim().length === 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setSubmitError(null);
    setSubmitting(true);

    const attachments = photos.photos.map((photo) => photo.key);
    /* Gövde SÖZLEŞMENİN girdi tipiyle yazılır (`z.input<TicketOpenSchema>`): alan adı değişirse
       ekran derlemede kırılır, çalışma zamanında 400 ile değil. */
    const payload: TicketOpenInput = {
      type: resolvedType,
      body: body.trim(),
      orderReference: reference,
      // Kalem kimlikleri YALNIZ siparişli talepte gider: gövdesi tutarsız istek
      // (`items_without_order`) ucun reddidir ve buraya gelmemeli — kapı ekranda da duruyor.
      ...(reference === null || orderItemIds.length === 0 ? {} : { orderItemIds }),
      // Fotoğraf yoksa alan hiç gitmez: boş bir dizi, var olmayan bir eki anlatmaya kalkardı.
      ...(attachments.length === 0 ? {} : { attachments }),
    };

    void createTicket(payload).then((result) => {
      setSubmitting(false);
      if (result.error !== null) {
        setSubmitError(SUBMIT_ERRORS[result.error] ?? 'generic');
        return;
      }
      onCreated(result.data.id);
    });
  };

  return (
    <BottomSheet visible title={t.new.title} onClose={onClose} testID="new-ticket-sheet">
      {/* Kaydırma kitin `BottomSheet`inde, çünkü bu form panelin tavanını aşabiliyor; burada yalnız içeriğin dikey düzeni var. */}
      <View style={styles.content} testID="new-ticket-form">
        {backStep === null ? null : (
          <TextAction label={t.back} onPress={() => setStep(backStep)} testID="new-ticket-back" />
        )}

        {/* Kapsam sorusunun cevabı henüz bilinmiyor: soru da, form da çizilmez — yanlış adımı
            gösterip bir an sonra değiştirmek, müşterinin gözünde ekranın zıplaması olurdu. */}
        {resolvedStep === 'scope' && orderList.status === 'loading' ? (
          /* Halka yerine adımın kendisi bekler, çünkü gelecek olan soru ve iki düğmedir; çekmece cevap gelince uzamaz. */
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
            {/* Önce konu, sonra ürün: ürün sorusu yalnız belli bir kaleme dair konuda anlamlı, öteki konularda hiç sorulmaz. */}
            {reference === null ? null : (
              <>
                <Text style={styles.eyebrow}>{t.new.items.eyebrow.replace('{reference}', reference)}</Text>
                <Text style={styles.question} accessibilityRole="header">
                  {t.new.typeTitle}
                </Text>
                <View style={styles.typeRow}>
                  {TicketTypeEnum.options.map((option) => (
                    <Chip
                      key={option}
                      label={t.type[option]}
                      selected={type === option}
                      onPress={() => pickType(option)}
                      testID={`new-ticket-type-${option}`}
                    />
                  ))}
                </View>

                {asksForItems(type) ? (
                  <OrderLinePicker reference={reference} locale={locale} t={t} selected={orderItemIds} onToggle={toggleLine} />
                ) : null}
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

            {/* Önce eklenenler, sonra iki kaynak: tasarım kamerayı ister, fotoğraf çoğu zaman da önceden çekilmiştir. Yükleme sürerken
                Gönder kilitli, ki yarım fotoğraf talebe girmesin. */}
            {photos.photos.length + photos.pending.length === 0 ? null : (
              <View style={styles.photoRow} testID="new-ticket-photos">
                {photos.photos.map((photo, index) => (
                  <TicketPhotoThumb
                    key={photo.key}
                    uri={photo.uri}
                    size="lg"
                    onRemove={() => photos.remove(photo.key)}
                    label={t.detail.photo}
                    removeLabel={t.new.photo.remove}
                    testID={`new-ticket-photo-${index}`}
                    removeTestID={`new-ticket-photo-remove-${index}`}
                  />
                ))}
                {photos.pending.map((item) => (
                  <TicketPhotoThumb
                    key={item.id}
                    uri={item.uri}
                    size="lg"
                    label={t.new.photo.uploading}
                    removeLabel={t.new.photo.remove}
                    testID="new-ticket-photo-pending"
                  />
                ))}
              </View>
            )}
            {photos.photos.length === 0 ? null : (
              <Text style={styles.note} testID="new-ticket-photo-count">
                {t.new.photo.count
                  .replace('{count}', String(photos.photos.length))
                  .replace('{max}', String(MAX_ATTACHMENTS_PER_MESSAGE))}
              </Text>
            )}
            {/* Tavan dolunca kaynaklar çizilmez; sayaç neden olduğunu zaten söylüyor. */}
            {photos.remaining <= 0 ? null : (
              <View style={styles.photoActions}>
                <PressableSurface
                  onPress={() => pickPhoto('camera')}
                  feedback="opacity"
                  disabled={submitting}
                  grow
                  style={styles.photoBox}
                  accessibilityLabel={t.new.photo.camera}
                  testID="new-ticket-photo-camera"
                >
                  <Text style={styles.photoLabel}>{t.new.photo.camera}</Text>
                </PressableSurface>
                <PressableSurface
                  onPress={() => pickPhoto('library')}
                  feedback="opacity"
                  disabled={submitting}
                  grow
                  style={styles.photoBox}
                  accessibilityLabel={t.new.photo.library}
                  testID="new-ticket-photo-library"
                >
                  <Text style={styles.photoLabel}>{t.new.photo.library}</Text>
                </PressableSurface>
              </View>
            )}
            {photoError === null ? null : (
              <Note description={t.new.photo.errors[photoError]} tone="error" testID="new-ticket-photo-error" />
            )}
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
              disabled={submitting || uploading}
              testID="new-ticket-submit"
            />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.space['2xl'] },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
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
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  photoActions: {
    flexDirection: 'row',
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
    paddingHorizontal: theme.space.md,
  },
  photoLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
    textAlign: 'center',
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },
}));
