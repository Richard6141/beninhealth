import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { RegistreServiceWorker } from "./RegistreServiceWorker";

/**
 * Montserrat pour tout le texte (charte institutionnelle stricte) : titres en
 * 700, sous-titres en 600, corps en 400, libelles de navigation en 600.
 * Remplace l'ancien Roboto, qui ne subsiste nulle part dans l'interface.
 */
const montserrat = Montserrat({
  weight: ["400", "600", "700"],
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

/** Codes, identifiants et coordonnees : chiffres tabulaires (voir .chiffres). */
const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: "Bénin Health Intelligence Platform - Ministère de la Santé",
  description:
    "Plateforme d'intelligence sanitaire du Bénin : suivi, analyse et pilotage des données de santé publique.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a3764",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${montserrat.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // Des extensions de navigateur (gestionnaires de mots de passe, correcteurs
      // orthographiques, etc.) injectent parfois leurs propres attributs sur
      // <html> avant que React n'hydrate (ex. observe en pratique :
      // "data-qb-installed"), ce qui declenche un avertissement d'hydratation
      // qui n'a rien a voir avec notre propre code. suppressHydrationWarning
      // ne desactive que la verification sur CET element precis (pas ses
      // enfants), recommandation officielle de Next.js pour ce cas exact.
      suppressHydrationWarning
    >
      <body className={`${montserrat.className} min-h-full flex flex-col`}>
        <RegistreServiceWorker />
        {children}
      </body>
    </html>
  );
}
