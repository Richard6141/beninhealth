import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ValeurMasquee } from "@/modules/pilotage/masquage";
import { Tooltip } from "@/components/ui/Tooltip";

function texteValeurMasquee(valeur: ValeurMasquee): string {
  return valeur === "< 5" ? "< 5" : String(valeur);
}

function Variation({ pourcent }: { pourcent: number | null }) {
  if (pourcent === null) {
    return <span className="text-[12px] text-encre-attenuee">Variation non disponible</span>;
  }
  if (pourcent === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-encre-attenuee">
        <Minus size={12} aria-hidden="true" />
        Stable vs période précédente
      </span>
    );
  }
  const enHausse = pourcent > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${enHausse ? "text-bon" : "text-critique"}`}>
      {enHausse ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {enHausse ? "+" : ""}
      {pourcent.toFixed(1)} % vs période précédente
    </span>
  );
}

export function CarteIndicateurNational({
  icon: Icon,
  label,
  value,
  info,
  variationPourcent,
  sansVariation,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  info: string;
  variationPourcent?: number | null;
  /** true si cette carte n'a pas de variation calculee (ex. un taux, pas un compte simple), pas la meme chose qu'un module non livre. */
  sansVariation?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-champ border border-bordure bg-plan px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
            {label}
            <Tooltip content={info} />
          </span>
          <span className="chiffres text-[22px] font-bold text-encre">{value}</span>
        </div>
      </div>
      {sansVariation ? null : <Variation pourcent={variationPourcent ?? null} />}
    </div>
  );
}

export { texteValeurMasquee };
