import type { Metadata } from "next";
import Link from "next/link";
import { VERSION_CONDITIONS } from "@/modules/identity/conditions";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

/**
 * Conditions d'utilisation (F-AUTH-01, RG-AUTH-07). Version de demonstration :
 * a faire valider juridiquement par le ministere de la Sante avant tout usage
 * reel. La version acceptee a l'inscription est enregistree avec le compte.
 */
export default function ConditionsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 text-[15px] leading-relaxed text-encre">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Version {VERSION_CONDITIONS}</p>
        <h1 className="text-[28px] font-bold text-titre">Conditions d&apos;utilisation</h1>
        <p className="text-encre-secondaire">
          Plateforme d&apos;Intelligence Sanitaire du Bénin, ministère de la Santé. Version de démonstration, à valider
          juridiquement avant tout usage réel.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">1. Objet</h2>
        <p>
          La plateforme met à votre disposition un espace santé personnel : votre dossier, vos rendez-vous, vos
          ordonnances, vos résultats et la liste des personnes et établissements qui y ont accès. Elle ne remplace pas
          une consultation médicale. En cas d&apos;urgence, contactez immédiatement les secours.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">2. Votre compte</h2>
        <p>
          Vous devez avoir au moins 15 ans pour ouvrir un compte personnel. Les informations que vous fournissez
          doivent être exactes. Vous êtes responsable de la confidentialité de votre mot de passe et des codes de
          vérification qui vous sont envoyés : ne les communiquez à personne. Un professionnel de santé ne vous demande
          jamais votre mot de passe.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">3. Accès à votre dossier</h2>
        <p>
          Un professionnel n&apos;accède à votre dossier qu&apos;avec votre accord (code, demande confirmée, autorisation)
          ou, en cas d&apos;urgence vitale, par un accès d&apos;urgence justifié, tracé et revu. Vous pouvez à tout moment
          consulter la liste des accès à votre dossier, retirer une autorisation et signaler un accès que vous ne
          reconnaissez pas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">4. Usage attendu</h2>
        <p>
          Vous vous engagez à ne pas usurper l&apos;identité d&apos;une autre personne, à ne pas tenter d&apos;accéder aux
          données d&apos;autrui et à ne pas perturber le fonctionnement de la plateforme. Tout accès est journalisé.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">5. Ordonnances électroniques</h2>
        <p>
          La confirmation d&apos;une ordonnance par un professionnel de santé (mot de passe, et le cas échéant code de
          double authentification) ne constitue pas une signature électronique qualifiée au sens juridique. Elle atteste
          l&apos;identité du prescripteur et l&apos;intégrité du contenu de l&apos;ordonnance au moment de sa création, vérifiables
          par le numéro et le code figurant sur le document.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold text-titre">6. Suspension et fermeture</h2>
        <p>
          Le ministère peut suspendre un compte en cas d&apos;usage abusif ou de suspicion de compromission. Vous pouvez
          demander la fermeture de votre compte et l&apos;exercice de vos droits depuis votre espace, rubrique
          « Mes droits ».
        </p>
      </section>

      <p className="text-[14px] text-encre-secondaire">
        Voir aussi la{" "}
        <Link href="/confidentialite" className="font-semibold text-accent hover:underline">
          politique de confidentialité
        </Link>
        .
      </p>
    </main>
  );
}
