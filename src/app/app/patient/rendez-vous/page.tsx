import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getMesRendezVous,
  listEtablissements,
  listProfessionnelsParEtablissement,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeRendezVous } from "./ListeRendezVous";
import { FormulaireNouveauRendezVous } from "./FormulaireNouveauRendezVous";

/** Formate une date en chaîne "AAAA-MM-JJTHH:mm", au format attendu par un
 * champ datetime-local, à partir des composantes locales de la requête
 * serveur (jamais UTC). */
function formaterDateTimeLocal(date: Date): string {
  const pad = (valeur: number) => String(valeur).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Écran de gestion des rendez-vous (Phase 4) : liste des rendez-vous du
 * patient connecté (getMesRendezVous), groupée visuellement entre "à venir"
 * (statuts demande/confirme) et "passés et annulés" (statuts termine/annule),
 * et formulaire de prise de rendez-vous (listEtablissements +
 * listProfessionnelsParEtablissement + creerRendezVousAction). L'annulation
 * (annulerRendezVousAction) est gérée dans ListeRendezVous, avec confirmation
 * via Modal avant soumission, comme le retrait de consentement en Phase 3.
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
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace patient
        </p>
        <h1 className="text-[28px] font-black text-encre">Mes rendez-vous</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Consultez vos rendez-vous à venir et passés, et prenez un nouveau
          rendez-vous auprès d&apos;un établissement de santé.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <section
          aria-labelledby="titre-mes-rendez-vous"
          className="flex flex-col gap-4 lg:col-span-2"
        >
          <h2 id="titre-mes-rendez-vous" className="text-[20px] font-bold text-encre">
            Mes rendez-vous
          </h2>
          <ListeRendezVous rendezVous={rendezVous} />
        </section>

        <section aria-labelledby="titre-nouveau-rdv" className="flex flex-col gap-4">
          <h2 id="titre-nouveau-rdv" className="text-[20px] font-bold text-encre">
            Prendre un nouveau rendez-vous
          </h2>
          {etablissements.length > 0 ? (
            <FormulaireNouveauRendezVous
              etablissements={etablissements}
              professionnels={professionnels}
              dateMinimum={dateMinimum}
            />
          ) : (
            <Alert level="info" title="Aucun établissement disponible">
              Aucun établissement de santé n&apos;est disponible pour le
              moment.
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
