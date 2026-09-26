import Link from "next/link";
import { ArrowLeft, Pill } from "lucide-react";
import {
  getLignesEnAttente,
  getMesPrescriptions,
  type LignePrescriptionDetail,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BoutonTelechargerOrdonnance } from "./BoutonTelechargerOrdonnance";
import { statutPrescriptionAffichage } from "./lib";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

function LigneMedicament({ ligne }: { ligne: LignePrescriptionDetail }) {
  return (
    <li className="flex flex-col gap-1 rounded-champ border border-bordure bg-plan px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-encre">
          {ligne.medicamentNom}
        </span>
        <span className="text-[13px] text-encre-attenuee">
          {ligne.dosage}, {ligne.forme}
        </span>
      </div>
      <p className="text-[13px] text-encre-secondaire">{ligne.posologie}</p>
      <p className="text-[12px] text-encre-attenuee">
        Quantité : {ligne.quantite} · Durée du traitement :{" "}
        {ligne.dureeTraitementJours}{" "}
        {ligne.dureeTraitementJours > 1 ? "jours" : "jour"}
      </p>
    </li>
  );
}

/**
 * Historique complet des prescriptions du patient connecte (Phase 5),
 * du plus recent au plus ancien (ordre deja garanti par
 * getMesPrescriptions()). Le badge de statut affiche suit la meme regle de
 * calcul que sur le tableau de bord (voir ./lib.ts) : une prescription
 * validee est "En cours" tant que la fenetre de traitement (date + duree
 * maximale de ses lignes) n'est pas depassee, sinon "Terminee", et une
 * prescription annulee affiche son statut brut.
 */
export default async function PrescriptionsPage() {
  const prescriptions = await getMesPrescriptions();

  // F-PHA-03 / CA-2 : sur une prescription delivree en partie, la ou les
  // lignes encore en attente sont identifiees explicitement, pas seulement
  // le statut global.
  const lignesEnAttenteParPrescription = new Map<
    string,
    { medicamentNom: string; quantiteRestante: number }[]
  >();

  await Promise.all(
    prescriptions
      .filter((prescription) => prescription.statut === "delivree_partiellement")
      .map(async (prescription) => {
        lignesEnAttenteParPrescription.set(prescription.id, await getLignesEnAttente(prescription.id));
      })
  );

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
        <h1 className="text-[28px] font-bold text-titre">Mes prescriptions</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Historique complet de vos prescriptions, de la plus récente à la
          plus ancienne.
        </p>
      </header>

      {prescriptions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <Pill size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucune prescription enregistrée
            </p>
            <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
              Vos prescriptions apparaîtront ici après une consultation
              médicale donnant lieu à une ordonnance.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {prescriptions.map((prescription) => {
            const statut = statutPrescriptionAffichage(prescription);
            const lignesEnAttente = lignesEnAttenteParPrescription.get(prescription.id) ?? [];
            return (
              <Card
                key={prescription.id}
                title={formaterDate(prescription.date)}
                description={
                  prescription.medecinNomComplet
                    ? `Prescrit par ${prescription.medecinNomComplet}`
                    : "Médecin prescripteur non précisé"
                }
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statut.tone}>{statut.texte}</Badge>
                    <BoutonTelechargerOrdonnance prescriptionId={prescription.id} />
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {prescription.statut === "delivree_partiellement" && lignesEnAttente.length > 0 ? (
                    <Alert level="warning" title="Encore en attente à la pharmacie">
                      {lignesEnAttente
                        .map(
                          (ligne) =>
                            `${ligne.medicamentNom} (${ligne.quantiteRestante} restant${ligne.quantiteRestante > 1 ? "s" : ""})`
                        )
                        .join(", ")}
                    </Alert>
                  ) : null}

                  <div className="flex flex-col gap-1 border-b border-bordure pb-4">
                    <p className="text-[13px] font-semibold text-encre-secondaire">
                      Motif de la consultation
                    </p>
                    <p className="text-[14px] text-encre">
                      {prescription.consultationMotif}
                    </p>
                  </div>

                  {prescription.instructions ? (
                    <div className="flex flex-col gap-1 border-b border-bordure pb-4">
                      <p className="text-[13px] font-semibold text-encre-secondaire">
                        Instructions générales
                      </p>
                      <p className="text-[14px] text-encre">
                        {prescription.instructions}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] font-semibold text-encre-secondaire">
                      Médicaments prescrits ({prescription.lignes.length})
                    </p>
                    {prescription.lignes.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {prescription.lignes.map((ligne, index) => (
                          <LigneMedicament
                            key={`${ligne.medicamentId}-${index}`}
                            ligne={ligne}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-encre-attenuee">
                        Aucun médicament associé à cette prescription.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
