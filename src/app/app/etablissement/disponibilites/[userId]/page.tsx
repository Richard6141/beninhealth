import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { professionnelIdDepuisUserId, listerCreneauxProfessionnel } from "@/modules/facility/disponibilites";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { FormulaireCreneaux } from "./FormulaireCreneaux";

interface PageDisponibilitesProps {
  params: Promise<{ userId: string }>;
}

/**
 * Ecran F-ETA-05 (chapitre 9 du pack, "Définir les agendas") : gestion des
 * créneaux hebdomadaires récurrents d'un professionnel par
 * l'admin_etablissement de son établissement. Périmètre réduit, voir
 * src/modules/facility/disponibilites.ts.
 */
export default async function PageDisponibilites({ params }: PageDisponibilitesProps) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_etablissement")) {
    redirect("/app");
  }

  const { userId } = await params;
  const professionnelId = await professionnelIdDepuisUserId(userId);

  if (!professionnelId) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <Alert level="critical" title="Accès refusé">
          Ce professionnel n&apos;appartient pas à votre établissement, ou est introuvable.
        </Alert>
      </div>
    );
  }

  const [utilisateur, creneaux] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { nom: true, prenom: true } }),
    listerCreneauxProfessionnel(professionnelId),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/app/etablissement" className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Retour à mon établissement
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Agenda (F-ETA-05)</p>
        <h1 className="text-[24px] font-bold text-titre">
          Disponibilités de {utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}` : "ce professionnel"}
        </h1>
        <p className="max-w-2xl text-[14px] text-encre-secondaire">
          Définissez les créneaux hebdomadaires récurrents pendant lesquels ce professionnel est réservable pour un
          rendez-vous. Heures en fuseau Afrique/Porto-Novo.
        </p>
      </header>

      <Card>
        <FormulaireCreneaux professionnelId={professionnelId} creneaux={creneaux ?? []} />
      </Card>
    </div>
  );
}
