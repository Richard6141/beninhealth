"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ProcheResume } from "@/modules/proches/actions";
import { Card } from "@/components/ui/Card";

function age(dateNaissanceIso: string): number {
  const naissance = new Date(dateNaissanceIso);
  const maintenant = new Date();
  let ans = maintenant.getFullYear() - naissance.getFullYear();
  const anniversairePasse =
    maintenant.getMonth() > naissance.getMonth() ||
    (maintenant.getMonth() === naissance.getMonth() && maintenant.getDate() >= naissance.getDate());
  if (!anniversairePasse) ans -= 1;
  return ans;
}

export interface ListeProchesProps {
  proches: ProcheResume[];
}

export function ListeProches({ proches }: ListeProchesProps) {
  if (proches.length === 0) {
    return (
      <Card>
        <p className="text-[13px] text-encre-attenuee">
          Vous ne gérez aucune personne à charge pour le moment.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {proches.map((proche) => (
        <Link key={proche.id} href={`/app/patient/proches/${proche.id}`} className="block">
          <Card
            title={`${proche.prenom} ${proche.nom}`}
            description={`${age(proche.dateNaissance)} ans`}
            actions={<ChevronRight size={18} aria-hidden="true" className="text-encre-secondaire" />}
          />
        </Link>
      ))}
    </div>
  );
}
