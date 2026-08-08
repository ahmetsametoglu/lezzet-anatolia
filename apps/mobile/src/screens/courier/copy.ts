import messages from './messages.json';

/*
  KURYE BÖLÜMÜNÜN SÖZLÜĞÜ — tek dilli, dil ekseni YOK.

  Zarfın (`{tr, fr, de}`) neden bilerek olmadığı `screens/operations/copy.ts` künyesinde tek yerde
  yazılı; burada tekrar edilmiyor. Bu dosya o kararın kurye ekranlarındaki uygulamasıdır ve KENDİ
  sözlüğünü taşır: kabuk sözlüğü (`operations/messages.json`) bölüm adlarını ve kabuk metinlerini
  tutar, kurye ekranlarının 120'den fazla dizesini oraya yığmak, kabuğu açan herkesin kurye
  metinlerini de yüklemesi ve dosyanın hangi ekrana ait olduğunun okunamaz hâle gelmesi demekti
  (kolokasyon kuralı: metin, onu kullanan ekranın yanında durur).

  YUVA DOLDURMA (`fillCopy`) KABUKTAN GELİR, YENİDEN YAZILMAZ — aynı `{n}`/`{amount}` şablonu, aynı
  fonksiyon (CLAUDE §1).

  TİP JSON'DAN TÜRER (`typeof messages`), elle interface yazılmaz.
*/

export const courierCopy = messages;
