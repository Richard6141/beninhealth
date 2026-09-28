"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import {
  confirmerImportEtablissementsAction,
  previsualiserImportEtablissementsAction,
  type ConfirmationImportEtablissements,
  type RapportImportEtablissements,
} from "@/modules/administration/import-etablissements";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const ETAT_PREVISUALISATION: RapportImportEtablissements = { error: null, contenuCsv: null, valides: [], invalides: [] };
const ETAT_CONFIRMATION: ConfirmationImportEtablissements = { error: null, success: false, nombreImporte: 0, invalides: [] };

/**
 * Import CSV du referentiel des etablissements (F-ADM-02, P1 explicite du
 * pack) : deux formulaires distincts (previsualisation puis confirmation),
 * jamais un import direct sur upload. Le contenu du fichier valide est porte
 * d'un formulaire a l'autre par un champ cache, pour ne jamais redemander le
 * fichier a l'utilisateur ni faire confiance a autre chose qu'une
 * revalidation complete cote serveur a la confirmation.
 */
export function ImportEtablissementsCsv() {
  const [previsualisation, actionPrevisualisation, previsualisationEnCours] = useActionState(
    previsualiserImportEtablissementsAction,
    ETAT_PREVISUALISATION
  );
  const [confirmation, actionConfirmation, confirmationEnCours] = useActionState(
    confirmerImportEtablissementsAction,
    ETAT_CONFIRMATION
  );
  if (confirmation.success) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bon-clair text-bon">
            <CheckCircle2 size={20} aria-hidden="true" />
          </span>
          <p className="text-[15px] font-bold text-encre">
            {confirmation.nombreImporte} etablissement{confirmation.nombreImporte > 1 ? "s" : ""} importe
            {confirmation.nombreImporte > 1 ? "s" : ""}, au statut « brouillon ».
          </p>
          <p className="max-w-[48ch] text-[13px] text-encre-attenuee">
            Rattachez un administrateur a chacun puis activez-le depuis le referentiel pour le rendre
            visible des citoyens.
          </p>
          {confirmation.invalides.length > 0 ? (
            <div className="mt-2 w-full max-w-xl text-left">
              <p className="text-[13px] font-semibold text-encre">
                {confirmation.invalides.length} ligne{confirmation.invalides.length > 1 ? "s" : ""} ignoree
                {confirmation.invalides.length > 1 ? "s" : ""} :
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {confirmation.invalides.map((ligne) => (
                  <li key={ligne.numeroLigne} className="text-[12.5px] text-encre-secondaire">
                    Ligne {ligne.numeroLigne} ({ligne.nomBrut || "sans nom"}) : {ligne.erreur}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={actionPrevisualisation}>
        <Card>
          <div className="flex flex-col gap-3">
            <label htmlFor="fichier-csv" className="text-[13px] font-semibold text-encre">
              Fichier CSV
            </label>
            <p className="text-[12.5px] text-encre-attenuee">
              Colonnes obligatoires : nom, type, capacite, latitude, longitude, departement, commune.
              Colonnes facultatives : services (separes par « ; »), sigle, niveauPyramide, secteur,
              arrondissement, quartierVillage, adresse, telephoneEtablissement, emailEtablissement,
              identifiantExterneDhis2.
            </p>
            <input
              id="fichier-csv"
              type="file"
              name="fichier"
              accept=".csv,text/csv"
              required
              className="text-[13px] text-encre"
            />
            {previsualisation.error ? (
              <Alert level="critical" title="Fichier refuse">
                {previsualisation.error}
              </Alert>
            ) : null}
            <Button type="submit" variant="secondary" size="sm" disabled={previsualisationEnCours}>
              <Upload size={14} aria-hidden="true" className="mr-1.5" />
              {previsualisationEnCours ? "Analyse..." : "Analyser le fichier"}
            </Button>
          </div>
        </Card>
      </form>

      {previsualisation.contenuCsv ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Alert level={previsualisation.valides.length > 0 ? "success" : "warning"} title="Lignes valides">
              {previsualisation.valides.length} ligne{previsualisation.valides.length > 1 ? "s" : ""} prete
              {previsualisation.valides.length > 1 ? "s" : ""} a etre importee
              {previsualisation.valides.length > 1 ? "s" : ""}.
            </Alert>
            {previsualisation.invalides.length > 0 ? (
              <Alert level="warning" title="Lignes refusees">
                {previsualisation.invalides.length} ligne{previsualisation.invalides.length > 1 ? "s" : ""} ne
                ser{previsualisation.invalides.length > 1 ? "ont" : "a"} pas importee
                {previsualisation.invalides.length > 1 ? "s" : ""}, voir le detail ci-dessous.
              </Alert>
            ) : null}
          </div>

          {previsualisation.invalides.length > 0 ? (
            <Card title="Lignes refusees">
              <div className="flex flex-col gap-2">
                {previsualisation.invalides.map((ligne) => (
                  <div key={ligne.numeroLigne} className="flex items-start gap-2 text-[13px]">
                    <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-critique" />
                    <p>
                      <span className="font-semibold text-encre">
                        Ligne {ligne.numeroLigne} ({ligne.nomBrut || "sans nom"})
                      </span>
                      <span className="text-encre-secondaire"> : {ligne.erreur}</span>
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {previsualisation.valides.length > 0 ? (
            <Card title="Apercu des lignes valides">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-bordure text-encre-secondaire">
                      <th className="py-1.5 pr-3 font-semibold">Ligne</th>
                      <th className="py-1.5 pr-3 font-semibold">Nom</th>
                      <th className="py-1.5 pr-3 font-semibold">Type</th>
                      <th className="py-1.5 pr-3 font-semibold">Capacite</th>
                      <th className="py-1.5 pr-3 font-semibold">Commune</th>
                      <th className="py-1.5 font-semibold">Departement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previsualisation.valides.map((ligne) => (
                      <tr key={ligne.numeroLigne} className="border-b border-bordure last:border-0">
                        <td className="py-1.5 pr-3 text-encre-attenuee">{ligne.numeroLigne}</td>
                        <td className="py-1.5 pr-3 text-encre">{ligne.nom}</td>
                        <td className="py-1.5 pr-3 text-encre">{ligne.type}</td>
                        <td className="py-1.5 pr-3 text-encre">{ligne.capacite}</td>
                        <td className="py-1.5 pr-3 text-encre">{ligne.communeNom}</td>
                        <td className="py-1.5 text-encre">{ligne.departementNom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form action={actionConfirmation} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="contenuCsv" value={previsualisation.contenuCsv} />
                {confirmation.error ? (
                  <Alert level="critical" title="Import refuse">
                    {confirmation.error}
                  </Alert>
                ) : null}
                <Button type="submit" variant="primary" size="sm" disabled={confirmationEnCours}>
                  {confirmationEnCours
                    ? "Import en cours..."
                    : `Confirmer l'import de ${previsualisation.valides.length} etablissement${previsualisation.valides.length > 1 ? "s" : ""}`}
                </Button>
              </form>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
