import type { ConversationSource } from '@lezzet/types';

export const SOURCE_LABELS: Record<ConversationSource, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

export const SOURCE_TINT: Record<ConversationSource, string> = {
  whatsapp: 'border-brand-whatsapp/25 bg-brand-whatsapp/10 text-brand-whatsapp',
  messenger: 'border-brand-messenger/25 bg-brand-messenger/10 text-brand-messenger',
  instagram: 'border-brand-instagram/25 bg-brand-instagram/10 text-brand-instagram',
};

export const SOURCE_SOLID: Record<ConversationSource, string> = {
  whatsapp: 'border-brand-whatsapp bg-brand-whatsapp text-ops-card',
  messenger: 'border-brand-messenger bg-brand-messenger text-ops-card',
  instagram: 'border-brand-instagram bg-brand-instagram text-ops-card',
};

export const SOURCE_DOT: Record<ConversationSource, string> = {
  whatsapp: 'bg-brand-whatsapp',
  messenger: 'bg-brand-messenger',
  instagram: 'bg-brand-instagram',
};
