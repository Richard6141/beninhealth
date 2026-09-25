import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import {
  getRendezVousDeLEtablissementDuProfessionnel,
  getRendezVousDuProfessionnel,
} from "@/modules/facility/actions";
import { ListeRendezVousProfessionnel } from "./ListeRendezVousProfessionnel";

/**
 * Ecran "Mes rendez-vous" du professionnel (Phase 4, refonte tableau) :
 * liste complete des rendez-vous du professionnel connecte, presentee en
 * tableau unique avec filtres (bouton segmente par statut) et recherche,
 * meme approche que le tableau de rendez-vous patient
 * (src/app/app/patient/rendez-vous). La modale de details, ouverte au clic
 * sur une ligne, propose confirmer/annuler pour une demande en attente,
 * demarrer la consultation pour un rendez-vous confirme (medecin
 * uniquement, voir create:consultation dans src/security/permissions.ts),
 * ou rien pour un rendez-vous termine/annule.
 */
export default async function RendezVousProfessionnelPage() {
  const session = await getSession();
  // RBAC (voir src/security/permissions.ts) : seul le medecin detient
  // create:consultation. Cette page est aussi accedee par infirmier,
  // pharmacien, laboratoire et admin_etablissement (lecture de leurs propres
  // rendez-vous), qui ne doivent jamais voir un lien menant a une action
  // qu'ils n'ont pas le droit d'effectuer.
  const peutDemarrerConsultation = session?.roles[0] === "medecin";
  // L'infirmier ne detient jamais lui-meme de rendez-vous (RendezVous.professionnelId
  // designe toujours le medecin choisi par le patient) : il voit ceux de son
  // etablissement, tous medecins confondus (F-CLI-12 du pack).
  const rendezVous = session?.roles.includes("infirmier")
    ? await getRendezVousDeLEtablissementDuProfessionnel()
    : await getRendezVousDuProfessionnel();

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
        <h1 className="text-[28px] font-black text-encre">Mes rendez-vous</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Confirmez ou annulez les demandes de rendez-vous, et demarrez une
          consultation directement depuis un rendez-vous confirme.
        </p>
      </header>

      <ListeRendezVousProfessionnel
        rendezVous={rendezVous}
        peutDemarrerConsultation={peutDemarrerConsultation}
      />
    </div>
  );
}
