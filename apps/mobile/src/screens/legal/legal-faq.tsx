import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextField } from '@/components/ui/text-field';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import type { LegalQuestionCopy, Messages } from './legal-types';

/*
  SSS DOKUSU — arama + akordeon + çıkış kutusu.

  v3'ün `vStatic`i tek paragraflık bir İSKELETTİR (başlık + gövde); dokuyu web'in çalışan
  karşılığından aldık (`apps/web/components/customer/legal/legal-faq.tsx`) çünkü içerik gerçekte
  dokuz uzun cevap ve hepsini açık çizmek dar ekranda bir metin duvarı demek. Kararlar oradan
  BİREBİR taşındı, yeniden yorumlanmadı:

  1. **Arama İSTEMCİDE süzer.** Soru kümesinin doğal bir tavanı var (operatörün elle kurduğu
     küme — CLAUDE §1'in "sayfalama ölçütü sınırsız büyümek" ayrımı) ve tamamı zaten sözlükte;
     uca sormak elimizdeki veriyi ikinci kez istemek olurdu.
  2. **Soru VE cevap taranır** — ziyaretçi çoğu zaman cevapta geçen kelimeyi arar ("soğuk zincir"),
     sorunun kendi cümlesini değil.
  3. **Aynı anda TEK cevap açık.** Hepsi açık olsaydı "hangi soruyu okuyordum" sorusu doğardı.
  4. **İçine form GÖMÜLMEZ**: cevabı bulunamayan soru talep ekranına yönlendirilir, SSS destek
     talebinin yerine geçirilmez.

  TEK SAPMA — ilk soru KAPALI açılır. Web ilkini açık getiriyor; orada sayfa uzun ve açık cevap
  dokuyu tanıtıyor. Telefonda ekranın yarısını tek bir cevap yiyor ve altındaki sekiz sorunun
  varlığı görünmez oluyordu; kapalı liste önce "neler sorulmuş" sorusunu cevaplıyor.
*/

interface LegalFaqProps {
  questions: readonly LegalQuestionCopy[];
  t: Messages;
  /** Çıkış kutusunun düğmesi — talep ekranına götürür (yol ekranın işi, kutunun değil). */
  onWriteToUs: () => void;
}

export function LegalFaq({ questions, t, onWriteToUs }: LegalFaqProps) {
  const [query, setQuery] = useState('');
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0) return questions;
    return questions.filter((row) => `${row.question} ${row.answer}`.toLocaleLowerCase().includes(needle));
  }, [questions, query]);

  return (
    <View style={styles.container}>
      <TextField
        value={query}
        onChangeText={setQuery}
        accessibilityLabel={t.searchPlaceholder}
        placeholder={t.searchPlaceholder}
        shape="pill"
        testID="legal-faq-search"
      />

      {matches.length === 0 ? <Text style={styles.noMatch}>{t.noMatch}</Text> : null}

      <View style={styles.list}>
        {matches.map((row) => {
          const open = openQuestion === row.question;

          return (
            <View key={row.question} style={styles.item}>
              <PressableSurface
                onPress={() => setOpenQuestion(open ? null : row.question)}
                feedback="opacity"
                style={styles.head}
                selected={open}
                accessibilityLabel={row.question}
                testID={`legal-faq-question-${row.question}`}
              >
                <Text style={styles.question}>{row.question}</Text>
                {/* Kitte açılır-kapanır işareti (chevron) YOK; artı/eksi glifi ekranın kendi
                    kararı — hesap ekranının "＋ Yeni" glifiyle aynı aile. İhtiyaç raporlandı. */}
                <Text style={styles.marker} accessibilityElementsHidden importantForAccessibility="no">
                  {open ? '−' : '＋'}
                </Text>
              </PressableSurface>
              {open ? <Text style={styles.answer}>{row.answer}</Text> : null}
            </View>
          );
        })}
      </View>

      <DashedInvite
        title={t.notFoundTitle}
        layout="stack"
        action={<SecondaryButton label={t.notFoundCta} onPress={onWriteToUs} tone="olive" testID="legal-faq-write" />}
        testID="legal-faq-exit"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space['5xl'],
  },
  noMatch: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  list: {
    gap: theme.space.lg,
  },
  item: {
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.xl,
  },
  question: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },
  marker: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.step,
    color: theme.colors.olive,
  },
  answer: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
}));
