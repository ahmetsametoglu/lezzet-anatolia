import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { brand } from '@lezzet/brand';
import './globals.css';

export const metadata: Metadata = {
  title: brand.name,
  description: `${brand.name} — donuk Türk gıdası`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={brand.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
