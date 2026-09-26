"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, MessageSquareWarning, ShieldX } from "lucide-react";
import {
  approuverProfessionnelAction,
  demanderComplementProfessionnelAction,
  refuserProfessionnelAction,
} from "@/modules/administration/validation-professionnels";
import {
  DELAI_CIBLE_HEURES_OUVREES,
  LIBELLES_ETAT,
  MOTIFS_REFUS,
  type EtatVerification,
  type ProfessionnelAValider,
  type ValidationProfessionnelActionState,
} from "@/modules/administration/validation-professionnels-regles";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { Tabs } from "@/components/ui/Tabs";
import { ChampTextarea } from "../ChampTextarea";

const ORDRE_ONGLETS: EtatVerification[] = ["a_traiter", "complement", "a_revalider", "verifie", "refuse"];

const TONE_PAR_ETAT: Record<EtatVerification, BadgeTone> = {
  a_traiter: "warning",
  complement: "info",
  a_revalider: "alert",
  verifie: "good",
  refuse: "critical",
};

const LIBELLE_ROLE: Record<string, string> = {
  medecin: "Médecin",
  infirmier: "Infirmier",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  agent_communautaire: "Agent communautaire",
};

const ETAT_INITIAL: ValidationProfessionnelActionState = { error: null, success: false };

/** Fuseau fixe (Africa/Porto-Novo) : le rendu serveur et le navigateur affichent la meme date. */
function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Porto-Novo" });
}

type TypeDecision = "approuver" | "refuser" | "complement";

interface DecisionEnCours {
  type: TypeDecision;
  professionnel: ProfessionnelAValider;
}

interface ModaleDecisionProps {
  professionnel: ProfessionnelAValider;
  titre: string;
  description: string;
  icone: LucideIcon;
  action: (prev: ValidationProfessionnelActionState, formData: FormData) => Promise<ValidationProfessionnelActionState>;
  libelleBouton: string;
  libelleEnCours: string;
  variante: "primary" | "danger";
  messageSucces: string;
  onFermer: () => void;
  children: ReactNode;
}

function ModaleDecision({
  professionnel,
  titre,
  description,
  icone,
  action,
  libelleBouton,
  libelleEnCours,
  variante,
  messageSucces,
  onFermer,
  children,
}: ModaleDecisionProps) {
  const modaleRef = useRef<ModalHandle>(null);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, ETAT_INITIAL);

  useEffect(() => {
    modaleRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (state.success) {
    return (
      <Modal ref={modaleRef} variant="dialog" width="wide" title="Décision enregistrée" onClose={onFermer}>
        <Alert level="success" title={professionnel.nomComplet}>
          {messageSucces}
        </Alert>
        <Button variant="primary" className="mt-4 w-full" onClick={() => modaleRef.current?.close()}>
          Fermer
        </Button>
      </Modal>
    );
  }

  return (
    <Modal ref={modaleRef} variant="dialog" width="wide" icon={icone} title={titre} description={description} onClose={onFermer}>
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="professionnelId" value={professionnel.id} />

        {state.error ? (
          <Alert level="critical" title="Décision refusée">
            {state.error}
          </Alert>
        ) : null}

        <p className="text-[14px] text-encre">
          <span className="font-semibold">{professionnel.nomComplet}</span>
          {", "}
          {LIBELLE_ROLE[professionnel.role] ?? professionnel.role}, {professionnel.etablissementNom}
        </p>

        {children}

        <Button type="submit" variant={variante} disabled={pending}>
          {pending ? libelleEnCours : libelleBouton}
        </Button>
      </form>
    </Modal>
  );
}

function ModaleApprobation({ professionnel, onFermer }: { professionnel: ProfessionnelAValider; onFermer: () => void }) {
  return (
    <ModaleDecision
      professionnel={professionnel}
      titre="Approuver ce professionnel ?"
      description="Le numéro d'inscription a été vérifié auprès de l'Ordre concerné. Le professionnel est notifié."
      icone={BadgeCheck}
      action={approuverProfessionnelAction}
      libelleBouton="Confirmer l'approbation"
      libelleEnCours="Enregistrement..."
      variante="primary"
      messageSucces="Le numéro est enregistré comme vérifié. Le professionnel a été notifié."
      onFermer={onFermer}
    >
      <dl className="grid gap-3 rounded-carte border border-bordure bg-plan p-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Profession</dt>
          <dd className="text-[15px] font-semibold text-encre">{LIBELLE_ROLE[professionnel.profession ?? ""] ?? professionnel.profession}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Numéro d&apos;inscription à l&apos;Ordre</dt>
          <dd className="chiffres text-[15px] font-semibold text-encre">{professionnel.numeroOrdre}</dd>
        </div>
      </dl>
      <label className="flex items-start gap-2 text-[14px] font-semibold text-encre">
        <input type="checkbox" name="confirmation" required className="mt-1" />
        J&apos;ai vérifié ce numéro auprès de l&apos;Ordre concerné (procédure manuelle, hors plateforme).
      </label>
    </ModaleDecision>
  );
}

function ModaleRefus({ professionnel, onFermer }: { professionnel: ProfessionnelAValider; onFermer: () => void }) {
  return (
    <ModaleDecision
      professionnel={professionnel}
      titre="Refuser ce professionnel ?"
      description="Le compte est suspendu immédiatement et ses sessions sont fermées. Le professionnel et l'administrateur de son établissement sont notifiés."
      icone={ShieldX}
      action={refuserProfessionnelAction}
      libelleBouton="Confirmer le refus"
      libelleEnCours="Enregistrement..."
      variante="danger"
      messageSucces="Le profil est refusé et le compte suspendu. Le professionnel et son établissement ont été notifiés."
      onFermer={onFermer}
    >
      <SelectField
        label="Motif du refus"
        name="motif"
        required
        placeholder="Choisir un motif"
        options={MOTIFS_REFUS.map((motif) => ({ value: motif.code, label: motif.libelle }))}
      />
      <ChampTextarea
        label="Précision"
        name="precision"
        rows={3}
        maxLength={500}
        hint="Facultative, sauf pour « Autre motif » (10 caractères minimum). Transmise au professionnel et à son établissement."
      />
    </ModaleDecision>
  );
}

function ModaleComplement({ professionnel, onFermer }: { professionnel: ProfessionnelAValider; onFermer: () => void }) {
  return (
    <ModaleDecision
      professionnel={professionnel}
      titre="Demander un complément"
      description="Le professionnel et l'administrateur de son établissement reçoivent votre message. Le compte reste actif."
      icone={MessageSquareWarning}
      action={demanderComplementProfessionnelAction}
      libelleBouton="Envoyer la demande"
      libelleEnCours="Envoi..."
      variante="primary"
      messageSucces="La demande de complément a été envoyée au professionnel et à son établissement."
      onFermer={onFermer}
    >
      <ChampTextarea
        label="Message"
        name="message"
        required
        rows={4}
        maxLength={500}
        hint="Au moins 10 caractères : ce qui manque ou ce qui est incohérent (numéro, profession, identité)."
      />
    </ModaleDecision>
  );
}

function Champ({ etiquette, children }: { etiquette: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">{etiquette}</dt>
      <dd className="text-[14px] text-encre">{children}</dd>
    </div>
  );
}

function LigneProfessionnel({
  professionnel,
  onDecision,
}: {
  professionnel: ProfessionnelAValider;
  onDecision: (decision: DecisionEnCours) => void;
}) {
  const sansNumero = !professionnel.profession || !professionnel.numeroOrdre;
  const peutApprouver = professionnel.etat !== "verifie" && !sansNumero;
  const peutDemanderComplement = professionnel.etat !== "refuse";

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[16px] font-semibold text-encre">{professionnel.nomComplet}</p>
            <p className="text-[13px] text-encre-secondaire">
              {LIBELLE_ROLE[professionnel.role] ?? professionnel.role}, {professionnel.specialite}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {professionnel.delaiDepasse ? (
              <Badge tone="critical">Au-delà de {DELAI_CIBLE_HEURES_OUVREES} h ouvrées</Badge>
            ) : null}
            <Badge tone={TONE_PAR_ETAT[professionnel.etat]}>{LIBELLES_ETAT[professionnel.etat]}</Badge>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Champ etiquette="Établissement">{professionnel.etablissementNom}</Champ>
          <Champ etiquette="Numéro d'inscription à l'Ordre">
            {sansNumero ? (
              <span className="font-semibold text-critique">Non renseigné</span>
            ) : (
              <span className="chiffres font-semibold">{professionnel.numeroOrdre}</span>
            )}
          </Champ>
          <Champ etiquette="Compte créé le">
            {formaterDate(professionnel.dateDemande)}
            {professionnel.etat === "a_traiter" ? (
              <span className="block text-[12px] text-encre-attenuee">{professionnel.heuresOuvreesEcoulees} h ouvrées écoulées</span>
            ) : null}
          </Champ>
          <Champ etiquette="Dernière vérification">
            {professionnel.ordreVerifieLe ? formaterDate(professionnel.ordreVerifieLe) : "Jamais vérifié"}
          </Champ>
        </dl>

        <p className="text-[12px] text-encre-attenuee">{professionnel.email}</p>

        {professionnel.message && professionnel.dateDecision ? (
          <p className="rounded-carte border border-bordure bg-plan px-3 py-2 text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">
              {professionnel.decision === "refuse" ? "Refus" : "Complément demandé"} le {formaterDate(professionnel.dateDecision)} :
            </span>{" "}
            {professionnel.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {peutApprouver ? (
            <Button variant="primary" iconBefore={BadgeCheck} onClick={() => onDecision({ type: "approuver", professionnel })}>
              {professionnel.etat === "refuse" ? "Rétablir (approuver)" : "Approuver"}
            </Button>
          ) : null}
          {peutDemanderComplement ? (
            <Button variant="secondary" iconBefore={MessageSquareWarning} onClick={() => onDecision({ type: "complement", professionnel })}>
              Demander un complément
            </Button>
          ) : null}
          {professionnel.etat !== "refuse" ? (
            <Button variant="danger" iconBefore={ShieldX} onClick={() => onDecision({ type: "refuser", professionnel })}>
              Refuser
            </Button>
          ) : null}
          {sansNumero && professionnel.etat !== "refuse" ? (
            <span className="text-[12px] text-encre-attenuee">
              Approbation impossible sans numéro d&apos;inscription : demandez un complément.
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function SectionValidationProfessionnels({ professionnels }: { professionnels: ProfessionnelAValider[] }) {
  const [decision, setDecision] = useState<DecisionEnCours | null>(null);

  const parEtat = new Map<EtatVerification, ProfessionnelAValider[]>(ORDRE_ONGLETS.map((etat) => [etat, []]));
  for (const professionnel of professionnels) {
    parEtat.get(professionnel.etat)?.push(professionnel);
  }

  const ongletParDefaut = ORDRE_ONGLETS.find((etat) => (parEtat.get(etat)?.length ?? 0) > 0) ?? "a_traiter";

  const fermer = () => setDecision(null);

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="État de vérification"
        defaultActiveId={ongletParDefaut}
        items={ORDRE_ONGLETS.map((etat) => {
          const lignes = parEtat.get(etat) ?? [];
          return {
            id: etat,
            label: `${LIBELLES_ETAT[etat]} (${lignes.length})`,
            content:
              lignes.length === 0 ? (
                <EtatVide titre="Aucun professionnel dans cet état" />
              ) : (
                <div className="flex flex-col gap-4 pt-4">
                  {lignes.map((professionnel) => (
                    <LigneProfessionnel key={professionnel.id} professionnel={professionnel} onDecision={setDecision} />
                  ))}
                </div>
              ),
          };
        })}
      />

      {decision?.type === "approuver" ? (
        <ModaleApprobation key={`approuver-${decision.professionnel.id}`} professionnel={decision.professionnel} onFermer={fermer} />
      ) : null}
      {decision?.type === "refuser" ? (
        <ModaleRefus key={`refuser-${decision.professionnel.id}`} professionnel={decision.professionnel} onFermer={fermer} />
      ) : null}
      {decision?.type === "complement" ? (
        <ModaleComplement key={`complement-${decision.professionnel.id}`} professionnel={decision.professionnel} onFermer={fermer} />
      ) : null}
    </div>
  );
}
