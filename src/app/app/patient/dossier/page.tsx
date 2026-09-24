import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  Phone,
  Stethoscope,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { getMonDossierPatient } from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireDossier } from "./FormulaireDossier";

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

function ListeOuVide({
  elements,
  messageVide,
  tonBadge,
}: {
  elements: string[];
  messageVide: string;
  tonBadge?: BadgeTone;
}) {
  if (elements.length === 0) {
    return <p className="text-[13px] text-encre-attenuee">{messageVide}</p>;
  }
  if (tonBadge) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {elements.map((element) => (
          <Badge key={element} tone={tonBadge}>
            {element}
          </Badge>
        ))}
      </div>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-[14px] text-encre">
      {elements.map((element) => (
        <li key={element}>{element}</li>
      ))}
    </ul>
  );
}

/** Titre de section avec icône, pour marquer clairement les trois regroupements
 * logiques du dossier : identité, santé, contacts. */
function TitreSection({
  icon: Icon,
  id,
  children,
}: {
  icon: LucideIcon;
  id: string;
  children: string;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-[20px] font-bold text-encre">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      {children}
    </h2>
  );
}

function EtatVide({
  icon: Icon,
  titre,
  description,
  phase,
}: {
  icon: LucideIcon;
  titre: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">{titre}</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">{description}</p>
      <Badge tone="info">{phase}</Badge>
    </div>
  );
}

/**
 * Ecran "dossier santé" complet (Phase 3, Partie 4 §7 du cahier des charges) :
 * lecture détaillée du résumé santé (getMonDossierPatient), regroupée en
 * trois blocs logiques (identité, santé, contacts), puis formulaire
 * d'édition branché sur updatePatientProfileAction. Consultations et
 * documents restent des états vides honnêtes (Phase 4/5).
 */
export default async function DossierPatientPage() {
  const dossier = await getMonDossierPatient();

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
        <h1 className="text-[28px] font-black text-encre">Mon dossier santé</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Retrouvez et mettez à jour les informations de santé qui vous
          concernent.
        </p>
      </header>

      {dossier ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <section
              aria-labelledby="titre-identite"
              className="flex flex-col gap-4 lg:col-span-2"
            >
              <TitreSection icon={UserRound} id="titre-identite">
                Identité et informations générales
              </TitreSection>
              <Card className="flex-1">
                <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Identifiant santé
                    </dt>
                    <dd className="mt-1.5 text-[15px] text-encre">
                      {dossier.identifiantSante}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Date de naissance
                    </dt>
                    <dd className="mt-1.5 text-[15px] text-encre">
                      {formaterDate(dossier.dateNaissance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Sexe
                    </dt>
                    <dd className="mt-1.5 text-[15px] text-encre">
                      {dossier.sexe === "M" ? "Homme" : "Femme"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-semibold text-encre-secondaire">
                      Groupe sanguin
                    </dt>
                    <dd className="mt-1.5">
                      <Badge tone="accent">{dossier.groupeSanguin || "Inconnu"}</Badge>
                    </dd>
                  </div>
                </dl>
              </Card>
            </section>

            <section aria-labelledby="titre-urgence" className="flex flex-col gap-4">
              <TitreSection icon={Phone} id="titre-urgence">
                Contacts d&apos;urgence
              </TitreSection>
              <Card className="flex-1">
                {dossier.contactsUrgence.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {dossier.contactsUrgence.map((contact) => (
                      <li
                        key={`${contact.nom}-${contact.telephone}`}
                        className="flex flex-col gap-0.5 border-b border-bordure pb-3 last:border-0 last:pb-0"
                      >
                        <span className="font-semibold text-encre">{contact.nom}</span>
                        <span className="text-[13px] text-encre-secondaire">
                          {contact.lienParente}
                        </span>
                        <span className="text-[14px] text-encre">{contact.telephone}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-encre-attenuee">
                    Aucun contact d&apos;urgence enregistré. Ajoutez-en un
                    ci-dessous : il pourra être contacté en cas d&apos;urgence
                    médicale.
                  </p>
                )}
              </Card>
            </section>
          </div>

          <section aria-labelledby="titre-sante" className="flex flex-col gap-4">
            <TitreSection icon={Stethoscope} id="titre-sante">
              Informations médicales
            </TitreSection>
            <div className="grid gap-4 md:grid-cols-3">
              <Card
                title="Allergies"
                description="Substances ou éléments à éviter."
                className={
                  dossier.allergies.length > 0
                    ? "border-vigilance bg-vigilance-clair"
                    : undefined
                }
                actions={
                  dossier.allergies.length > 0 ? (
                    <TriangleAlert size={18} className="text-vigilance" aria-hidden="true" />
                  ) : undefined
                }
              >
                <ListeOuVide
                  elements={dossier.allergies}
                  messageVide="Aucune allergie connue."
                  tonBadge="warning"
                />
              </Card>
              <Card title="Maladies chroniques" description="Suivi au long cours.">
                <ListeOuVide
                  elements={dossier.maladiesChroniques}
                  messageVide="Aucune maladie chronique connue."
                />
              </Card>
              <Card title="Antécédents" description="Antécédents médicaux et chirurgicaux.">
                <ListeOuVide
                  elements={dossier.antecedents}
                  messageVide="Aucun antécédent connu."
                />
              </Card>
            </div>
          </section>
        </>
      ) : (
        <Alert level="info" title="Aucun dossier patient associé">
          Votre compte n&apos;est pas encore relié à un dossier patient. Cette
          page s&apos;activera dès qu&apos;un dossier sera créé.
        </Alert>
      )}

      <section aria-labelledby="titre-historique" className="flex flex-col gap-4">
        <TitreSection icon={FileText} id="titre-historique">
          Historique et documents
        </TitreSection>
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title="Consultations passées"
            description="Historique de vos consultations."
            actions={<Badge tone="info">Phase 4</Badge>}
          >
            <EtatVide
              icon={Stethoscope}
              titre="Aucune consultation enregistrée"
              description="L'historique de vos consultations apparaîtra ici dès que le module Consultations sera disponible."
              phase="Phase 4"
            />
          </Card>
          <Card
            title="Documents médicaux"
            description="Résultats, comptes-rendus, imagerie."
            actions={<Badge tone="info">Phase 5</Badge>}
          >
            <EtatVide
              icon={FolderOpen}
              titre="Aucun document disponible"
              description="Vos résultats d'examens et comptes-rendus seront consultables ici en phase 5 du projet."
              phase="Phase 5"
            />
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-edition" className="flex flex-col gap-4">
        <h2 id="titre-edition" className="text-[20px] font-bold text-encre">
          Mettre à jour mes informations
        </h2>
        <Card description="Ces informations sont utilisées par les professionnels de santé autorisés pour mieux vous prendre en charge.">
          <FormulaireDossier dossier={dossier} />
        </Card>
      </section>
    </div>
  );
}
