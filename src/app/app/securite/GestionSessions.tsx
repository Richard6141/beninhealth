"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import {
  deconnecterAutresAppareilsAction,
  fermerSessionAction,
  type SessionActiveResume,
  type SessionsActionState,
} from "@/modules/identity/sessions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const etatInitial: SessionsActionState = { error: null, success: false };

const ICONE_PAR_APPAREIL: Record<string, typeof Laptop> = {
  Mobile: Smartphone,
  Tablette: Tablet,
  Ordinateur: Laptop,
};

function formaterDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function LigneSession({ session }: { session: SessionActiveResume }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(fermerSessionAction, etatInitial);
  const Icone = ICONE_PAR_APPAREIL[session.appareil] ?? Laptop;

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <li className="flex items-center justify-between gap-3 rounded-champ border border-bordure bg-surface px-3 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
          <Icone size={16} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-encre">
            {session.appareil} · {session.navigateur}
            {session.estCourante ? <Badge tone="good">Cette session</Badge> : null}
          </p>
          <p className="text-[12px] text-encre-attenuee">
            Dernière activité : {formaterDate(session.derniereActivite)} · Connectée depuis :{" "}
            {formaterDate(session.dateCreation)} · IP {session.adresseIp}
          </p>
        </div>
      </div>
      <form action={formAction}>
        <input type="hidden" name="sessionId" value={session.id} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Fermeture..." : session.estCourante ? "Se déconnecter" : "Fermer"}
        </Button>
      </form>
    </li>
  );
}

/**
 * Ecran F-AUTH-09 : liste des sessions actives (appareil, navigateur,
 * adresse IP, derniere activite) avec fermeture individuelle ou groupee.
 * Limite assumee : pas de ville approximative (pas de geolocalisation IP,
 * voir prisma/schema.prisma), adresse IP technique affichee a la place.
 */
export function GestionSessions({ sessions }: { sessions: SessionActiveResume[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deconnecterAutresAppareilsAction, etatInitial);
  const [confirmation, setConfirmation] = useState(false);

  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.success) {
      setConfirmation(false);
    }
  }

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const autresSessions = sessions.filter((session) => !session.estCourante);

  return (
    <div className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Action impossible">
          {state.error}
        </Alert>
      ) : null}

      {sessions.length === 0 ? (
        <p className="text-[13px] text-encre-attenuee">Aucune session active trouvée.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <LigneSession key={session.id} session={session} />
          ))}
        </ul>
      )}

      {autresSessions.length > 0 ? (
        confirmation ? (
          <form action={formAction} className="flex flex-col gap-3 rounded-champ border border-vigilance bg-vigilance-clair px-3 py-3">
            <p className="text-[13px] text-encre">
              Fermer les {autresSessions.length} autre(s) session(s) ? Ces appareils seront déconnectés à leur
              prochaine action.
            </p>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" size="sm" disabled={pending}>
                {pending ? "Fermeture..." : "Confirmer"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmation(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" className="w-fit" onClick={() => setConfirmation(true)}>
            Déconnecter tous les autres appareils
          </Button>
        )
      ) : null}
    </div>
  );
}
