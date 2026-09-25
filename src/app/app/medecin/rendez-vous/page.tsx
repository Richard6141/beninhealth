import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import {
  getRendezVousDuProfessionnel,
  type RendezVousResume,
} from "@/modules/facility/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { ActionsRendezVousAttente } from "./ActionsRendezVousAttente";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "En attente de confirmation", tone: "warning" };
  if (cle === "confirme") return { texte: "Confirme", tone: "good" };
  if (cle === "termine") return { texte: "Termine", tone: "neutral" };
  if (cle === "annule") return { texte: "Annule", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
}

/** Bouton de navigation stylise comme un Button primaire, mais rendu comme un lien unique (pas de bouton imbrique dans un lien). */
function LienDemarrerConsultation({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-champ bg-accent px-3 text-[13px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      Demarrer la consultation
    </Link>
  );
}

function CarteRendezVousAttente({ rendezVous }: { rendezVous: RendezVousResume }) {
  const statut = libelleStatut(rendezVous.statut);

  return (
    <Card
      className="border-vigilance bg-vigilance-clair"
      title={rendezVous.patientNomComplet ?? "Patient non precise"}
      description={rendezVous.motif}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] font-semibold text-encre">
          {formaterDateHeure(rendezVous.date)}
        </p>
        <p className="text-[13px] text-encre-secondaire">{rendezVous.etablissementNom}</p>
        <ActionsRendezVousAttente
          rendezVousId={rendezVous.id}
          patientNomComplet={rendezVous.patientNomComplet}
        />
      </div>
    </Card>
  );
}

function CarteRendezVousConfirme({
  rendezVous,
  peutDemarrerConsultation,
}: {
  rendezVous: RendezVousResume;
  peutDemarrerConsultation: boolean;
}) {
  const statut = libelleStatut(rendezVous.statut);

  return (
    <Card
      title={rendezVous.patientNomComplet ?? "Patient non precise"}
      description={rendezVous.motif}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] font-semibold text-encre">
          {formaterDateHeure(rendezVous.date)}
        </p>
        <p className="text-[13px] text-encre-secondaire">{rendezVous.etablissementNom}</p>
        {peutDemarrerConsultation ? (
          <LienDemarrerConsultation
            href={`/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(
              rendezVous.patientId
            )}&rendezVousId=${encodeURIComponent(rendezVous.id)}`}
          />
        ) : null}
      </div>
    </Card>
  );
}

function CarteRendezVousHistorique({ rendezVous }: { rendezVous: RendezVousResume }) {
  const statut = libelleStatut(rendezVous.statut);

  return (
    <Card
      title={rendezVous.patientNomComplet ?? "Patient non precise"}
      description={rendezVous.motif}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <p className="text-[14px] text-encre">{formaterDateHeure(rendezVous.date)}</p>
      <p className="text-[13px] text-encre-secondaire">{rendezVous.etablissementNom}</p>
    </Card>
  );
}

/**
 * Ecran "Mes rendez-vous" du professionnel (Phase 4) : liste complete des
 * rendez-vous du professionnel connecte (getRendezVousDuProfessionnel),
 * groupee par statut. Les demandes en attente sont mises en avant en premier
 * (action requise : confirmer ou annuler), puis les rendez-vous confirmes
 * (avec un lien vers le demarrage de la consultation), puis un historique des
 * rendez-vous termines ou annules.
 */
export default async function RendezVousProfessionnelPage() {
  const session = await getSession();
  // RBAC (voir src/security/permissions.ts) : seul le medecin detient
  // create:consultation. Cette page est aussi accedee par infirmier,
  // pharmacien, laboratoire et admin_etablissement (lecture de leurs propres
  // rendez-vous), qui ne doivent jamais voir un lien menant a une action
  // qu'ils n'ont pas le droit d'effectuer.
  const peutDemarrerConsultation = session?.roles[0] === "medecin";
  const rendezVous = await getRendezVousDuProfessionnel();

  const enAttente = rendezVous.filter((rdv) => rdv.statut === "demande");
  const confirmes = rendezVous.filter((rdv) => rdv.statut === "confirme");
  const historique = rendezVous.filter(
    (rdv) => rdv.statut === "termine" || rdv.statut === "annule"
  );

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-black text-encre">Mes rendez-vous</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Confirmez ou annulez les demandes de rendez-vous, et demarrez une
          consultation directement depuis un rendez-vous confirme.
        </p>
      </header>

      <section aria-labelledby="titre-attente" className="flex flex-col gap-4">
        <h2 id="titre-attente" className="text-[20px] font-bold text-encre">
          En attente de confirmation
        </h2>
        {enAttente.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucune demande de rendez-vous en attente de confirmation.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {enAttente.map((rdv) => (
              <CarteRendezVousAttente key={rdv.id} rendezVous={rdv} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="titre-confirmes" className="flex flex-col gap-4">
        <h2 id="titre-confirmes" className="text-[20px] font-bold text-encre">
          Rendez-vous confirmes
        </h2>
        {confirmes.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucun rendez-vous confirme pour le moment.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {confirmes.map((rdv) => (
              <CarteRendezVousConfirme
                key={rdv.id}
                rendezVous={rdv}
                peutDemarrerConsultation={peutDemarrerConsultation}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="titre-historique" className="flex flex-col gap-4">
        <h2 id="titre-historique" className="text-[20px] font-bold text-encre">
          Historique
        </h2>
        {historique.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucun rendez-vous termine ou annule pour le moment.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {historique.map((rdv) => (
              <CarteRendezVousHistorique key={rdv.id} rendezVous={rdv} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
