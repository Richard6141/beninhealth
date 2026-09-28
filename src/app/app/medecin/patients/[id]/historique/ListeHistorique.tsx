"use client";

import { useRef, useState } from "react";
import { FileText, FlaskConical, Package, Pill, Stethoscope, Syringe, Users, type LucideIcon } from "lucide-react";
import {
  journaliserOuvertureDetailHistoriqueAction,
  type EvenementHistorique,
  type TypeEvenementHistorique,
} from "@/modules/clinical/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const ICONES: Record<TypeEvenementHistorique, LucideIcon> = {
  consultation: Stethoscope,
  prescription: Pill,
  examen: FlaskConical,
  suivi_communautaire: Users,
  vaccination: Syringe,
  document: FileText,
  delivrance: Package,
};

const LIBELLES_TYPE: Record<TypeEvenementHistorique, string> = {
  consultation: "Consultation",
  prescription: "Prescription",
  examen: "Examen",
  suivi_communautaire: "Suivi communautaire",
  vaccination: "Vaccination",
  document: "Document",
  delivrance: "Délivrance",
};

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Chronologie cliquable (F-CLI-09 du pack) : chaque élément ouvre son détail
 * dans un tiroir latéral (Modal variant="drawer-right") sans quitter la
 * page. RG-CLI-80 : l'ouverture du détail est journalisée individuellement,
 * en plus de l'entrée unique déjà posée côté serveur pour l'affichage de la
 * liste (voir getHistoriquePatient).
 */
export function ListeHistorique({ evenements }: { evenements: EvenementHistorique[] }) {
  const modalRef = useRef<ModalHandle>(null);
  const [selection, setSelection] = useState<EvenementHistorique | null>(null);

  function ouvrirDetail(evenement: EvenementHistorique) {
    setSelection(evenement);
    modalRef.current?.showModal();
    void journaliserOuvertureDetailHistoriqueAction(evenement.type, evenement.id);
  }

  if (evenements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
          <FileText size={20} aria-hidden="true" />
        </span>
        <p className="text-[14px] font-semibold text-encre">Aucun événement pour ce filtre</p>
        <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
          Essayez d&apos;élargir la période ou de choisir un autre type d&apos;événement.
        </p>
      </div>
    );
  }

  const Icone = selection ? ICONES[selection.type] : undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        {evenements.map((evenement) => {
          const IconeLigne = ICONES[evenement.type];
          return (
            <Card
              key={`${evenement.type}-${evenement.id}`}
              tabIndex={0}
              role="button"
              aria-label={`Voir le détail : ${evenement.titre}`}
              onClick={() => ouvrirDetail(evenement)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  ouvrirDetail(evenement);
                }
              }}
              className="cursor-pointer transition-colors motion-reduce:transition-none hover:bg-plan focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
                  <IconeLigne size={18} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold text-encre">
                      {evenement.titre}
                      {evenement.saisieParErreur ? <Badge tone="critical">Retirée</Badge> : null}
                    </p>
                    <span className="text-[12.5px] text-encre-attenuee">{formaterDateHeure(evenement.date)}</span>
                  </div>
                  <p className="text-[13px] text-encre-secondaire">
                    {LIBELLES_TYPE[evenement.type]} · {evenement.professionnelNomComplet} · {evenement.etablissementNom}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        ref={modalRef}
        variant="drawer-right"
        icon={Icone}
        title={selection ? LIBELLES_TYPE[selection.type] : ""}
        description={selection?.titre}
      >
        {selection ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-encre-secondaire">
              {formaterDateHeure(selection.date)} · {selection.professionnelNomComplet} · {selection.etablissementNom}
            </p>
            {selection.detailLignes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {selection.detailLignes.map((ligne, index) => (
                  <li key={index} className="text-[14px] text-encre">
                    {ligne}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-encre-attenuee">Aucun détail supplémentaire.</p>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
