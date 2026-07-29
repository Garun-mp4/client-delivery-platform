import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { parseProductConfig } from '@garun/config';

import './globals.css';

const product = parseProductConfig();

export const metadata: Metadata = {
  description: 'Рабочее пространство для ведения клиентских веб-проектов.',
  title: product.APP_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main-content">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
