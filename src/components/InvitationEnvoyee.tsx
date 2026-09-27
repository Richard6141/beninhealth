"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Confirmation d'envoi d'une invitation a activer un compte (F-AUTH-05). Le lien
 * n'est fourni que hors production ou pour un compte de demonstration : il permet
 * a la personne qui invite de le transmettre par un autre canal.
 */
export function InvitationEnvoyee({ email, lien }: { email: string; lien?: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien ?? "");
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // La copie manuelle reste possible depuis le texte affiche (select-all).
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-4">
      <p className="text-[14px] text-encre">
        Une invitation a été envoyée à <span className="font-semibold">{email}</span>. Elle est valable 7 jours et ne peut
        servir qu&apos;une fois : la personne choisira elle-même son mot de passe.
      </p>
      {lien ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-encre-secondaire">
            Environnement de démonstration : lien d&apos;activation à transmettre si l&apos;e-mail n&apos;arrive pas.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[13px] text-encre">
              {lien}
            </code>
            <Button type="button" variant="secondary" size="sm" iconBefore={copie ? Check : Copy} onClick={copier}>
              {copie ? "Copié" : "Copier"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
