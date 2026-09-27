"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { confirmerRendezVousAction, refuserRendezVousAction, type FacilityActionState } from "@/modules/facility/actions";
import type { DemandeRendezVousAccueil } from "@/modules/facility/demandes-accueil";
import { MOTIFS_REFUS_RENDEZ_VOUS } from "@/modules/facility/regles-rendez-vous";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const ETAT_INITIAL: FacilityActionState = { error: null, success: false };

/** Fuseau fixe (Africa/Porto-Novo) : le rendu serveur et le navigateur affichent la meme heure. */
function formaterDateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Porto-Novo" });
}

function LigneDemande({ demande }: { demande: DemandeRendezVousAccueil }) {
  const router = useRouter();
  const [etatConfirmation, actionConfirmation, confirmationEnCours] = useActionState(confirmerRendezVousAction, ETAT_INITIAL);
  const [etatRefus, actionRefus, refusEnCours] = useActionState(refuserRendezVousAction, ETAT_INITIAL);
  const modaleRefusRef = useRef<ModalHandle>(null);

  useEffect(() => {
    if (etatConfirmation.success) router.refresh();
  }, [etatConfirmation.success, router]);

  useEffect(() => {
    if (etatRefus.success) {
      modaleRefusRef.current?.close();
      router.refresh();
    }
  }, [etatRefus.success, router]);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[16px] font-semibold text-encre">{demande.patientNomComplet}</p>
            <p className="text-[13px] text-encre-secondaire">{demande.patientAge} ans</p>
          </div>
          {demande.absencesRecentes > 0 ? (
            <Badge tone={demande.absencesRecentes >= 3 ? "critical" : "warning"}>
              {demande.absencesRecentes} absence{demande.absencesRecentes > 1 ? "s" : ""} sur 90 jours
            </Badge>
          ) : null}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Rendez-vous</dt>
            <dd className="text-[14px] font-semibold text-encre">{formaterDateHeure(demande.date)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Praticien</dt>
            <dd className={demande.professionnelNomComplet ? "text-[14px] text-encre" : "text-[14px] italic text-encre-attenuee"}>
              {demande.professionnelNomComplet ?? "Non précisé"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Motif</dt>
            <dd className="text-[14px] text-encre">{demande.motif}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Expire le</dt>
            <dd className="text-[14px] text-encre">{formaterDateHeure(demande.expireLe)}</dd>
          </div>
        </dl>

        {etatConfirmation.error ? (
          <Alert level="critical" title="Confirmation impossible">
            {etatConfirmation.error}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <form action={actionConfirmation}>
            <input type="hidden" name="rendezVousId" value={demande.id} />
            <Button type="submit" variant="primary" iconBefore={Check} disabled={confirmationEnCours}>
              {confirmationEnCours ? "Confirmation..." : "Confirmer"}
            </Button>
          </form>
          <Button type="button" variant="danger" iconBefore={X} onClick={() => modaleRefusRef.current?.showModal()}>
            Refuser
          </Button>
        </div>

        <Modal
          ref={modaleRefusRef}
          title="Refuser cette demande ?"
          description={`La demande de ${demande.patientNomComplet} sera refusée et le patient en sera informé avec le motif.`}
        >
          <form action={actionRefus} className="flex flex-col gap-4">
            <input type="hidden" name="rendezVousId" value={demande.id} />
            {etatRefus.error ? (
              <Alert level="critical" title="Refus impossible">
                {etatRefus.error}
              </Alert>
            ) : null}
            <SelectField
              label="Motif du refus"
              name="motif"
              required
              placeholder="Choisir un motif"
              options={MOTIFS_REFUS_RENDEZ_VOUS.map((motif) => ({ value: motif.code, label: motif.libelle }))}
            />
            <TextField label="Précision" name="precision" hint="Facultative, sauf pour « Autre motif » (5 caractères minimum)." />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => modaleRefusRef.current?.close()}>
                Revenir
              </Button>
              <Button type="submit" variant="danger" disabled={refusEnCours}>
                {refusEnCours ? "Refus en cours..." : "Confirmer le refus"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </Card>
  );
}

export function SectionDemandesRendezVous({ demandes }: { demandes: DemandeRendezVousAccueil[] }) {
  if (demandes.length === 0) {
    return (
      <EtatVide
        titre="Aucune demande en attente"
        description="Les nouvelles demandes de rendez-vous des patients apparaîtront ici, dans l'ordre des rendez-vous."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {demandes.map((demande) => (
        <LigneDemande key={demande.id} demande={demande} />
      ))}
    </div>
  );
}
