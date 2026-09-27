"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { rechercherDiagnosticsCim10, type DiagnosticCim10Propose } from "@/modules/administration/referentiel-cim10";
import { Badge } from "@/components/ui/Badge";

const DELAI_SAISIE_MS = 250;
/** F-CLI-06 du pack : recherche par code ou libelle, 2 caracteres au moins (meme seuil que rechercherDiagnosticsCim10). */
const MIN_CARACTERES_RECHERCHE_CIM10 = 2;

interface ReponseRecherche {
  terme: string;
  resultats: DiagnosticCim10Propose[];
}

export interface SelecteurDiagnosticCim10Props {
  /** Codes deja retenus ailleurs sur la consultation (principal ou secondaires) : ne sont plus reproposes. */
  codesExclus: string[];
  onChoisir: (diagnostic: DiagnosticCim10Propose) => void;
  placeholder?: string;
}

/**
 * Champ de recherche dans le referentiel CIM-10 (F-CLI-06/RG-CLI-52 du pack) :
 * par code ou libelle, sans accents ni casse, a partir de 2 caracteres.
 * Toujours un champ de RECHERCHE seul (jamais de valeur "choisie" affichee a
 * sa place) : le parent decide de l'affichage du diagnostic retenu (carte
 * unique pour le principal, liste de badges pour les secondaires), ce
 * composant se vide apres chaque selection. Meme patron ARIA "combobox" que
 * SelecteurMedicament.tsx (prescription).
 */
export function SelecteurDiagnosticCim10({ codesExclus, onChoisir, placeholder }: SelecteurDiagnosticCim10Props) {
  const identifiant = useId();
  const [saisie, setSaisie] = useState("");
  const [reponse, setReponse] = useState<ReponseRecherche | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const numeroRequeteRef = useRef(0);

  const rechercheSuffisante = saisie.trim().length >= MIN_CARACTERES_RECHERCHE_CIM10;

  useEffect(() => {
    const numero = ++numeroRequeteRef.current;

    if (!rechercheSuffisante) return;

    const minuteur = setTimeout(async () => {
      let trouves: DiagnosticCim10Propose[] = [];
      try {
        trouves = await rechercherDiagnosticsCim10(saisie);
      } catch {
        trouves = [];
      }

      if (numero !== numeroRequeteRef.current) return;
      setReponse({ terme: saisie, resultats: trouves });
      setActif(0);
    }, DELAI_SAISIE_MS);

    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  const tousLesResultats = rechercheSuffisante && reponse ? reponse.resultats : [];
  const resultats = tousLesResultats.filter((diagnostic) => !codesExclus.includes(diagnostic.code));
  const enCours = rechercheSuffisante && reponse?.terme !== saisie;
  const aucunResultat = rechercheSuffisante && !enCours && resultats.length === 0;
  const indexActif = resultats.length === 0 ? -1 : Math.min(actif, resultats.length - 1);
  const listeVisible = ouvert && resultats.length > 0;

  function choisir(diagnostic: DiagnosticCim10Propose) {
    onChoisir(diagnostic);
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
      // Entree ne doit jamais soumettre le formulaire de consultation depuis ce champ.
      evenement.preventDefault();
      const retenu = resultats[indexActif];
      if (listeVisible && retenu) choisir(retenu);
    } else if (evenement.key === "Escape") {
      setOuvert(false);
    }
  }

  const idChamp = `${identifiant}-champ`;
  const idListe = `${identifiant}-liste`;
  const idAide = `${identifiant}-aide`;
  const idOption = (index: number) => `${identifiant}-option-${index}`;

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={idChamp} className="sr-only">
        Rechercher un diagnostic CIM-10
      </label>
      <p id={idAide} className="text-[12px] text-encre-attenuee">
        Au moins {MIN_CARACTERES_RECHERCHE_CIM10} caracteres : code CIM-10 ou libelle, avec ou sans accents.
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
        placeholder={placeholder ?? "Ex. paludisme, R50.9, fievre"}
        onChange={(evenement) => {
          setSaisie(evenement.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={auClavier}
        className="h-11 w-full rounded-champ border border-bordure-forte bg-surface px-3 text-[15px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
      />
      <p className="min-h-5 text-[12px] text-encre-attenuee" role="status" aria-live="polite">
        {enCours ? "Recherche en cours..." : null}
        {aucunResultat ? "Aucun diagnostic du referentiel ne correspond." : null}
      </p>

      <ul
        id={idListe}
        role="listbox"
        aria-label="Diagnostics CIM-10 trouves"
        hidden={!listeVisible}
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-champ border border-bordure-forte bg-surface shadow-lg"
      >
        {resultats.map((diagnostic, index) => (
          <li
            key={diagnostic.code}
            id={idOption(index)}
            role="option"
            aria-selected={index === indexActif}
            onMouseDown={(evenement) => {
              evenement.preventDefault();
              choisir(diagnostic);
            }}
            onMouseEnter={() => setActif(index)}
            className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${index === indexActif ? "bg-surface-appui" : ""}`}
          >
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-encre">
                <span className="chiffres">{diagnostic.code}</span> : {diagnostic.libelle}
              </span>
            </span>
            {diagnostic.sensible ? <Badge tone="warning">Sensible</Badge> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
