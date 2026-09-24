"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creerRendezVousAction,
  type EtablissementOption,
  type FacilityActionState,
  type ProfessionnelOption,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: FacilityActionState = { error: null, success: false };

export interface FormulaireNouveauRendezVousProps {
  etablissements: EtablissementOption[];
  /** Tous les professionnels, tous établissements confondus : le filtrage
   * par établissement choisi se fait ici, côté client, plutôt que de refaire
   * un aller-retour serveur à chaque changement de sélection. */
  professionnels: ProfessionnelOption[];
  /** Minimum du champ date/heure ("AAAA-MM-JJTHH:mm"), calculé côté serveur
   * (heure de la requête) et transmis en prop plutôt que recalculé côté
   * client, pour éviter tout écart d'hydratation entre serveur et navigateur. */
  dateMinimum: string;
}

/**
 * Formulaire de prise de rendez-vous (Phase 4) : établissement (SelectField),
 * professionnel optionnel filtré dynamiquement selon l'établissement choisi
 * (côté client, à partir de la liste complète reçue en prop), date/heure
 * (minimum : maintenant) et motif. Soumis via creerRendezVousAction, même
 * schéma useActionState que le formulaire de consentement en Phase 3.
 */
export function FormulaireNouveauRendezVous({
  etablissements,
  professionnels,
  dateMinimum,
}: FormulaireNouveauRendezVousProps) {
  const [state, formAction, pending] = useActionState(
    creerRendezVousAction,
    etatInitial
  );
  const [etablissementId, setEtablissementId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Réinitialise la sélection d'établissement après un envoi réussi, en
  // comparant l'état courant au précédent pendant le rendu (ajustement d'état
  // pendant le rendu, plutôt qu'un appel setState dans un effet).
  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.success) {
      setEtablissementId("");
    }
  }

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.success, router]);

  const optionsEtablissements = etablissements.map((etablissement) => ({
    value: etablissement.id,
    label: `${etablissement.nom} (${etablissement.type}), ${etablissement.localisation}`,
  }));

  const professionnelsFiltres = professionnels.filter(
    (professionnel) => professionnel.etablissementId === etablissementId
  );
  const optionsProfessionnels = professionnelsFiltres.map((professionnel) => ({
    value: professionnel.id,
    label: `${professionnel.nomComplet}, ${professionnel.specialite}`,
  }));

  return (
    <Card description="Choisissez un établissement de santé et, si vous le souhaitez, un professionnel en particulier.">
      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className="flex flex-col gap-4"
      >
        {state.error ? (
          <Alert level="critical" title="Demande impossible">
            {state.error}
          </Alert>
        ) : null}
        {state.success ? (
          <Alert level="success" title="Demande envoyée">
            Votre demande de rendez-vous a été envoyée. Elle apparaît dans la
            liste de vos rendez-vous à venir.
          </Alert>
        ) : null}

        <SelectField
          label="Établissement de santé"
          name="etablissementId"
          required
          options={optionsEtablissements}
          placeholder="Choisir un établissement"
          onChange={(evenement) => setEtablissementId(evenement.target.value)}
        />

        <SelectField
          key={etablissementId}
          label="Professionnel de santé"
          name="professionnelId"
          options={optionsProfessionnels}
          placeholder={
            etablissementId === ""
              ? "Choisissez d'abord un établissement"
              : professionnelsFiltres.length > 0
                ? "Peu importe (facultatif)"
                : "Aucun professionnel disponible dans cet établissement"
          }
        />

        <TextField
          label="Date et heure souhaitées"
          name="date"
          type="datetime-local"
          required
          min={dateMinimum}
        />

        <TextField
          label="Motif de la consultation"
          name="motif"
          required
          placeholder="Ex. : douleur abdominale, suivi de grossesse, vaccination..."
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Envoi en cours..." : "Prendre rendez-vous"}
        </Button>
      </form>
    </Card>
  );
}
