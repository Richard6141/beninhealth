import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Droplet,
  Mail,
  Phone,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { getFicheVerification, type FicheVerification } from "@/modules/verification/actions";
import type { NomRole } from "@/types";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface VerificationPageProps {
  params: Promise<{ userId: string }>;
}

const libellesRole: Record<NomRole, string> = {
  patient: "Patient",
  medecin: "Médecin",
  infirmier: "Infirmier",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administrateur d'établissement",
  admin_national: "Administrateur national",
};

function libelleStatutValidation(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "valide") return { texte: "Validé", tone: "good" };
  if (cle === "en_attente") return { texte: "En attente", tone: "warning" };
  if (cle === "rejete") return { texte: "Rejeté", tone: "critical" };
  if (cle === "suspendu") return { texte: "Suspendu", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

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

function TuileInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="truncate text-[15px] font-bold text-encre">{value}</span>
      </div>
    </div>
  );
}

function FichePatient({
  fiche,
}: {
  fiche: Extract<FicheVerification, { type: "patient" }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Alert level="warning" title="Informations médicales sensibles">
        Ces informations sont destinées à un professionnel de santé autorisé.
        Ne les partagez pas au-delà de ce cadre.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileInfo icon={UserRound} label="Identifiant santé" value={fiche.identifiantSante} />
        <TuileInfo icon={UserRound} label="Né(e) le" value={formaterDate(fiche.dateNaissance)} />
        <TuileInfo icon={UserRound} label="Sexe" value={fiche.sexe === "M" ? "Homme" : "Femme"} />
        <TuileInfo icon={Droplet} label="Groupe sanguin" value={fiche.groupeSanguin || "Inconnu"} />
      </div>

      <Card
        title="Allergies"
        className={fiche.allergies.length > 0 ? "border-vigilance bg-vigilance-clair" : undefined}
        actions={
          fiche.allergies.length > 0 ? (
            <TriangleAlert size={18} className="text-vigilance" aria-hidden="true" />
          ) : undefined
        }
      >
        {fiche.allergies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {fiche.allergies.map((allergie) => (
              <Badge key={allergie} tone="warning">
                {allergie}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-encre-attenuee">Aucune allergie connue.</p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Maladies chroniques">
          {fiche.maladiesChroniques.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-encre">
              {fiche.maladiesChroniques.map((maladie) => (
                <li key={maladie}>{maladie}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-encre-attenuee">Aucune maladie chronique connue.</p>
          )}
        </Card>
        <Card title="Antécédents">
          {fiche.antecedents.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-encre">
              {fiche.antecedents.map((antecedent) => (
                <li key={antecedent}>{antecedent}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-encre-attenuee">Aucun antécédent connu.</p>
          )}
        </Card>
      </div>

      <Card title="Contacts d'urgence">
        {fiche.contactsUrgence.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {fiche.contactsUrgence.map((contact) => (
              <li
                key={`${contact.nom}-${contact.telephone}`}
                className="flex items-start gap-3 border-b border-bordure pb-3 last:border-0 last:pb-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
                  <Phone size={16} aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="font-semibold text-encre">{contact.nom}</span>
                  <span className="text-[13px] text-encre-secondaire">{contact.lienParente}</span>
                  <span className="text-[14px] text-encre">{contact.telephone}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-encre-attenuee">Aucun contact d&apos;urgence enregistré.</p>
        )}
      </Card>
    </div>
  );
}

function FicheProfessionnel({
  fiche,
}: {
  fiche: Extract<FicheVerification, { type: "professionnel" }>;
}) {
  const statut = libelleStatutValidation(fiche.statutValidation);

  return (
    <Card
      title="Badge professionnel"
      description="Identité vérifiée sur la plateforme officielle du ministère de la Santé."
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TuileInfo icon={Stethoscope} label="Rôle" value={libellesRole[fiche.role]} />
        <TuileInfo icon={ShieldAlert} label="Spécialité" value={fiche.specialite} />
        <TuileInfo icon={UserRound} label="Numéro professionnel" value={fiche.numeroProfessionnel} />
        <TuileInfo icon={Building2} label="Établissement" value={fiche.etablissementNom} />
      </div>
    </Card>
  );
}

function FicheCompte({ fiche }: { fiche: Extract<FicheVerification, { type: "compte" }> }) {
  return (
    <Card
      title="Compte vérifié"
      description="Identité vérifiée sur la plateforme officielle du ministère de la Santé."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TuileInfo icon={Stethoscope} label="Rôle" value={libellesRole[fiche.role]} />
        {fiche.email ? <TuileInfo icon={Mail} label="Email" value={fiche.email} /> : null}
      </div>
    </Card>
  );
}

/**
 * Fiche de vérification affichée après le scan du QR code personnel d'un
 * compte (voir getMonQrCode, /app/profil). Le contenu varie selon le type de
 * compte cible (getFicheVerification, module verification) : dossier médical
 * essentiel pour un patient (accès conditionné à un Consentement actif ou à
 * la consultation de sa propre fiche), badge de vérification pour un
 * professionnel ou un compte administratif (aucune donnée médicale, visible
 * par tout utilisateur authentifié).
 */
export default async function VerificationPage({ params }: VerificationPageProps) {
  const { userId } = await params;
  const fiche = await getFicheVerification(userId);

  if (!fiche) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-10 sm:px-6">
        <Alert level="critical" title="Fiche introuvable ou accès non autorisé">
          Ce compte n&apos;existe pas, ou vous n&apos;êtes pas autorisé à
          consulter ses informations. Pour un patient, un consentement actif
          de sa part est nécessaire.
        </Alert>
      </div>
    );
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Vérification d&apos;identité
        </p>
        <h1 className="text-[28px] font-bold text-titre">{fiche.nomComplet}</h1>
      </header>

      {fiche.type === "patient" ? <FichePatient fiche={fiche} /> : null}
      {fiche.type === "professionnel" ? <FicheProfessionnel fiche={fiche} /> : null}
      {fiche.type === "compte" ? <FicheCompte fiche={fiche} /> : null}
    </div>
  );
}
