import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from '@/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
import { addressLine, addressTitle } from '@/screens/customer-kit/address-format';
// Yalnız METİN BLOĞUNUN TİPİ için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from './messages.json';

/*
  ADRES KARTI — "etiket · rol rozeti · adres satırı · rol eylemi · Düzenle" (v3:859-866).

  ROLÜN ADI "TESLİMAT ADRESİ", "VARSAYILAN" DEĞİL (kullanıcı kararı 08.09): *"varsayılan"* bir
  MEKANİZMANIN adıdır (bir alanın önceden dolu gelmesi), rolün adı değil. Müşterinin gördüğü şey
  bir roldür — bu adres siparişte teslimat için önden seçilir. Web hesap sayfası aynı gün aynı
  kelimeye geçti; iki yüzey aynı rolü iki adla anmamalı. Ödeme ekranının rozeti BİLEREK
  "varsayılan" kaldı ve web'de de öyle: başlığı zaten "Teslimat adresi" olan bir listede
  "teslimat adresi" rozeti kendini tekrar ederdi.
  Veri artık SÖZLEŞMEDEN (`MeAddress`, 21.15) — fixture tipi kalktı; kart, uçların döndürdüğünü çizer.

  METİNLER TEK BLOK HÂLİNDE GEÇER (`copy`): çağıran sözlüğün (`account/messages.json`) `addresses`
  bölümünü okuyor; beş ayrı metin prop'u yerine bloğun kendisi geçince yeni bir metin eklendiğinde
  imza değişmez. Tip de o bloktan TÜRER, elle yazılmaz.

  ROL EYLEMİ yalnız o rolü TAŞIMAYAN kartta çıkar (şablonun kendi kuralı) — teslimat adresini
  teslimat adresi yapan bir düğme, basılınca hiçbir şey yapmayan bir düğmedir. Aynısı faturada.

  EYLEM ETİKETİ MOBİLDE KISA ("teslimat adresi yap" · "fatura adresi yap"), web'de cümle
  ("Teslimat adresim yap"). Ayrım bilinçli: tasarımda eylemler satırda `flex:none` duruyor, yani
  KISALMIYORLAR — uzayan etiket adres satırını ezer. Ortak olması gereken şey rolün ADI, eylemin
  cümlesi değil; iki yüzey de "teslimat adresi" ve "fatura adresi" diyor.
*/

type AddressCopy = LocalizedCopy<typeof accountMessages>['addresses'];

interface AddressCardProps {
  address: MeAddress;
  copy: AddressCopy;
  onMakeDefault: () => void;
  /**
   * **FATURA ADRESİ YAP** (kullanıcı kararı 08.09) — `null` ise bu kart fatura rolünü hiç
   * göstermez. Bireysel hesapta bu kavramın karşılığı yok ve gösterilmesi, müşteriye cevabı
   * olmayan bir soru sormak olurdu; ayrım çağıranda (`type === 'company'`).
   */
  onMakeBilling: (() => void) | null;
  /** Düzenleme kapısı — v3 kartının "Düzenle" ucu; çekmeceyi dolu açar. */
  onEdit: () => void;
  testID?: string;
}

export function AddressCard({ address, copy, onMakeDefault, onMakeBilling, onEdit, testID }: AddressCardProps) {
  /* İki rol AYRI rozet: bir adres ikisi birden olabilir ve çoğu işletmede öyledir. Tek bir rozete
     indirseydik ("Varsayılan · Fatura") müşteri hangi rolü kaldırdığını göremezdi. */
  const faturaGoster = onMakeBilling !== null;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.text}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{addressTitle(address)}</Text>
          {address.isDefault ? <Text style={styles.defaultBadge}>{copy.default}</Text> : null}
          {faturaGoster && address.isBilling ? <Text style={styles.billingBadge}>{copy.billing}</Text> : null}
        </View>
        <Text style={styles.line}>{addressLine(address)}</Text>
      </View>
      {address.isDefault ? null : (
        <TextAction
          label={copy.makeDefault}
          onPress={onMakeDefault}
          accessibilityHint={copy.makeDefaultLabel.replace('{label}', addressTitle(address))}
          testID={testID === undefined ? undefined : `${testID}-default`}
        />
      )}
      {faturaGoster && !address.isBilling ? (
        <TextAction
          label={copy.makeBilling}
          onPress={onMakeBilling}
          accessibilityHint={copy.makeBillingLabel.replace('{label}', addressTitle(address))}
          testID={testID === undefined ? undefined : `${testID}-billing`}
        />
      ) : null}
      <TextAction
        label={copy.edit}
        onPress={onEdit}
        accessibilityHint={copy.editLabel.replace('{label}', addressTitle(address))}
        testID={testID === undefined ? undefined : `${testID}-edit`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Kartın KENDİ zemini yok (kullanıcı kararı 09.08): satırlar hesap ekranının adres PANELİNİN
     içinde yaşıyor ve panel zaten `sand-250` — iki aynı ton üst üste gelince sınır okunmuyordu.
     Ayrım artık panelin kesikli satır ayracında; kart yalnız satırın kendi düzenini kurar. */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  text: { flex: 1, gap: theme.space['2xs'] },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  /* FATURA ROZETİ AYRI TONDA — aynı tonu paylaşsalardı yan yana duran iki rozet tek bir şey gibi
     okunurdu. Zeytin "teslimat", kum "künye": renk ayrımı rolün ayrımını taşıyor, ama etiket de
     yazılı (renk tek başına anlam taşımaz). */
  billingBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors.ink,
    backgroundColor: theme.colors['sand-300'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  line: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
