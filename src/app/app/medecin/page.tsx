import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const messageEtatVide =
  "Aucune donnée pour l'instant, cette fonctionnalité arrive dans une prochaine phase.";

/**
 * Espace professionnel (Phase 2) : ecran generique pour tous les roles non
 * patients (medecin, infirmier, agent communautaire, pharmacien, laboratoire,
 * administrateurs). Uniquement des etats vides honnetes, aucune donnee
 * simulee ; les zones seront branchees a des donnees reelles en Phase 3+.
 */
export default function EspaceProfessionnelPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-black text-encre">
          Mon tableau de bord
        </h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Retrouvez ici vos patients du jour, vos rendez-vous et vos alertes
          dès que ces fonctionnalités seront disponibles.
        </p>
      </header>

      <section aria-labelledby="titre-activite" className="flex flex-col gap-4">
        <h2 id="titre-activite" className="text-[20px] font-bold text-encre">
          Mon activité
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            title="Patients du jour"
            description="Consultations prévues aujourd'hui."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
          <Card
            title="Rendez-vous"
            description="Planning des prochains jours."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
          <Card
            title="Alertes"
            description="Signaux nécessitant une attention."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
        </div>
      </section>
    </div>
  );
}
