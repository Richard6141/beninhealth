import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

const messageEtatVide =
  "Aucune donnée pour l'instant, cette fonctionnalité arrive dans une prochaine phase.";

const actionsRapides = [
  { label: "Prendre rendez-vous" },
  { label: "Consulter mon dossier" },
  { label: "Voir mes traitements" },
];

/**
 * Tableau de bord patient (Phase 2) : uniquement des etats vides honnetes,
 * aucune donnee simulee. Les zones (rendez-vous, traitements, documents) et
 * les actions rapides seront branchees a des donnees reelles en Phase 3+.
 */
export default function PatientPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace patient
        </p>
        <h1 className="text-[28px] font-black text-encre">
          Mon tableau de bord
        </h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Retrouvez ici vos rendez-vous, vos traitements et vos documents
          dès que ces fonctionnalités seront disponibles.
        </p>
      </header>

      <section aria-labelledby="titre-suivi" className="flex flex-col gap-4">
        <h2 id="titre-suivi" className="text-[20px] font-bold text-encre">
          Mon suivi
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            title="Prochains rendez-vous"
            description="Consultations planifiées."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
          <Card
            title="Traitements actifs"
            description="Prescriptions en cours."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
          <Card
            title="Documents récents"
            description="Résultats et comptes-rendus."
            actions={<Badge tone="info">Phase 3</Badge>}
          >
            <p className="text-[13px] text-encre-attenuee">{messageEtatVide}</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-actions" className="flex flex-col gap-4">
        <h2 id="titre-actions" className="text-[20px] font-bold text-encre">
          Actions rapides
        </h2>
        <Card description="Ces actions seront activées au fil des prochaines phases.">
          <div className="flex flex-wrap gap-4">
            {actionsRapides.map((action) => (
              <div key={action.label} className="flex items-center gap-2">
                <Button variant="secondary" disabled>
                  {action.label}
                </Button>
                <Tooltip
                  content="Bientôt disponible"
                  label={`${action.label} : bientôt disponible`}
                />
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
