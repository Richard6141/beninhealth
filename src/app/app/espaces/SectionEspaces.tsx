"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { changerEspaceAction, type ChangementEspaceState } from "@/modules/identity/espaces";
import type { EspaceUtilisateur } from "@/modules/identity/espaces-regles";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const ETAT_INITIAL: ChangementEspaceState = { error: null, success: false };

const ICONES: Record<string, LucideIcon> = {
  patient: HeartPulse,
  admin_national: ShieldCheck,
  admin_etablissement: Building2,
};

function CarteEspace({ espace }: { espace: EspaceUtilisateur }) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(changerEspaceAction, ETAT_INITIAL);
  const Icone = ICONES[espace.role] ?? Stethoscope;

  useEffect(() => {
    if (etat.success && etat.redirection) {
      router.push(etat.redirection);
      router.refresh();
    }
  }, [etat.success, etat.redirection, router]);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine">
            <Icone size={20} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[16px] font-semibold text-encre">{espace.libelle}</p>
            {espace.etablissementNom ? (
              <p className="text-[13px] text-encre-secondaire">{espace.etablissementNom}</p>
            ) : null}
          </div>
          {espace.actif ? (
            <Badge tone="good" className="ml-auto shrink-0">
              Espace actif
            </Badge>
          ) : null}
        </div>

        {etat.error ? (
          <Alert level="critical" title="Changement impossible">
            {etat.error}
          </Alert>
        ) : null}

        {espace.actif ? (
          <a href={espace.accueil} className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-accent hover:underline">
            <CheckCircle2 size={15} aria-hidden="true" />
            Ouvrir cet espace
          </a>
        ) : (
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="espace" value={espace.role} />
            <p className="text-[12px] text-encre-attenuee">
              Les saisies non enregistrées dans l&apos;espace actuel seront perdues.
            </p>
            <Button type="submit" variant="primary" className="w-fit" disabled={enCours}>
              {enCours ? "Changement..." : "Passer à cet espace"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

export function SectionEspaces({ espaces }: { espaces: EspaceUtilisateur[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {espaces.map((espace) => (
        <CarteEspace key={espace.role} espace={espace} />
      ))}
    </div>
  );
}
