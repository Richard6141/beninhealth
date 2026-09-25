"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";
import { ModalNouveauPatient, type PatientCree } from "./ModalNouveauPatient";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface PatientListe {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
  allergies: string[];
  dateNaissance: string;
  sexe: string;
  avatarUrl: string | null;
}

const styleEnTete =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee";
const styleCellule = "px-4 py-3.5 align-middle border-t border-bordure";

function calculerAge(dateNaissance: string): number {
  const naissance = new Date(dateNaissance);
  const maintenant = new Date();
  let age = maintenant.getFullYear() - naissance.getFullYear();
  const moisDiff = maintenant.getMonth() - naissance.getMonth();
  if (moisDiff < 0 || (moisDiff === 0 && maintenant.getDate() < naissance.getDate())) {
    age -= 1;
  }
  return age;
}

/** État vide, cohérent avec le vocabulaire visuel utilisé ailleurs dans le projet (voir ListeRendezVousProfessionnel.tsx). */
function EtatVide({ aDesPatients }: { aDesPatients: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
        <Users size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">
        {aDesPatients ? "Aucun résultat" : "Aucun patient accessible"}
      </p>
      <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
        {aDesPatients
          ? "Essayez un autre nom ou identifiant."
          : "Un patient doit d'abord vous accorder l'accès à son dossier, ou utilisez « Ajouter un patient » pour un patient sans compte."}
      </p>
    </div>
  );
}

/**
 * Liste des patients ayant accorde un consentement au medecin connecte
 * (F-CLI-02 du pack, adapte au modele de consentement de ce depot - pas de
 * recherche par telephone/QR, uniquement parmi les patients deja
 * accessibles). Tableau au meme gabarit que ListeRendezVousProfessionnel.tsx
 * (rendez-vous) : recherche en direct, ligne cliquable vers la fiche
 * detaillee (/app/medecin/patients/[id]).
 */
export function ListePatients({ patients }: { patients: PatientListe[] }) {
  const [recherche, setRecherche] = useState("");
  const router = useRouter();

  const patientsFiltres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (terme.length === 0) return patients;
    return patients.filter(
      (patient) =>
        patient.nomComplet.toLowerCase().includes(terme) ||
        patient.identifiantSante.toLowerCase().includes(terme)
    );
  }, [patients, recherche]);

  function handlePatientCree(patient: PatientCree) {
    router.push(`/app/medecin/patients/${encodeURIComponent(patient.patientId)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-attenuee"
          />
          <input
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Rechercher par nom ou identifiant santé..."
            aria-label="Rechercher parmi mes patients"
            className="h-11 w-full rounded-champ border border-bordure-forte bg-surface pl-9 pr-3 text-[15px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
        <ModalNouveauPatient onPatientCree={handlePatientCree} />
      </div>

      {patientsFiltres.length === 0 ? (
        <Card className="p-0 sm:p-0">
          <EtatVide aDesPatients={patients.length > 0} />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-surface-appui">
                  <th scope="col" className={styleEnTete}>Patient</th>
                  <th scope="col" className={styleEnTete}>Identifiant santé</th>
                  <th scope="col" className={styleEnTete}>Âge / Sexe</th>
                  <th scope="col" className={styleEnTete}>Allergies</th>
                </tr>
              </thead>
              <tbody>
                {patientsFiltres.map((patient) => (
                  <tr
                    key={patient.patientId}
                    tabIndex={0}
                    role="button"
                    aria-label={`Voir la fiche de ${patient.nomComplet}`}
                    onClick={() => router.push(`/app/medecin/patients/${patient.patientId}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/app/medecin/patients/${patient.patientId}`);
                      }
                    }}
                    className="cursor-pointer transition-colors motion-reduce:transition-none hover:bg-plan focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <td className={styleCellule}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={patient.nomComplet} avatarUrl={patient.avatarUrl} size={32} />
                        <span className="font-semibold text-encre">{patient.nomComplet}</span>
                      </div>
                    </td>
                    <td className={styleCellule}>
                      <span className="chiffres text-encre-secondaire">{patient.identifiantSante}</span>
                    </td>
                    <td className={styleCellule}>
                      <span className="text-encre-secondaire">
                        {calculerAge(patient.dateNaissance)} ans · {patient.sexe === "F" ? "Féminin" : "Masculin"}
                      </span>
                    </td>
                    <td className={styleCellule}>
                      {patient.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {patient.allergies.map((allergie) => (
                            <Badge key={allergie} tone="critical">
                              {allergie}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-encre-attenuee">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
