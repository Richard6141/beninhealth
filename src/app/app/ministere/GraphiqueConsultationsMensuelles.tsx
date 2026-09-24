"use client";

import { useEffect, useState } from "react";
import type { PointMensuel } from "@/modules/analytics/actions";
import { formaterMoisComplet, formaterMoisCourt } from "./lib";

export interface GraphiqueConsultationsMensuellesProps {
  donnees: PointMensuel[];
}

/**
 * Graphique en barres simple (HTML/Tailwind pur, aucune librairie) pour une
 * serie mensuelle a une seule valeur : les consultations des 6 derniers mois.
 * Une seule teinte (bg-accent), barres fines ancrees sur une ligne de base
 * commune, etiquette de valeur directe au-dessus de chaque barre, infobulle
 * native (title) et libelle de mois court en dessous. L'apparition des
 * barres est animee (hauteur 0 -> valeur), coupee sous prefers-reduced-motion
 * via motion-reduce:transition-none. Une alternative accessible identique en
 * donnees est fournie sous forme de tableau, repliee dans un <details>.
 */
export function GraphiqueConsultationsMensuelles({
  donnees,
}: GraphiqueConsultationsMensuellesProps) {
  const [apparu, setApparu] = useState(false);

  useEffect(() => {
    const identifiant = requestAnimationFrame(() => setApparu(true));
    return () => cancelAnimationFrame(identifiant);
  }, []);

  const maximum = Math.max(1, ...donnees.map((point) => point.total));

  if (donnees.length === 0) {
    return (
      <p className="text-[13px] text-encre-attenuee">
        Aucune donnee de consultation disponible pour le moment.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-48 items-end gap-0.5 border-b border-bordure-forte pb-0 sm:h-56">
        {donnees.map((point) => {
          const pourcentage = (point.total / maximum) * 100;
          const libelleComplet = formaterMoisComplet(point.mois);
          return (
            <div
              key={point.mois}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="chiffres text-[12px] font-semibold text-encre">
                {point.total}
              </span>
              <div
                title={`${libelleComplet} : ${point.total} consultation${point.total > 1 ? "s" : ""}`}
                style={{ height: apparu ? `${Math.max(pourcentage, point.total > 0 ? 2 : 0)}%` : "0%" }}
                className="w-full max-w-[32px] rounded-t-[4px] bg-accent transition-[height] duration-500 ease-out motion-reduce:transition-none"
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 pt-1.5">
        {donnees.map((point) => (
          <span
            key={point.mois}
            className="flex-1 truncate text-center text-[11px] text-encre-attenuee"
          >
            {formaterMoisCourt(point.mois)}
          </span>
        ))}
      </div>

      <details className="mt-4">
        <summary className="w-fit cursor-pointer text-[13px] font-semibold text-accent hover:underline">
          Voir les donnees du graphique en tableau
        </summary>
        <table className="mt-3 w-full text-left text-[13px]">
          <caption className="sr-only">
            Nombre de consultations par mois, 6 derniers mois
          </caption>
          <thead>
            <tr className="border-b border-bordure text-encre-secondaire">
              <th scope="col" className="py-1.5 pr-4 font-semibold">
                Mois
              </th>
              <th scope="col" className="py-1.5 font-semibold">
                Consultations
              </th>
            </tr>
          </thead>
          <tbody>
            {donnees.map((point) => (
              <tr key={point.mois} className="border-b border-bordure last:border-0">
                <td className="py-1.5 pr-4 text-encre">{formaterMoisComplet(point.mois)}</td>
                <td className="chiffres py-1.5 text-encre">{point.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
