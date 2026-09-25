import type { Metadata, Viewport } from "next";
import { Montserrat, Roboto } from "next/font/google";
import "./globals.css";
import { RegistreServiceWorker } from "./RegistreServiceWorker";

const montserrat = Montserrat({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-montserrat",
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
  fallback: [
    "Inter",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "Bénin Health Intelligence Platform - Ministère de la Santé",
  description:
    "Plateforme d'intelligence sanitaire du Bénin : suivi, analyse et pilotage des données de santé publique.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#00aa55",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${montserrat.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className={`${roboto.className} min-h-full flex flex-col`}>
        <RegistreServiceWorker />
        {children}
      </body>
    </html>
  );
}
