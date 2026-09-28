import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getExamensPourLaboratoire,
  getIdProfessionnelCourant,
} from "@/modules/laboratoire/actions";
import { construireFileValidation } from "@/modules/laboratoire/file-validation";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { ModuleDesactive } from "@/components/ModuleDesactive";
import { Card } from "@/components/ui/Card";
import { CarteValidation } from "./CarteValidation";

/**
 * File de validation du laboratoire (F-LAB-04 du pack, ecran /labo/validation,
 * servi sous /app/medecin/laboratoire/validation comme le reste de l'espace
 * laboratoire de ce depot). Distincte de la liste generale
 * (/app/medecin/laboratoire) qui melange prelevement, saisie et historique :
 * ici uniquement les resultats saisis en attente de la seconde paire d'yeux
 * (RG-ROL-30), urgents d'abord puis les plus anciens. Memes gardes que la
 * liste generale (role laboratoire, module actif) ; getExamensPourLaboratoire
 * refait de toute facon le controle cote serveur (Zero Trust).
 */
export default async function FileValidationLaboratoirePage() {
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
  const { aValider, saisisParMoi } = construireFileValidation(examens, idProfessionnelCourant);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin/laboratoire"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour à tous les examens
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Résultats à valider</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Résultats saisis par un collègue, en attente de votre validation
          (principe des quatre yeux). Un résultat validé n&apos;est plus
          jamais modifié : une erreur se corrige ensuite par une nouvelle
          version, depuis la liste des examens.
        </p>
      </header>

      <section aria-labelledby="titre-a-valider" className="flex flex-col gap-4">
        <h2 id="titre-a-valider" className="text-[20px] font-bold text-encre">
          À valider ({aValider.length})
        </h2>
        {aValider.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <p className="text-[14px] font-semibold text-encre">Aucun résultat à valider</p>
              <p className="max-w-[40ch] text-[13px] text-encre-attenuee">
                Aucun résultat saisi par un collègue n&apos;attend votre validation pour le moment.
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {aValider.map((examen) => (
              <CarteValidation key={examen.id} examen={examen} estSaisiParMoi={false} />
            ))}
          </div>
        )}
      </section>

      {saisisParMoi.length > 0 ? (
        <section aria-labelledby="titre-saisis-par-moi" className="flex flex-col gap-4">
          <h2 id="titre-saisis-par-moi" className="text-[20px] font-bold text-encre">
            Saisis par vous, en attente d&apos;un collègue ({saisisParMoi.length})
          </h2>
          <div className="flex flex-col gap-4">
            {saisisParMoi.map((examen) => (
              <CarteValidation key={examen.id} examen={examen} estSaisiParMoi />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
