import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Porte d'entree de la plateforme : ne rend jamais de JSX visible, oriente
 * uniquement vers l'ecran pertinent selon l'etat de la session.
 *
 * - Pas de session : ecran de connexion.
 * - Session avec le role patient : tableau de bord patient.
 * - Session avec le role admin_national : tableau de bord ministere.
 * - Session avec le role admin_etablissement : tableau de bord etablissement.
 * - Session avec un autre role : espace professionnel.
 */
export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (session.roles.includes("patient")) {
    redirect("/app/patient");
  }

  if (session.roles.includes("admin_national")) {
    redirect("/app/ministere");
  }

  if (session.roles.includes("admin_etablissement")) {
    redirect("/app/etablissement");
  }

  redirect("/app/medecin");
}
