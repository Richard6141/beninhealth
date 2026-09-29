"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  revokeConsentAction,
  type ConsentementAvecActeur,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { LIBELLES_NIVEAU_ACCES } from "@/modules/patient/consentement-niveaux";

const etatInitial: PatientActionState = { error: null, success: false };

const libellesTypeAcces: Record<string, string> = {
  dossier_complet: "Dossier complet",
  consultations: "Consultations",
  prescriptions: "Prescriptions",
  examens: "Examens",
  documents: "Documents",
};

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "actif") return { texte: "Actif", tone: "good" };
  if (cle === "retire") return { texte: "Retiré", tone: "neutral" };
  if (cle === "expire") return { texte: "Expiré", tone: "neutral" };
  return { texte: statut, tone: "neutral" };
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR");
  } catch {
    return date;
  }
}

export interface ListeConsentementsProps {
  consentements: ConsentementAvecActeur[];
}

/** Fenetre de retention de la section "Expires" (RG-CIT-80 du pack, texte exact : "90 derniers jours"). */
const FENETRE_EXPIRES_JOURS = 90;

function estExpireDepuisMoinsDe90Jours(consentement: ConsentementAvecActeur): boolean {
  if (!consentement.dateFin) return false;
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - FENETRE_EXPIRES_JOURS);
  return new Date(consentement.dateFin) >= seuil;
}

function GrilleConsentements({ consentements }: { consentements: ConsentementAvecActeur[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {consentements.map((consentement) => (
        <CarteConsentement key={consentement.id} consentement={consentement} />
      ))}
    </div>
  );
}

/**
 * RG-CIT-80 du pack, texte exact : "La liste DOIT afficher separement les
 * autorisations actives, expirees (90 derniers jours) et retirees." Purement
 * un regroupement d'affichage : statutEffectif ("actif"/"expire"/"retire")
 * est deja calcule cote serveur (patient/actions.ts, calculerStatutEffectifConsentement),
 * aucun changement de donnees. Les consentements expires depuis plus de 90
 * jours sont exclus de la liste (le pack ne demande que cette fenetre pour
 * cette categorie), jamais les retires, quelle que soit leur anciennete.
 */
export function ListeConsentements({ consentements }: ListeConsentementsProps) {
  if (consentements.length === 0) {
    return (
      <Card>
        <p className="text-[13px] text-encre-attenuee">
          Vous n&apos;avez accordé aucun accès à votre dossier pour le moment.
        </p>
      </Card>
    );
  }

  const actifs = consentements.filter((c) => c.statutEffectif === "actif");
  const expires = consentements.filter((c) => c.statutEffectif === "expire" && estExpireDepuisMoinsDe90Jours(c));
  const retires = consentements.filter((c) => c.statutEffectif === "retire");

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titre-actifs" className="flex flex-col gap-4">
        <h2 id="titre-actifs" className="text-[16px] font-bold text-encre">
          Actifs ({actifs.length})
        </h2>
        {actifs.length > 0 ? (
          <GrilleConsentements consentements={actifs} />
        ) : (
          <p className="text-[13px] text-encre-attenuee">Aucun accès actif pour le moment.</p>
        )}
      </section>

      {expires.length > 0 ? (
        <section aria-labelledby="titre-expires" className="flex flex-col gap-4">
          <h2 id="titre-expires" className="text-[16px] font-bold text-encre">
            Expirés (90 derniers jours) ({expires.length})
          </h2>
          <GrilleConsentements consentements={expires} />
        </section>
      ) : null}

      {retires.length > 0 ? (
        <section aria-labelledby="titre-retires" className="flex flex-col gap-4">
          <h2 id="titre-retires" className="text-[16px] font-bold text-encre">
            Retirés ({retires.length})
          </h2>
          <GrilleConsentements consentements={retires} />
        </section>
      ) : null}
    </div>
  );
}

function CarteConsentement({
  consentement,
}: {
  consentement: ConsentementAvecActeur;
}) {
  const [state, formAction, pending] = useActionState(
    revokeConsentAction,
    etatInitial
  );
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();
  const statut = libelleStatut(consentement.statutEffectif);
  const estActif = statut.texte === "Actif";

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Card
      title={consentement.acteurNomComplet}
      description={consentement.acteurSpecialite}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-encre-secondaire">Type d&apos;accès :</span>
          <Badge tone="accent">
            {libellesTypeAcces[consentement.typeAcces] ?? consentement.typeAcces}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-encre-secondaire">Niveau :</span>
          <Badge tone={consentement.niveauAcces === "FULL_SENSITIVE" ? "critical" : "neutral"}>
            {LIBELLES_NIVEAU_ACCES[consentement.niveauAcces] ?? consentement.niveauAcces}
          </Badge>
        </div>
        <p className="text-[13px] text-encre-secondaire">
          Depuis le {formaterDate(consentement.dateDebut)}
          {consentement.dateFin
            ? `, jusqu'au ${formaterDate(consentement.dateFin)}`
            : ""}
        </p>

        {state.error ? (
          <Alert level="critical" title="Retrait impossible">
            {state.error}
          </Alert>
        ) : null}

        {estActif ? (
          <>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="w-fit"
              onClick={() => modalRef.current?.showModal()}
            >
              Retirer l&apos;accès
            </Button>
            <Modal
              ref={modalRef}
              title="Retirer cet accès ?"
              description={`${consentement.acteurNomComplet} ne pourra plus consulter votre dossier selon ce type d'accès.`}
            >
              <form action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="consentementId" value={consentement.id} />
                <p className="text-[14px] text-encre-secondaire">
                  Cette action est immédiate. Vous pourrez accorder un nouvel
                  accès à tout moment depuis cette page.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => modalRef.current?.close()}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" variant="danger" disabled={pending}>
                    {pending ? "Retrait en cours..." : "Confirmer le retrait"}
                  </Button>
                </div>
              </form>
            </Modal>
          </>
        ) : null}
      </div>
    </Card>
  );
}
