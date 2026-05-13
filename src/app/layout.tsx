import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import PwaInstallPrompt from "@/components/pwa-install-prompt";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edinburgh Cycle Parking",
  description: "Find nearby cycle parking spaces across Edinburgh.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

const assetBasePath = process.env.GITHUB_PAGES === "true" ? "/edinburgh-cycle-parking" : "";

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
        <link rel="manifest" href={assetPath("/site.webmanifest")} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Cycle Parking" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" href={assetPath("/favicon.ico")} sizes="any" />
        <link rel="icon" href={assetPath("/favicon.svg")} type="image/svg+xml" />
        <link rel="icon" href={assetPath("/icon-192.png")} sizes="192x192" type="image/png" />
        <link rel="icon" href={assetPath("/icon-512.png")} sizes="512x512" type="image/png" />
        <link
          rel="apple-touch-icon"
          href={assetPath("/apple-touch-icon.png")}
          sizes="180x180"
          type="image/png"
        />
      </head>
      <body>
        {children}
        <PwaInstallPrompt assetBasePath={assetBasePath} />
      </body>
    </html>
  );
}
