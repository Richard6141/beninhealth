import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DashboardMedecin } from "./DashboardMedecin";
import { DashboardInfirmier } from "./DashboardInfirmier";
import { DashboardPharmacien } from "./DashboardPharmacien";
import { DashboardLaboratoire } from "./DashboardLaboratoire";
import { DashboardCommunautaire } from "./DashboardCommunautaire";

/**
 * Point d'entrée "/app/medecin" : chaque rôle professionnel possède
 * désormais son propre tableau de bord, entièrement distinct en contenu et
 * en mise en page (DashboardMedecin, DashboardInfirmier, DashboardPharmacien,
 * DashboardLaboratoire, DashboardCommunautaire), plutôt qu'un seul écran
 * générique partagé filtré par conditions. Un rôle qui possède son propre
 * espace dédié ailleurs (patient, admin_etablissement, admin_national) est
 * redirigé vers celui-ci en cas d'accès direct à cette URL.
 */
export default async function EspaceProfessionnelPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  switch (session.roles[0]) {
    case "medecin":
      return <DashboardMedecin />;
    case "infirmier":
      return <DashboardInfirmier />;
    case "pharmacien":
      return <DashboardPharmacien />;
    case "laboratoire":
      return <DashboardLaboratoire />;
    case "agent_communautaire":
      return <DashboardCommunautaire />;
    case "patient":
      redirect("/app/patient");
    case "admin_etablissement":
      redirect("/app/etablissement");
    case "admin_national":
      redirect("/app/ministere");
    default:
      redirect("/connexion");
  }
}
