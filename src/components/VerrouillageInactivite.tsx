"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import type { NomRole } from "@/types";
import { deverrouillerEcranAction, type DeverrouillageActionState } from "@/modules/identity/verrouillage";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/**
 * Verrouillage d'ecran pour inactivite (F-AUTH-08 du pack). Perimetre
 * reduit et assume : le pack fixe 10 minutes pour DOCTOR, NURSE,
 * RECEPTIONIST, CHW et les roles LAB (divers) et PHARMACIST, puis renvoie a
 * un "tableau 23.3" (non fourni dans les fiches de ce depot) pour les
 * autres roles. Seuls les 5 roles
 * professionnels explicitement chiffres ici sont donc verrouilles ;
 * patient/admin_etablissement/admin_national ne le sont PAS (pas de valeur
 * documentee a leur appliquer, plutot que d'inventer un delai).
 *
 * RG-AUTH-70 : le contenu proteg retire du DOM, pas seulement masque -
 * cette verification apparaissant tant que verrouille est vrai,
 * `children` n'est jamais rendu, React demonte reellement le sous-arbre.
 * Consequence assumee : un formulaire en cours de saisie perd son etat
 * local a la ouverture du verrou (aucun mecanisme de brouillon persistant
 * dans ce depot au-dela de ce que chaque ecran fait deja lui-meme).
 *
 * Apres 3 tentatives de mot de passe incorrectes, deconnexion complete
 * (meme form action que le bouton de deconnexion existant, AvatarMenu).
 */

const ROLES_VERROUILLES_10MIN: NomRole[] = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "laboratoire",
  "pharmacien",
];

const DELAI_INACTIVITE_MS = 10 * 60 * 1000;
const TENTATIVES_MAX = 3;
const EVENEMENTS_ACTIVITE = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;

const etatInitial: DeverrouillageActionState = { error: null, success: false };

function EcranVerrouille({ onDeverrouille, onDepasseTentatives }: { onDeverrouille: () => void; onDepasseTentatives: () => void }) {
  const [state, formAction, pending] = useActionState(deverrouillerEcranAction, etatInitial);
  const [tentatives, setTentatives] = useState(0);

  useEffect(() => {
    if (state.success) {
      onDeverrouille();
      return;
    }
    if (state.error) {
      setTentatives((valeur) => {
        const nouvelleValeur = valeur + 1;
        if (nouvelleValeur >= TENTATIVES_MAX) {
          onDepasseTentatives();
        }
        return nouvelleValeur;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marine-fonce/95 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-carte bg-surface p-6 shadow-[var(--ombre-carte)]">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-clair text-accent">
            <Lock size={22} aria-hidden="true" />
          </span>
          <h2 className="text-[18px] font-bold text-titre">Session verrouillée</h2>
          <p className="text-[13px] text-encre-secondaire">
            Saisissez votre mot de passe pour continuer.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          {state.error ? (
            <Alert level="critical" title="Mot de passe incorrect">
              {tentatives >= TENTATIVES_MAX - 1
                ? "Dernière tentative avant déconnexion."
                : `${TENTATIVES_MAX - tentatives} tentative(s) restante(s).`}
            </Alert>
          ) : null}
          <TextField
            label="Mot de passe"
            name="motDePasse"
            type="password"
            required
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Vérification..." : "Déverrouiller"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function VerrouillageInactivite({
  role,
  logoutAction,
  children,
}: {
  role: NomRole | undefined;
  logoutAction: () => void;
  children: React.ReactNode;
}) {
  const [verrouille, setVerrouille] = useState(false);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDeconnexionRef = useRef<HTMLFormElement>(null);

  const soumisAuVerrouillage = role ? ROLES_VERROUILLES_10MIN.includes(role) : false;

  useEffect(() => {
    if (!soumisAuVerrouillage) return;

    function reinitialiserMinuteur() {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      minuteurRef.current = setTimeout(() => setVerrouille(true), DELAI_INACTIVITE_MS);
    }

    reinitialiserMinuteur();
    EVENEMENTS_ACTIVITE.forEach((evenement) => window.addEventListener(evenement, reinitialiserMinuteur));

    return () => {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      EVENEMENTS_ACTIVITE.forEach((evenement) => window.removeEventListener(evenement, reinitialiserMinuteur));
    };
  }, [soumisAuVerrouillage]);

  if (!soumisAuVerrouillage) {
    return <>{children}</>;
  }

  if (verrouille) {
    return (
      <>
        <EcranVerrouille
          onDeverrouille={() => setVerrouille(false)}
          onDepasseTentatives={() => formDeconnexionRef.current?.requestSubmit()}
        />
        <form ref={formDeconnexionRef} action={logoutAction} className="hidden" />
      </>
    );
  }

  return <>{children}</>;
}
