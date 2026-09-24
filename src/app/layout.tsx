import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

const lato = Lato({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  fallback: [
    "Inter",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "Bénin Health Intelligence Platform",
  description:
    "Plateforme d'intelligence sanitaire du Bénin : suivi, analyse et pilotage des données de santé publique.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${lato.variable} h-full antialiased`}>
      <body className={`${lato.className} min-h-full flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
