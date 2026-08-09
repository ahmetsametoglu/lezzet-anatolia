import type { LocalizedCopy } from '@lezzet/i18n';
import { TicketTypeEnum, type TicketType } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { ordersFixture, type OrderView } from '@/screens/orders/orders-fixture';
import messages from './messages.json';

/*
  YENİ TALEP · "BİZE YAZIN" (v3 `vTalepNew`) — üç adım: siparişle mi ilgili → hangi sipariş →
  kalemler + konu + anlatım + fotoğraf.

  ── UI-ONLY (21.14 ikinci dilim) ────────────────────────────────────────────
  Talep ucu YOK; gönderim EKRANIN durumunda kalır ve ekranda bir başarı bloğuna döner. Sipariş
  listesi sipariş fixture'ından okunur (ikinci bir demo sipariş kümesi kurmak, iki listenin bir
  gün ayrışması demekti).

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Başarı EKRANDA, toast + liste değil.** Şablon gönderince talepler listesine dönüp toast
     basıyor; toast küresel bir kabuk katmanıdır ve listeye eklenecek bir depo bugün YOK — sessizce
     kaybolan bir gönderim, gönderilmemiş bir talepten kötüdür. Onay bu yüzden ekranda duruyor ve
     ne oluşturulduğunu (konu · kapsam) adıyla söylüyor.
  2. **Boş gönderim reddi ALANIN ALTINDA.** Şablon "Kısa bir açıklama yazın" toast'ı basıyor;
     kuralı alanın kendi hata satırına yazmak onu basınca değil, bakınca gösterir (sepet ekranının
     kupon reddiyle aynı karar).
  3. **Konu çipleri ŞEMADAN türer** (`TicketTypeEnum.options`), elle yazılmaz: yeni bir tür
     açıldığında ekran kendiliğinden öğrenir (CLAUDE §1). Sıra şablonun sırasıdır.
  4. **Fotoğraf ekleme DEMO** — şablonda da öyle (`photoT` yalnız bir bayrak çeviriyor). Gerçek
     seçici yeni bir yerel modül ister (`expo-image-picker`), o da bağımlılık kararıdır ve bu
     görevin kapsamı dışında; ihtiyaç rapor edildi.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Akışın üç adımı + gönderim sonrası. */
type Step = 'scope' | 'order' | 'form' | 'sent';

interface NewTicketScreenProps {
  /** Sipariş detayından gelindiyse referans — akış doğrudan forma açılır (şablonun kendi kuralı). */
  orderReference?: string;
  orders?: OrderView[];
}

export function NewTicketScreen({ orderReference, orders = ordersFixture() }: NewTicketScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [step, setStep] = useState<Step>(orderReference === undefined ? 'scope' : 'form');
  const [reference, setReference] = useState<string | null>(orderReference ?? null);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [type, setType] = useState<TicketType | null>(null);
  const [body, setBody] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [showError, setShowError] = useState(false);

  const order = reference === null ? null : (orders.find((row) => row.reference === reference) ?? null);

  const toggleLine = (id: string) =>
    setLineIds(lineIds.includes(id) ? lineIds.filter((lineId) => lineId !== id) : [...lineIds, id]);

  const submit = () => {
    /* Şablonun kapısı: ya bir açıklama ya işaretlenmiş kalem gerekir — ikisi de yoksa talebin
       anlatacağı bir şey yok demektir. */
    if (body.trim().length === 0 && lineIds.length === 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setStep('sent');
  };

  /* Seçilmeyen konu şablonun kendi varsayılanına düşer: siparişli talep "diğer", siparişsiz
     talep bir sorudur. */
  const resolvedType: TicketType = type ?? (reference === null ? 'question' : 'other');

  const bar = (
    <AppBar
      title={t.new.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="new-ticket-back" />}
      testID="new-ticket-appbar"
    />
  );

  if (step === 'sent') {
    const scope =
      reference === null ? t.list.generalScope : t.list.orderScope.replace('{reference}', reference);

    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<CustomerIcon name="check" size={theme.size.emptyIcon} color={theme.colors['olive-dark']} />}
          title={t.new.sent.title}
          description={`${t.new.sent.body}\n${t.new.sent.summary
            .replace('{type}', t.type[resolvedType])
            .replace('{scope}', scope)}`}
          action={
            <PrimaryButton
              label={t.new.sent.cta}
              shape="pill"
              onPress={() => router.push('/support')}
              testID="new-ticket-sent-cta"
            />
          }
          testID="new-ticket-sent"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="new-ticket-form">
        {step === 'scope' ? (
          <>
            <Text style={styles.question} accessibilityRole="header">
              {t.new.scope.question}
            </Text>
            <Text style={styles.body}>{t.new.scope.body}</Text>
            <PrimaryButton label={t.new.scope.yes} onPress={() => setStep('order')} testID="new-ticket-scope-order" />
            <SecondaryButton
              label={t.new.scope.no}
              onPress={() => {
                setReference(null);
                setStep('form');
              }}
              testID="new-ticket-scope-general"
            />
          </>
        ) : null}

        {step === 'order' ? (
          <>
            <Text style={styles.question} accessibilityRole="header">
              {t.new.order.question}
            </Text>
            {/* Siparişi olmayan müşteri şablonda YOK (demo verisinde hep sipariş var) — ama
                "evet" diyip boş bir liste görmek çıkışsız bir oda olurdu: kapı genel talebe
                açılır ve metin ikinci kez yazılmaz (aynı sorunun "hayır" şıkkı). */}
            {orders.length === 0 ? (
              <>
                <Text style={styles.body}>{t.new.order.none}</Text>
                <SecondaryButton
                  label={t.new.scope.no}
                  onPress={() => {
                    setReference(null);
                    setStep('form');
                  }}
                  testID="new-ticket-order-none"
                />
              </>
            ) : null}
            {orders.map((row) => (
              <PressableSurface
                key={row.reference}
                onPress={() => {
                  setReference(row.reference);
                  setLineIds([]);
                  setStep('form');
                }}
                feedback="opacity"
                style={styles.orderRow}
                accessibilityLabel={t.new.order.pick.replace('{reference}', row.reference)}
                testID={`new-ticket-order-${row.reference}`}
              >
                <Text style={styles.orderReference}>{row.reference}</Text>
                <Text style={styles.orderDate}>{row.placedAtLabel}</Text>
              </PressableSurface>
            ))}
          </>
        ) : null}

        {step === 'form' ? (
          <>
            {order === null ? null : (
              <>
                <Text style={styles.eyebrow}>{t.new.items.eyebrow.replace('{reference}', order.reference)}</Text>
                <Text style={styles.question} accessibilityRole="header">
                  {t.new.items.question}
                </Text>
                {order.lines.map((line) => {
                  const selected = lineIds.includes(line.id);

                  return (
                    <PressableSurface
                      key={line.id}
                      onPress={() => toggleLine(line.id)}
                      feedback="scale-small"
                      selected={selected}
                      style={[styles.lineRow, selected ? styles.lineSelected : styles.lineIdle]}
                      accessibilityLabel={t.new.items.line
                        .replace('{quantity}', String(line.quantity))
                        .replace('{name}', line.name)}
                      testID={`new-ticket-line-${line.id}`}
                    >
                      <Text style={styles.lineLabel}>
                        {t.new.items.line
                          .replace('{quantity}', String(line.quantity))
                          .replace('{name}', line.name)}
                      </Text>
                      {selected ? (
                        <CustomerIcon
                          name="check"
                          size={theme.size.inlineIcon}
                          color={theme.colors['olive-dark']}
                        />
                      ) : null}
                    </PressableSurface>
                  );
                })}

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

            <PrimaryButton label={t.new.submit} onPress={submit} testID="new-ticket-submit" />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['2xl'],
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
  eyebrow: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },

  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  orderReference: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  orderDate: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },

  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
    borderWidth: theme.border.base,
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  lineIdle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors['sand-400'],
  },
  lineSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  lineLabel: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
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
