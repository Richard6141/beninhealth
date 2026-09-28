import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getExamensPourLaboratoire,
  getIdProfessionnelCourant,
} from "@/modules/laboratoire/actions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ModuleDesactive } from "@/components/ModuleDesactive";
import { ListeExamensLaboratoire } from "./ListeExamensLaboratoire";

/**
 * Espace laboratoire (Phase 8, F-LAB-04 principe des quatre yeux) : saisie
 * puis validation des resultats d'examens medicaux. Reserve au role
 * "laboratoire" (les autres roles professionnels sont renvoyes vers le
 * tableau de bord generique) ; getExamensPourLaboratoire fait de toute facon
 * la meme verification cote Server Action (Zero Trust, pas de confiance dans
 * le seul routage cote ecran), a l'image de src/app/app/medecin/pharmacie/page.tsx.
 * Presentation en tableau unique avec filtres (ListeExamensLaboratoire),
 * meme pattern que les tableaux de rendez-vous patient/medecin : "A saisir"
 * (rien encore soumis, ou renvoye pour correction), "A valider" (resultat
 * saisi mais pas encore verrouille par un second professionnel),
 * "Historique" (verrouille ou annule).
 */
export default async function LaboratoirePage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.roles.includes("laboratoire")) {
    redirect("/app/medecin");
  }

  if (!(await estFonctionnaliteActive("lab.module"))) {
    return <ModuleDesactive cle="lab.module" />;
  }

  const [examens, idProfessionnelCourant] = await Promise.all([
    getExamensPourLaboratoire(),
    getIdProfessionnelCourant(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Examens médicaux</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Tous les examens assignes a votre etablissement. Un resultat saisi
          doit etre valide par un autre professionnel du laboratoire avant de
          devenir visible du patient et du medecin demandeur (principe des
          quatre yeux).
        </p>
        <Link
          href="/app/medecin/laboratoire/validation"
          className="inline-flex w-fit items-center gap-1 text-[14px] font-semibold text-accent hover:underline"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          File de validation ({examens.filter((examen) => examen.statut === "resultat_saisi").length})
        </Link>
      </header>

      <ListeExamensLaboratoire examens={examens} idProfessionnelCourant={idProfessionnelCourant} />
    </div>
  );
}
