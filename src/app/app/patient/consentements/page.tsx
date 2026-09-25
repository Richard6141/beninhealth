import Link from "next/link";
import { ArrowLeft, Eye, ShieldCheck, UserCheck } from "lucide-react";
import {
  getMesConsentements,
  listProfessionnelsDisponibles,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { ListeConsentements } from "./ListeConsentements";
import { FormulaireNouveauConsentement } from "./FormulaireNouveauConsentement";

const principesConsentement = [
  {
    icon: UserCheck,
    titre: "Vous choisissez qui",
    texte:
      "Seuls les professionnels de santé validés par le ministère peuvent recevoir un accès, et uniquement ceux que vous sélectionnez vous-même.",
  },
  {
    icon: Eye,
    titre: "Vous choisissez quoi",
    texte:
      "Chaque accès porte sur un type d'information précis (dossier complet, consultations, prescriptions, examens ou documents), jamais un accès global par défaut.",
  },
  {
    icon: ShieldCheck,
    titre: "Vous gardez la main",
    texte:
      "Vous pouvez retirer un accès à tout moment. Chaque octroi et chaque retrait est tracé dans le journal d'audit de la plateforme.",
  },
];

/**
 * Ecran de gestion du consentement (Phase 3) : liste des accès actuellement
 * accordés (getMesConsentements) et formulaire pour en accorder un nouveau
 * (listProfessionnelsDisponibles + grantConsentAction). Le retrait d'accès
 * (revokeConsentAction) est géré dans ListeConsentements, avec confirmation
 * via Modal avant soumission.
 */
export default async function ConsentementsPage() {
  const [consentements, professionnels] = await Promise.all([
    getMesConsentements(),
    listProfessionnelsDisponibles(),
  ]);

  const consentementsActifs = consentements.filter((c) => c.statutEffectif === "actif");

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
        <h1 className="text-[28px] font-black text-encre">
          Gérer mes autorisations d&apos;accès
        </h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Vous gardez le contrôle total de votre dossier : vous décidez qui
          peut y accéder, pour quel type d&apos;information, et vous pouvez
          retirer cet accès à tout moment.
        </p>
      </header>

      <section aria-labelledby="titre-principe" className="flex flex-col gap-4">
        <h2 id="titre-principe" className="text-[20px] font-bold text-encre">
          Comment fonctionne le consentement
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {principesConsentement.map((principe) => (
            <Card key={principe.titre}>
              <div className="flex flex-col gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-clair text-accent">
                  <principe.icon size={20} aria-hidden="true" />
                </span>
                <p className="text-[15px] font-bold text-encre">{principe.titre}</p>
                <p className="text-[13px] text-encre-secondaire">{principe.texte}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section
          aria-labelledby="titre-consentements"
          className="flex flex-col gap-4 lg:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titre-consentements" className="text-[20px] font-bold text-encre">
              Accès actuellement accordés
            </h2>
            <span className="text-[13px] font-semibold text-encre-secondaire">
              {consentementsActifs.length}{" "}
              {consentementsActifs.length > 1 ? "accès actifs" : "accès actif"}
            </span>
          </div>
          <ListeConsentements consentements={consentements} />
        </section>

        <section aria-labelledby="titre-nouveau" className="flex flex-col gap-4">
          <h2 id="titre-nouveau" className="text-[20px] font-bold text-encre">
            Accorder un nouvel accès
          </h2>
          {professionnels.length > 0 ? (
            <FormulaireNouveauConsentement professionnels={professionnels} />
          ) : (
            <Alert level="info" title="Aucun professionnel disponible">
              Aucun professionnel de santé n&apos;est disponible pour le
              moment.
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
