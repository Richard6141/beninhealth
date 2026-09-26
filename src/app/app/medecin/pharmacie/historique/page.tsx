import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { listerDelivrancesEtablissement } from "@/modules/prescription/actions";
import { ListeDelivrancesEtablissement } from "./ListeDelivrancesEtablissement";

interface HistoriquePageProps {
  searchParams: Promise<{
    dateDebut?: string | string[];
    dateFin?: string | string[];
    medicament?: string | string[];
  }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function dateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ecran "Historique des délivrances" (F-PHA-04 du pack), vue transversale a
 * l'echelle de la pharmacie (contrairement a HistoriqueDelivrances.tsx,
 * limite a une seule prescription). Reserve au role pharmacien ;
 * listerDelivrancesEtablissement fait de toute facon la meme verification
 * cote Server Action (Zero Trust).
 */
export default async function HistoriqueDelivrancesPage({ searchParams }: HistoriquePageProps) {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    redirect("/app/medecin");
  }

  const params = await searchParams;
  const aujourdHui = new Date();
  const ilYA30Jours = new Date(aujourdHui.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dateDebutBrute = premiereValeur(params.dateDebut) || dateISO(ilYA30Jours);
  const dateFinBrute = premiereValeur(params.dateFin) || dateISO(aujourdHui);
  const medicament = premiereValeur(params.medicament);

  const resultat = await listerDelivrancesEtablissement({
    dateDebut: dateDebutBrute,
    dateFin: dateFinBrute,
    medicament: medicament || undefined,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/app/medecin/pharmacie"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour à la pharmacie
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Pharmacie</p>
        <h1 className="text-[28px] font-bold text-titre">Historique des délivrances</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Délivrances réalisées par votre établissement, filtrables par période et par médicament.
        </p>
      </header>

      <ListeDelivrancesEtablissement
        resultat={resultat}
        filtres={{ dateDebut: dateDebutBrute, dateFin: dateFinBrute, medicament }}
      />
    </div>
  );
}
