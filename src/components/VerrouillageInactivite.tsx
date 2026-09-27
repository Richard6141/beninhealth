"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import type { NomRole } from "@/types";
import { deverrouillerEcranAction, type DeverrouillageActionState } from "@/modules/identity/verrouillage";
import { TENTATIVES_MAX_VERROUILLAGE } from "@/modules/identity/verrouillage-regles";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/**
 * Verrouillage d'ecran pour inactivite (F-AUTH-08 du pack, section 23.3
 * "tableau 23.3" desormais trouve dans docs/pack claude/specs/23-securite-conformite.md).
 * 10 minutes pour DOCTOR, NURSE, RECEPTIONIST, CHW et les roles LAB (divers)
 * et PHARMACIST ; 15 minutes pour les roles "Etablissement, pilotage" et
 * "Administrateur, auditeur" (admin_etablissement, admin_national),
 * ajoutes le 2026-09-28 (jusque-la absents de tout verrou d'ecran cote
 * navigateur, meme si leur SESSION SERVEUR expirait deja apres 15 minutes
 * d'inactivite, voir src/lib/regles-session.ts : sans ce verrou visuel, ces
 * roles perdaient leur session brutalement a la requete suivante, sans le
 * geste explicite de deverrouillage que ce composant offre aux autres
 * roles). patient n'est PAS concerne par ce verrou : son inactivite se gere
 * au niveau de la session elle-meme (30 min si "appareil partage" via
 * regles-session.ts, jamais un ecran de verrouillage local).
 *
 * "Appareil partage" (F-AUTH-02) sciemment PAS lu ici, verifie ne rien
 * changer en pratique : son seul effet cote serveur est un plafond de 30 min
 * d'inactivite (regles-session.ts), toujours plus long que le delai de
 * verrouillage le plus long applique ici (15 min) - le verrou visuel reste
 * donc toujours la contrainte la plus stricte, avec ou sans appareil
 * partage, pour tous les roles couverts par ce composant.
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
 * Revalide cote serveur depuis le 2026-09-28
 * (src/modules/identity/verrouillage.ts) : le compteur local ci-dessous
 * reste utile pour le retour immediat a l'ecran, mais state.deconnecte
 * (autorite serveur) declenche la deconnexion tout autant, meme si ce
 * compteur local avait ete contourne.
 */

const DELAIS_VERROUILLAGE_MS: Partial<Record<NomRole, number>> = {
  medecin: 10 * 60 * 1000,
  infirmier: 10 * 60 * 1000,
  agent_communautaire: 10 * 60 * 1000,
  laboratoire: 10 * 60 * 1000,
  pharmacien: 10 * 60 * 1000,
  admin_etablissement: 15 * 60 * 1000,
  admin_national: 15 * 60 * 1000,
};

const TENTATIVES_MAX = TENTATIVES_MAX_VERROUILLAGE;
const EVENEMENTS_ACTIVITE = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;

const etatInitial: DeverrouillageActionState = { error: null, success: false };

function EcranVerrouille({ onDeverrouille, onDepasseTentatives }: { onDeverrouille: () => void; onDepasseTentatives: () => void }) {
  const [state, formAction, pending] = useActionState(deverrouillerEcranAction, etatInitial);
  const [tentatives, setTentatives] = useState(0);

  // Incremente le compteur d'echecs : ajustement d'etat pendant le rendu
  // (comparaison avec l'etat precedent), pas un appel setState dans un
  // effet, meme pattern que Sidebar.tsx. Remplace une version precedente qui
  // appelait onDepasseTentatives directement depuis l'updater de setTentatives
  // (effet de bord dans un updater, non fiable en pratique - React ne
  // garantit pas son execution - ce qui rendait le verrouillage apres 3
  // tentatives totalement inoperant : bug reel trouve par verification
  // navigateur, voir docs/coordination-agents.md).
  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.error) {
      setTentatives((valeur) => valeur + 1);
    }
  }

  // Notifie le parent (deverrouille/deconnecte) : vrais effets de bord
  // externes au composant (ils modifient l'etat d'un composant PARENT),
  // donc a leur place dans un effet, contrairement a l'incrementation locale
  // ci-dessus.
  useEffect(() => {
    if (state.success) {
      onDeverrouille();
    }
  }, [state.success, onDeverrouille]);

  useEffect(() => {
    if (tentatives >= TENTATIVES_MAX) {
      onDepasseTentatives();
    }
  }, [tentatives, onDepasseTentatives]);

  // Autorite serveur (F-AUTH-08) : declenche la deconnexion des que le
  // serveur signale la session detruite, meme si le compteur local
  // ci-dessus n'a, pour une raison quelconque, jamais atteint TENTATIVES_MAX
  // (page rechargee entre deux tentatives, par exemple).
  useEffect(() => {
    if (state.deconnecte) {
      onDepasseTentatives();
    }
  }, [state.deconnecte, onDepasseTentatives]);

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

  const delaiInactiviteMs = role ? DELAIS_VERROUILLAGE_MS[role] : undefined;
  const soumisAuVerrouillage = delaiInactiviteMs !== undefined;

  useEffect(() => {
    if (!delaiInactiviteMs) return;

    function reinitialiserMinuteur() {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      minuteurRef.current = setTimeout(() => setVerrouille(true), delaiInactiviteMs);
    }

    reinitialiserMinuteur();
    EVENEMENTS_ACTIVITE.forEach((evenement) => window.addEventListener(evenement, reinitialiserMinuteur));

    return () => {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      EVENEMENTS_ACTIVITE.forEach((evenement) => window.removeEventListener(evenement, reinitialiserMinuteur));
    };
  }, [delaiInactiviteMs]);

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
