import 'server-only';
import { revolutRefunderWith, type ProviderRefunder } from '@lezzet/application';
import { SOURCES } from '@lezzet/observability';
import { webRevolutClient } from '../revolut';

/**
 * Sağlayıcıya iade: paranın karta fiilen dönmesi. Gövde ortak katmanda (`revolutRefunderWith`); sıra ve başarısızlık davranışı test
 * sahtesiyle sınanır.
 */
export function revolutRefunder(): ProviderRefunder {
  return revolutRefunderWith(webRevolutClient, SOURCES.webAction);
}
