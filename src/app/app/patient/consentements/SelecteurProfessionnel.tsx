"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { rechercherProfessionnelsPourPartageAction, type ProfessionnelDisponible } from "@/modules/patient/actions";
import { MIN_CARACTERES_RECHERCHE_PROFESSIONNEL, rechercheProfessionnelSuffisante } from "@/modules/patient/recherche-professionnel";

const DELAI_SAISIE_MS = 250;

export interface SelecteurProfessionnelProps {
  professionnelChoisi: ProfessionnelDisponible | null;
  onChoisir: (professionnel: ProfessionnelDisponible) => void;
  onEffacer: () => void;
}

interface ReponseRecherche {
  terme: string;
  resultats: ProfessionnelDisponible[];
}

/**
 * Champ de recherche d'un professionnel de sante (F-CIT-10 du pack) : a
 * partir de 3 caracteres, sur le nom, la specialite ou l'etablissement, sans
 * tenir compte des accents ni de la casse. Remplace la liste complete des
 * professionnels valides de la plateforme (des milliers de lignes a
 * l'echelle nationale) par une recherche a la demande, 20 resultats au plus.
 * Meme motif "combobox" que SelecteurMedicament.tsx (prescription).
 */
export function SelecteurProfessionnel({ professionnelChoisi, onChoisir, onEffacer }: SelecteurProfessionnelProps) {
  const identifiant = useId();
  const [saisie, setSaisie] = useState("");
  const [reponse, setReponse] = useState<ReponseRecherche | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const numeroRequeteRef = useRef(0);

  useEffect(() => {
    const numero = ++numeroRequeteRef.current;

    if (!rechercheProfessionnelSuffisante(saisie)) return;

    const minuteur = setTimeout(async () => {
      let trouves: ProfessionnelDisponible[] = [];
      try {
        trouves = await rechercherProfessionnelsPourPartageAction(saisie);
      } catch {
        trouves = [];
      }

      if (numero !== numeroRequeteRef.current) return;
      setReponse({ terme: saisie, resultats: trouves });
      setActif(0);
    }, DELAI_SAISIE_MS);

    return () => clearTimeout(minuteur);
  }, [saisie]);

  const rechercheSuffisante = rechercheProfessionnelSuffisante(saisie);
  const resultats = rechercheSuffisante && reponse ? reponse.resultats : [];
  const enCours = rechercheSuffisante && reponse?.terme !== saisie;
  const aucunResultat = rechercheSuffisante && !enCours && resultats.length === 0;
  const indexActif = resultats.length === 0 ? -1 : Math.min(actif, resultats.length - 1);
  const listeVisible = ouvert && resultats.length > 0;

  function choisir(professionnel: ProfessionnelDisponible) {
    onChoisir(professionnel);
    setSaisie("");
    setReponse(null);
    setOuvert(false);
    setActif(0);
  }

  function auClavier(evenement: KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      setOuvert(true);
      setActif(Math.min(indexActif + 1, Math.max(resultats.length - 1, 0)));
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      setActif(Math.max(indexActif - 1, 0));
    } else if (evenement.key === "Enter") {
      evenement.preventDefault();
      const retenu = resultats[indexActif];
      if (listeVisible && retenu) choisir(retenu);
    } else if (evenement.key === "Escape") {
      setOuvert(false);
    }
  }

  if (professionnelChoisi) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
          Professionnel de santé
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-champ border border-bordure-forte bg-surface px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[16px] font-semibold text-encre" data-testid="professionnel-choisi">
              {professionnelChoisi.nomComplet}
            </p>
            <p className="text-[13px] text-encre-secondaire">
              {professionnelChoisi.specialite} · {professionnelChoisi.etablissementNom}
            </p>
          </div>
          <button
            type="button"
            onClick={onEffacer}
            className="inline-flex h-11 items-center gap-1.5 rounded-champ px-3 text-[14px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <X size={16} aria-hidden="true" />
            Changer de professionnel
          </button>
        </div>
      </div>
    );
  }

  const idChamp = `${identifiant}-champ`;
  const idListe = `${identifiant}-liste`;
  const idAide = `${identifiant}-aide`;
  const idOption = (index: number) => `${identifiant}-option-${index}`;

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={idChamp} className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
        Professionnel de santé
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <p id={idAide} className="text-[13px] text-encre-secondaire">
        Tapez au moins {MIN_CARACTERES_RECHERCHE_PROFESSIONNEL} lettres : nom, spécialité ou établissement, avec ou sans accents.
      </p>
      <input
        id={idChamp}
        type="text"
        role="combobox"
        aria-expanded={listeVisible}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-activedescendant={listeVisible && indexActif >= 0 ? idOption(indexActif) : undefined}
        aria-describedby={idAide}
        autoComplete="off"
        value={saisie}
        placeholder="Ex. Dr Adjovi, cardiologie, CHU Cotonou"
        onChange={(evenement) => {
          setSaisie(evenement.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={auClavier}
        className="h-11 w-full rounded-champ border border-bordure-forte bg-surface px-3 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
      />
      <p className="min-h-5 text-[13px] text-encre-attenuee" role="status" aria-live="polite">
        {enCours ? "Recherche en cours..." : null}
        {aucunResultat ? "Aucun professionnel disponible ne correspond." : null}
        {rechercheSuffisante && !enCours && resultats.length > 0
          ? `${resultats.length} résultat${resultats.length > 1 ? "s" : ""}`
          : null}
      </p>

      <ul
        id={idListe}
        role="listbox"
        aria-label="Professionnels trouvés"
        hidden={!listeVisible}
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-champ border border-bordure-forte bg-surface shadow-lg"
      >
        {resultats.map((professionnel, index) => (
          <li
            key={professionnel.userId}
            id={idOption(index)}
            role="option"
            aria-selected={index === indexActif}
            onMouseDown={(evenement) => {
              evenement.preventDefault();
              choisir(professionnel);
            }}
            onMouseEnter={() => setActif(index)}
            className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 ${index === indexActif ? "bg-surface-appui" : ""}`}
          >
            <span className="text-[15px] font-semibold text-encre">{professionnel.nomComplet}</span>
            <span className="text-[13px] text-encre-secondaire">
              {professionnel.specialite} · {professionnel.etablissementNom}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
