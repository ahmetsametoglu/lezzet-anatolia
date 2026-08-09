import type { ReactElement } from 'react';
import Constants from 'expo-constants';
import { StripeProvider } from '@stripe/stripe-react-native';
import { stripeConfig } from './stripe-config';

/*
  Ödeme sağlayıcısının KÖK bağlantısı — kökte tek satır, gerisi burada.

  Sarmalayıcı var çünkü kararların hiçbiri kabuk kararı değil: hangi anahtar okunur, anahtar
  yoksa ne olur, 3-D Secure penceresi hangi şemayla geri döner, Apple Pay ne zaman açılır. Bunlar
  ödeme kapısının bilgisidir; `_layout.tsx` yalnız "ödeme bu ağacın altında yaşıyor" der.
*/

interface PaymentProviderProps {
  children: ReactElement;
}

/**
 * 3-D Secure doğrulaması uygulamayı bir tarayıcı penceresine çıkarır ve geri dönüşü URL şemasıyla
 * yapar. Şema `app.config.ts`te tanımlı (`scheme: 'lezzetanatolia'`) ve BURADA YENİDEN YAZILMAZ —
 * ikinci nüsha, bir gün şema değiştiğinde 3DS'in sessizce geri dönememesi demekti (müşteri
 * bankasında onaylar, uygulama hiç haberi olmadan beklemede kalır).
 *
 * `scheme` yapılandırmada dizi de olabilir; ilki kanonik olandır.
 */
function appUrlScheme(): string | undefined {
  const scheme = Constants.expoConfig?.scheme;
  return Array.isArray(scheme) ? scheme[0] : (scheme ?? undefined);
}

/**
 * Ödeme sağlayıcısı kabuğu.
 *
 * **Anahtar yoksa ağaç SARMALANMAZ ve uygulama normal açılır:** ödeme yapılandırılmamış bir yerel
 * derlemede katalog gezmek, giriş yapmak, sipariş okumak meşrudur. Düşen tek şey ödeme kartıdır ve
 * onu `presentPayment` adlı bir retle söyler (`configuration_missing`) — burada sessizce boş bir
 * sağlayıcı kurmak, hatayı ödeme anına kadar saklamak olurdu.
 */
export function PaymentProvider({ children }: PaymentProviderProps): ReactElement {
  const config = stripeConfig();
  if (!config.configured) return children;

  return (
    <StripeProvider
      publishableKey={config.publishableKey}
      urlScheme={appUrlScheme()}
      // Apple Pay yalnız KAYITLI ticari kimlikle açılır; kayıtsızken alan hiç verilmez
      // (`stripe-config.ts` künyesi: yarısı açık cüzdan, çalışmayan bir düğmedir).
      {...(config.appleMerchantId ? { merchantIdentifier: config.appleMerchantId } : {})}
    >
      {children}
    </StripeProvider>
  );
}
