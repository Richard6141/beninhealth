"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ajouterContactUrgenceAction,
  ajouterInformationDeclareeAction,
  retirerInformationDeclareeAction,
  type InformationDeclareeActionState,
  type InformationDeclareeResume,
} from "@/modules/patient/informations-declarees";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: InformationDeclareeActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

/**
 * Ligne d'une information declaree (F-CIT-04) : active (avec bouton
 * "Retirer"), confirmee par un professionnel (RG-CIT-30 : le bouton
 * "Retirer" n'existe pas, seul un lien vers "Signaler une erreur"), ou deja
 * retiree (barree, avec la mention "Retire le [date] : [motif]", RG-CIT-31 :
 * jamais effacee de l'historique).
 */
function LigneInformation({ information }: { information: InformationDeclareeResume }) {
  const [state, formAction, pending] = useActionState(retirerInformationDeclareeAction, etatInitial);
  const router = useRouter();
  const [motifOuvert, setMotifOuvert] = useState(false);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state, router]);

  if (information.statut === "retire") {
    return (
      <li className="flex flex-col gap-1 border-b border-bordure py-2.5 last:border-0">
        <span className="text-[14px] text-encre-attenuee line-through decoration-2">{information.libelle}</span>
        {information.dateRetrait ? (
          <span className="text-[12px] text-encre-attenuee">
            Retiré le {formaterDate(information.dateRetrait)}
            {information.motifRetrait ? ` : ${information.motifRetrait}` : ""}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b border-bordure py-2.5 last:border-0">
      {state.error ? (
        <Alert level="critical" title="Retrait impossible" className="text-[13px]">
          {state.error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-encre">{information.libelle}</span>
        {information.statut === "confirme" ? (
          <span
            className="text-[12px] font-semibold text-encre-attenuee"
            title="Confirmée par un professionnel de santé : utilisez « Signaler une erreur » ci-dessous pour demander une correction."
          >
            Confirmée
            {information.dateConfirmation ? ` le ${formaterDate(information.dateConfirmation)}` : ""}
          </span>
        ) : motifOuvert ? (
          <form
            action={formAction}
            className="flex flex-wrap items-center gap-2"
            onSubmit={() => setMotifOuvert(false)}
          >
            <input type="hidden" name="id" value={information.id} />
            <input
              type="text"
              name="motif"
              placeholder="Motif (facultatif)"
              className="h-9 rounded-champ border border-bordure-forte bg-surface px-2 text-[13px] text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            />
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              Confirmer le retrait
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setMotifOuvert(false)}>
              Annuler
            </Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setMotifOuvert(true)}>
            Retirer
          </Button>
        )}
      </div>
    </li>
  );
}

/** Section d'une categorie simple (allergie, antecedent ou maladie chronique) : liste + ajout d'une nouvelle valeur. */
function SectionCategorieSimple({
  categorie,
  titre,
  placeholder,
  informations,
}: {
  categorie: "allergie" | "antecedent" | "maladie_chronique";
  titre: string;
  placeholder: string;
  informations: InformationDeclareeResume[];
}) {
  const [state, formAction, pending] = useActionState(ajouterInformationDeclareeAction, etatInitial);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      formRef.current?.reset();
    }
  }, [state, router]);

  const actives = informations.filter((info) => info.statut !== "retire");
  const retirees = informations.filter((info) => info.statut === "retire");

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-encre">{titre}</h3>

      {state.error ? (
        <Alert level="critical" title="Ajout impossible">
          {state.error}
        </Alert>
      ) : null}

      {actives.length === 0 && retirees.length === 0 ? (
        <p className="text-[13px] text-encre-attenuee">Aucune information enregistrée.</p>
      ) : (
        <ul className="flex flex-col">
          {[...actives, ...retirees].map((information) => (
            <LigneInformation key={information.id} information={information} />
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="categorie" value={categorie} />
        <div className="flex-1">
          <TextField label="Ajouter" name="valeur" placeholder={placeholder} required />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Ajout..." : "Ajouter"}
        </Button>
      </form>
    </div>
  );
}

/** Section des contacts d'urgence : plusieurs contacts possibles (contrairement a l'ancien champ unique). */
function SectionContactsUrgence({ informations }: { informations: InformationDeclareeResume[] }) {
  const [state, formAction, pending] = useActionState(ajouterContactUrgenceAction, etatInitial);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      formRef.current?.reset();
    }
  }, [state, router]);

  const actifs = informations.filter((info) => info.statut !== "retire");
  const retires = informations.filter((info) => info.statut === "retire");

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-encre">Contacts d&apos;urgence</h3>

      {state.error ? (
        <Alert level="critical" title="Ajout impossible">
          {state.error}
        </Alert>
      ) : null}

      {actifs.length === 0 && retires.length === 0 ? (
        <p className="text-[13px] text-encre-attenuee">Aucun contact d&apos;urgence enregistré.</p>
      ) : (
        <ul className="flex flex-col">
          {[...actifs, ...retires].map((information) => (
            <LigneInformation key={information.id} information={information} />
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-3">
        <TextField label="Nom complet" name="nom" required />
        <TextField label="Téléphone" name="telephone" type="tel" required />
        <TextField label="Lien de parenté" name="lienParente" hint="Ex. conjoint(e), parent." />
        <Button type="submit" variant="secondary" size="sm" className="w-fit sm:col-span-3" disabled={pending}>
          {pending ? "Ajout..." : "Ajouter ce contact"}
        </Button>
      </form>
    </div>
  );
}

/**
 * Informations declarees par le patient (F-CIT-04 du pack), a la place des
 * trois champs textarea et du champ contact unique auparavant reecrits d'un
 * bloc : chaque allergie, antecedent, maladie chronique ou contact
 * d'urgence est ajoute ou retire individuellement, avec historique
 * (RG-CIT-31 : un retrait ne supprime jamais, il marque et date) et
 * protection des informations confirmees par un professionnel (RG-CIT-30 :
 * pas de bouton "Retirer", seul "Signaler une erreur" plus bas dans
 * /app/patient/droits reste disponible).
 */
export function SectionInformationsDeclarees({
  informations,
}: {
  informations: Record<"allergie" | "antecedent" | "maladie_chronique" | "contact_urgence", InformationDeclareeResume[]>;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <SectionCategorieSimple
        categorie="allergie"
        titre="Allergies"
        placeholder="Ex. pénicilline"
        informations={informations.allergie}
      />
      <SectionCategorieSimple
        categorie="maladie_chronique"
        titre="Maladies chroniques"
        placeholder="Ex. diabète"
        informations={informations.maladie_chronique}
      />
      <SectionCategorieSimple
        categorie="antecedent"
        titre="Antécédents"
        placeholder="Ex. appendicectomie en 2018"
        informations={informations.antecedent}
      />
      <SectionContactsUrgence informations={informations.contact_urgence} />
    </div>
  );
}
