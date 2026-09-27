"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Building2, Settings } from "lucide-react";
import {
  changerStatutEtablissementAction,
  modifierEtablissementAction,
  type DepartementOption,
  type EtablissementActionState,
  type EtablissementAdminResume,
  type EtablissementParentOption,
} from "@/modules/administration/etablissements";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ChampTextarea } from "../ChampTextarea";
import { OPTIONS_TYPE_ETABLISSEMENT } from "../lib";

const TONE_STATUT: Record<string, "neutral" | "good" | "warning" | "critical"> = {
  brouillon: "neutral",
  actif: "good",
  suspendu: "warning",
  ferme: "critical",
};

const LIBELLE_STATUT: Record<string, string> = {
  brouillon: "Brouillon",
  actif: "Actif",
  suspendu: "Suspendu",
  ferme: "Fermé",
};

const OPTIONS_NIVEAU_PYRAMIDE = [
  { value: "central", label: "Central" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "peripherique", label: "Périphérique" },
];

const OPTIONS_SECTEUR = [
  { value: "public", label: "Public" },
  { value: "prive_lucratif", label: "Privé lucratif" },
  { value: "prive_confessionnel", label: "Privé confessionnel" },
  { value: "associatif", label: "Associatif" },
];

const etatInitial: EtablissementActionState = { error: null, success: false };

function BoutonTransitionStatut({
  etablissementId,
  statutCible,
  label,
  variant,
}: {
  etablissementId: string;
  statutCible: string;
  label: string;
  variant: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(changerStatutEtablissementAction, etatInitial);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="etablissementId" value={etablissementId} />
      <input type="hidden" name="nouveauStatut" value={statutCible} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? "..." : label}
      </Button>
      {state.error ? (
        <p role="alert" className="max-w-[220px] text-[12px] text-critique">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ModaleReferentiel({
  etablissement,
  departements,
  parentsPossibles,
  onFerme,
}: {
  etablissement: EtablissementAdminResume;
  departements: DepartementOption[];
  parentsPossibles: EtablissementParentOption[];
  onFerme: () => void;
}) {
  const modaleRef = useRef<ModalHandle>(null);
  const [state, formAction, pending] = useActionState(modifierEtablissementAction, etatInitial);
  const [departementId, setDepartementId] = useState("");

  useEffect(() => {
    modaleRef.current?.showModal();
  }, []);

  const departementActuel = departements.find((departement) =>
    departement.communes.some((commune) => commune.nom === etablissement.communeNom)
  );
  const communesDisponibles =
    departements.find((departement) => departement.id === (departementId || departementActuel?.id))
      ?.communes ?? [];

  if (state.success) {
    return (
      <Modal ref={modaleRef} variant="dialog" title="Référentiel mis à jour" onClose={onFerme}>
        <Alert level="success" title="Enregistré">
          Le référentiel de l&apos;établissement a été mis à jour.
        </Alert>
        <Button variant="primary" className="mt-4 w-full" onClick={() => modaleRef.current?.close()}>
          Fermer
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      ref={modaleRef}
      variant="dialog"
      width="wide"
      icon={Settings}
      title={`Référentiel : ${etablissement.nom}`}
      onClose={onFerme}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="etablissementId" value={etablissement.id} />

        {state.error ? (
          <Alert level="critical" title="Enregistrement refusé">
            {state.error}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nom officiel" name="nom" required defaultValue={etablissement.nom} maxLength={150} />
          <SelectField
            label="Type"
            name="type"
            required
            options={OPTIONS_TYPE_ETABLISSEMENT}
            defaultValue={etablissement.type}
            hint="Ne peut plus changer pour un laboratoire qui a reçu des examens ou une pharmacie qui a délivré des ordonnances."
          />
          <TextField
            label="Capacité (lits ou places)"
            name="capacite"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            required
            defaultValue={String(etablissement.capacite)}
          />
          <TextField
            label="Latitude"
            name="latitude"
            type="number"
            step="any"
            required
            defaultValue={String(etablissement.latitude)}
            hint="Entre 6,1 et 12,5 (Bénin). Point décimal."
          />
          <TextField
            label="Longitude"
            name="longitude"
            type="number"
            step="any"
            required
            defaultValue={String(etablissement.longitude)}
            hint="Entre 0,7 et 3,95 (Bénin)."
          />
          <div className="sm:col-span-2">
            <ChampTextarea
              label="Services disponibles"
              name="services"
              rows={4}
              defaultValue={etablissement.services.join("\n")}
              hint="Un service par ligne."
            />
          </div>
          <TextField label="Sigle" name="sigle" defaultValue={etablissement.sigle ?? ""} />
          <SelectField
            label="Niveau de pyramide"
            name="niveauPyramide"
            options={OPTIONS_NIVEAU_PYRAMIDE}
            placeholder="Non renseigné"
            defaultValue={etablissement.niveauPyramide ?? ""}
          />
          <SelectField
            label="Secteur"
            name="secteur"
            options={OPTIONS_SECTEUR}
            placeholder="Non renseigné"
            defaultValue={etablissement.secteur ?? ""}
          />
          <SelectField
            label="Département"
            options={departements.map((departement) => ({ value: departement.id, label: departement.nom }))}
            placeholder="Choisir un département"
            value={departementId || departementActuel?.id || ""}
            onChange={(event) => setDepartementId(event.target.value)}
          />
          <SelectField
            label="Commune"
            name="communeId"
            options={communesDisponibles.map((commune) => ({ value: commune.id, label: commune.nom }))}
            placeholder="Choisir une commune"
            hint={communesDisponibles.length === 0 ? "Choisissez d'abord un département" : undefined}
          />
          <TextField label="Arrondissement" name="arrondissement" defaultValue={etablissement.arrondissement ?? ""} />
          <TextField label="Quartier / village" name="quartierVillage" defaultValue={etablissement.quartierVillage ?? ""} />
          <TextField label="Adresse" name="adresse" defaultValue={etablissement.adresse ?? ""} />
          <TextField label="Téléphone" name="telephoneEtablissement" defaultValue={etablissement.telephoneEtablissement ?? ""} />
          <TextField label="E-mail" name="emailEtablissement" type="email" defaultValue={etablissement.emailEtablissement ?? ""} />
          <TextField
            label="Identifiant DHIS2"
            name="identifiantExterneDhis2"
            defaultValue={etablissement.identifiantExterneDhis2 ?? ""}
          />
          <SelectField
            label="Établissement parent"
            name="etablissementParentId"
            options={parentsPossibles.map((parent) => ({ value: parent.id, label: parent.nom }))}
            placeholder="Aucun (établissement racine)"
          />
        </div>

        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </Modal>
  );
}

export function SectionEtablissementsAdmin({
  etablissements,
  departements,
}: {
  etablissements: EtablissementAdminResume[];
  departements: DepartementOption[];
}) {
  const [modaleOuverte, setModaleOuverte] = useState<EtablissementAdminResume | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {etablissements.map((etablissement) => (
        <Card key={etablissement.id}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
                  <Building2 size={18} aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[15px] font-semibold text-encre">
                    {etablissement.nom}
                    {etablissement.sigle ? ` (${etablissement.sigle})` : ""}
                  </p>
                  <p className="chiffres text-[12px] text-encre-attenuee">{etablissement.identifiant}</p>
                  <p className="text-[13px] text-encre-secondaire">
                    {[etablissement.communeNom, etablissement.departementNom].filter(Boolean).join(", ") ||
                      "Territoire non renseigné"}
                  </p>
                </div>
              </div>
              <Badge tone={TONE_STATUT[etablissement.statut] ?? "neutral"}>
                {LIBELLE_STATUT[etablissement.statut] ?? etablissement.statut}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-bordure pt-3">
              <Button
                variant="secondary"
                size="sm"
                iconBefore={Settings}
                onClick={() => setModaleOuverte(etablissement)}
              >
                Référentiel
              </Button>

              {etablissement.statut === "brouillon" ? (
                <BoutonTransitionStatut
                  etablissementId={etablissement.id}
                  statutCible="actif"
                  label="Activer"
                  variant="primary"
                />
              ) : null}
              {etablissement.statut === "actif" ? (
                <>
                  <BoutonTransitionStatut
                    etablissementId={etablissement.id}
                    statutCible="suspendu"
                    label="Suspendre"
                    variant="secondary"
                  />
                  <BoutonTransitionStatut
                    etablissementId={etablissement.id}
                    statutCible="ferme"
                    label="Fermer"
                    variant="danger"
                  />
                </>
              ) : null}
              {etablissement.statut === "suspendu" ? (
                <>
                  <BoutonTransitionStatut
                    etablissementId={etablissement.id}
                    statutCible="actif"
                    label="Réactiver"
                    variant="primary"
                  />
                  <BoutonTransitionStatut
                    etablissementId={etablissement.id}
                    statutCible="ferme"
                    label="Fermer"
                    variant="danger"
                  />
                </>
              ) : null}
            </div>
          </div>
        </Card>
      ))}

      {modaleOuverte ? (
        <ModaleReferentiel
          key={modaleOuverte.id}
          etablissement={modaleOuverte}
          departements={departements}
          parentsPossibles={etablissements
            .filter((candidat) => candidat.id !== modaleOuverte.id)
            .map((candidat) => ({ id: candidat.id, nom: candidat.nom }))}
          onFerme={() => setModaleOuverte(null)}
        />
      ) : null}
    </div>
  );
}
