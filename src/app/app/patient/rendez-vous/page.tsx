import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getMesRendezVous,
  listEtablissements,
  listProfessionnelsParEtablissement,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeRendezVous } from "./ListeRendezVous";
import { BoutonNouveauRendezVous } from "./FormulaireNouveauRendezVous";

/** Formate une date en chaîne "AAAA-MM-JJTHH:mm", au format attendu par un
 * champ datetime-local, à partir des composantes locales de la requête
 * serveur (jamais UTC). */
function formaterDateTimeLocal(date: Date): string {
  const pad = (valeur: number) => String(valeur).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Écran de gestion des rendez-vous (Phase 4, refonte tableau) : liste des
 * rendez-vous du patient connecté (getMesRendezVous), présentée en tableau,
 * groupée entre "à venir" (statuts demande/confirme) et "passés et annulés"
 * (statuts termine/annule). La prise de rendez-vous (listEtablissements +
 * listProfessionnelsParEtablissement + creerRendezVousAction) se fait dans
 * une Modal ouverte depuis le bouton "Prendre un rendez-vous"
 * (BoutonNouveauRendezVous), plutôt qu'un formulaire affiché en permanence.
 * L'annulation (annulerRendezVousAction) reste gérée dans ListeRendezVous,
 * avec confirmation via Modal avant soumission, comme le retrait de
 * consentement en Phase 3.
 *
 * Les professionnels de tous les établissements sont récupérés en une seule
 * fois côté serveur puis transmis au formulaire client, qui filtre en
 * fonction de l'établissement choisi sans nouvel aller-retour serveur.
 */
export default async function RendezVousPage() {
  const [etablissements, rendezVous] = await Promise.all([
    listEtablissements(),
    getMesRendezVous(),
  ]);

  const professionnelsParEtablissement = await Promise.all(
    etablissements.map((etablissement) =>
      listProfessionnelsParEtablissement(etablissement.id)
    )
  );
  const professionnels = professionnelsParEtablissement.flat();
  const dateMinimum = formaterDateTimeLocal(new Date());

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/patient"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Mes rendez-vous</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Consultez vos rendez-vous à venir et passés, et prenez un nouveau
          rendez-vous auprès d&apos;un établissement de santé.
        </p>
      </header>

      <section aria-labelledby="titre-mes-rendez-vous" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titre-mes-rendez-vous" className="text-[20px] font-bold text-encre">
            Mes rendez-vous
          </h2>
          {etablissements.length > 0 ? (
            <BoutonNouveauRendezVous
              etablissements={etablissements}
              professionnels={professionnels}
              dateMinimum={dateMinimum}
            />
          ) : null}
        </div>

        {etablissements.length === 0 ? (
          <Alert level="info" title="Aucun établissement disponible">
            Aucun établissement de santé n&apos;est disponible pour le moment,
            vous ne pouvez donc pas prendre de nouveau rendez-vous.
          </Alert>
        ) : null}

        <ListeRendezVous rendezVous={rendezVous} />
      </section>
    </div>
  );
}
