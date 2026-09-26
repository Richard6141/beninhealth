import Link from "next/link";
import { ArrowLeft, Eye, ShieldCheck, UserCheck } from "lucide-react";
import { getMesAccesDossier } from "@/modules/patient/actions";
import { Card } from "@/components/ui/Card";
import { ListeAccesDossier } from "./ListeAccesDossier";

/**
 * Ecran "Qui a consulté mon dossier" (F-CIT-12 du cahier des charges,
 * RG-CIT-100/101) : historique en lecture seule des accès d'un tiers au
 * dossier du patient connecté, regroupés par personne et par jour, avec
 * filtre par type d'accès et signalement d'un accès non reconnu. N'inclut
 * jamais les propres consultations du patient sur son dossier (RG-CIT-21).
 *
 * Limite assumée : aucun mécanisme de "bris de glace" (accès d'urgence)
 * n'existe dans ce dépôt, donc aucune ligne n'est mise en évidence comme
 * telle (voir docs/audit-cote-medecin.md, F-CLI-09 à 14).
 */
export default async function AccesPage() {
  const acces = await getMesAccesDossier();

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
        <h1 className="text-[28px] font-bold text-titre">Qui a consulté mon dossier</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          L&apos;historique de tous les accès à votre dossier par un
          professionnel de santé, en dehors de vos propres consultations.
        </p>
      </header>

      <section aria-labelledby="titre-principe" className="flex flex-col gap-4">
        <h2 id="titre-principe" className="sr-only">
          Comment fonctionne cet historique
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <div className="flex flex-col gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-clair text-accent">
                <Eye size={20} aria-hidden="true" />
              </span>
              <p className="text-[15px] font-bold text-encre">Chaque accès est tracé</p>
              <p className="text-[13px] text-encre-secondaire">
                Dès qu&apos;un professionnel consulte une information vous
                concernant, une trace est enregistrée dans le journal d&apos;audit
                de la plateforme.
              </p>
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-clair text-accent">
                <UserCheck size={20} aria-hidden="true" />
              </span>
              <p className="text-[15px] font-bold text-encre">Uniquement les autres</p>
              <p className="text-[13px] text-encre-secondaire">
                Vos propres visites de votre tableau de bord n&apos;apparaissent
                pas ici : seuls les accès d&apos;un tiers sont affichés.
              </p>
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-clair text-accent">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <p className="text-[15px] font-bold text-encre">Toujours avec votre accord</p>
              <p className="text-[13px] text-encre-secondaire">
                Un accès n&apos;est possible que si vous avez autorisé ce
                professionnel (voir « Mes autorisations d&apos;accès »).
              </p>
            </div>
          </Card>
        </div>
      </section>

      <section aria-label="Historique des accès" className="flex flex-col gap-4">
        <ListeAccesDossier acces={acces} />
      </section>
    </div>
  );
}
