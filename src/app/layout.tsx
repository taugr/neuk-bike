import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaInstallPrompt from '@/components/pwa-install-prompt';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const siteUrl = 'https://neuk.bike';
const sitePath = '/';
const siteTitle = 'Edinburgh Cycle Parking';
const siteDescription = 'Find nearby cycle parking spaces across Edinburgh.';
const socialImage = '/og-image.png';
const lightThemeColor = '#0f766e';
const darkThemeColor = '#0f1715';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteTitle,
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: sitePath,
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: sitePath,
    siteName: siteTitle,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: 'Edinburgh Cycle Parking map preview',
      },
    ],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: lightThemeColor },
    { media: '(prefers-color-scheme: dark)', color: darkThemeColor },
  ],
};

const assetBasePath = '';

function assetPath(path: string) {
  return `${assetBasePath}${path}`;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href={assetPath('/site.webmanifest')} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Cycle Parking" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="icon" href={assetPath('/favicon.ico')} sizes="any" />
        <link
          rel="icon"
          href={assetPath('/favicon.svg')}
          type="image/svg+xml"
        />
        <link
          rel="icon"
          href={assetPath('/icon-192.png')}
          sizes="192x192"
          type="image/png"
        />
        <link
          rel="icon"
          href={assetPath('/icon-512.png')}
          sizes="512x512"
          type="image/png"
        />
        <link
          rel="apple-touch-icon"
          href={assetPath('/apple-touch-icon.png')}
          sizes="180x180"
          type="image/png"
        />
      </head>
      <body>
        <PwaInstallPrompt assetBasePath={assetBasePath}>
          {children}
        </PwaInstallPrompt>
      </body>
    </html>
  );
}
