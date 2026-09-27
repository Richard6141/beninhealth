import type { Metadata } from "next";
import Link from "next/link";
import { VERSION_CONDITIONS } from "@/modules/identity/conditions";

export const metadata: Metadata = { title: "Politique de confidentialité" };

/**
 * Politique de confidentialite (F-AUTH-01, RG-AUTH-07). Version de
 * demonstration, a faire valider par le ministere de la Sante et par l'APDP
 * (Autorite de protection des donnees personnelles) avant tout usage reel.
 */
export default function ConfidentialitePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 text-[15px] leading-relaxed text-encre">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Version {VERSION_CONDITIONS}</p>
        <h1 className="text-[28px] font-bold text-titre">Politique de confidentialité</h1>
        <p className="text-encre-secondaire">
          Ministère de la Santé de la République du Bénin. Version de démonstration, à valider avec l&apos;APDP avant
          tout usage réel.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">Données que nous traitons</h2>
        <p>
          Votre identité (nom, prénoms, date de naissance, sexe), vos coordonnées (téléphone, e-mail), vos données de
          santé (consultations, ordonnances, examens, vaccinations, documents) et les traces de sécurité (connexions,
          accès à votre dossier). Les données de santé sont des données sensibles.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">Pourquoi</h2>
        <p>
          Assurer la continuité de vos soins, vous permettre de suivre votre parcours de santé, protéger votre compte et
          produire des statistiques sanitaires nationales. Les indicateurs du ministère sont agrégés : ils ne
          contiennent jamais de données nominatives, et les groupes sensibles ne sont comptés qu&apos;au niveau du
          département.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">Qui peut voir votre dossier</h2>
        <p>
          Uniquement les professionnels que vous autorisez ou, en urgence vitale, un professionnel qui justifie
          l&apos;accès (tracé et revu). Chaque accès est enregistré dans un journal que vous pouvez consulter.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">Vos droits</h2>
        <p>
          Vous pouvez demander l&apos;accès à vos données, leur rectification, leur export ou l&apos;exercice de votre
          droit d&apos;opposition depuis votre espace, rubrique « Mes droits ». Une réponse vous est apportée dans un
          délai de 30 jours.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">Sécurité et conservation</h2>
        <p>
          Les mots de passe sont stockés sous forme irréversible, la double authentification protège les comptes
          professionnels, les échanges sont chiffrés. Les données de santé sont conservées pendant la durée prévue par la
          réglementation sanitaire en vigueur.
        </p>
      </section>

      <p className="text-[14px] text-encre-secondaire">
        Voir aussi les{" "}
        <Link href="/conditions" className="font-semibold text-accent hover:underline">
          conditions d&apos;utilisation
        </Link>
        .
      </p>
    </main>
  );
}
