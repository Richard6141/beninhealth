"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { rechercherMedicamentsAction, type MedicamentOption } from "@/modules/prescription/actions";
import { MIN_CARACTERES_RECHERCHE_MEDICAMENT, termeMedicamentSuffisant } from "@/modules/prescription/recherche-medicaments";
import { Badge } from "@/components/ui/Badge";

const DELAI_SAISIE_MS = 250;

export interface SelecteurMedicamentProps {
  /** Medicament choisi pour la ligne, ou null tant qu'aucun n'est retenu. */
  medicamentChoisi: MedicamentOption | null;
  onChoisir: (medicament: MedicamentOption) => void;
  onEffacer: () => void;
}

export function libelleMedicament(medicament: MedicamentOption): string {
  return `${medicament.nom} (${medicament.dosage}, ${medicament.forme})`;
}

interface ReponseRecherche {
  terme: string;
  resultats: MedicamentOption[];
}

/**
 * Champ de recherche dans le referentiel des medicaments (F-PRE-03 du pack) :
 * a partir de 3 caracteres, sans tenir compte des accents ni de la casse, sur
 * la DCI, le nom et les noms commerciaux. Le catalogue n'est plus charge en
 * entier dans la page : seuls les 20 resultats utiles sont demandes au
 * serveur, apres une courte attente de la saisie. Motif "combobox" ARIA
 * (liste, fleches, Entree, Echap).
 */
export function SelecteurMedicament({ medicamentChoisi, onChoisir, onEffacer }: SelecteurMedicamentProps) {
  const identifiant = useId();
  const [saisie, setSaisie] = useState("");
  const [reponse, setReponse] = useState<ReponseRecherche | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const numeroRequeteRef = useRef(0);

  useEffect(() => {
    // Toute reponse d'une requete anterieure est ignoree, y compris quand la
    // saisie redevient trop courte.
    const numero = ++numeroRequeteRef.current;

    if (!termeMedicamentSuffisant(saisie)) return;

    const minuteur = setTimeout(async () => {
      let trouves: MedicamentOption[] = [];
      try {
        trouves = await rechercherMedicamentsAction(saisie);
      } catch {
        trouves = [];
      }

      if (numero !== numeroRequeteRef.current) return;
      setReponse({ terme: saisie, resultats: trouves });
      setActif(0);
    }, DELAI_SAISIE_MS);

    return () => clearTimeout(minuteur);
  }, [saisie]);

  const rechercheSuffisante = termeMedicamentSuffisant(saisie);
  const resultats = rechercheSuffisante && reponse ? reponse.resultats : [];
  const enCours = rechercheSuffisante && reponse?.terme !== saisie;
  const aucunResultat = rechercheSuffisante && !enCours && resultats.length === 0;
  const indexActif = resultats.length === 0 ? -1 : Math.min(actif, resultats.length - 1);
  const listeVisible = ouvert && resultats.length > 0;

  function choisir(medicament: MedicamentOption) {
    onChoisir(medicament);
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
      // Entree ne doit jamais soumettre l'ordonnance depuis ce champ.
      evenement.preventDefault();
      const retenu = resultats[indexActif];
      if (listeVisible && retenu) choisir(retenu);
    } else if (evenement.key === "Escape") {
      setOuvert(false);
    }
  }

  if (medicamentChoisi) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
          Médicament
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-champ border border-bordure-forte bg-surface px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[16px] font-semibold text-encre" data-testid="medicament-choisi">
              {libelleMedicament(medicamentChoisi)}
            </p>
            <p className="text-[13px] text-encre-secondaire">
              DCI : {medicamentChoisi.principeActif}
              {medicamentChoisi.codeAtc ? ` · ATC ${medicamentChoisi.codeAtc}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onEffacer}
            className="inline-flex h-11 items-center gap-1.5 rounded-champ px-3 text-[14px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <X size={16} aria-hidden="true" />
            Changer de médicament
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
        Médicament
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <p id={idAide} className="text-[13px] text-encre-secondaire">
        Tapez au moins {MIN_CARACTERES_RECHERCHE_MEDICAMENT} lettres : nom du médicament, DCI ou nom commercial, avec ou sans accents.
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
        placeholder="Ex. amoxicilline, paracétamol, Coartem"
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
        {aucunResultat ? "Aucun médicament du référentiel ne correspond." : null}
        {rechercheSuffisante && !enCours && resultats.length > 0
          ? `${resultats.length} résultat${resultats.length > 1 ? "s" : ""}`
          : null}
      </p>

      <ul
        id={idListe}
        role="listbox"
        aria-label="Médicaments trouvés"
        hidden={!listeVisible}
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-champ border border-bordure-forte bg-surface shadow-lg"
      >
        {resultats.map((medicament, index) => (
          <li
            key={medicament.id}
            id={idOption(index)}
            role="option"
            aria-selected={index === indexActif}
            onMouseDown={(evenement) => {
              // Evite la perte de focus (onBlur) avant la prise en compte du choix.
              evenement.preventDefault();
              choisir(medicament);
            }}
            onMouseEnter={() => setActif(index)}
            className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 ${index === indexActif ? "bg-surface-appui" : ""}`}
          >
            <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-encre">
              {libelleMedicament(medicament)}
              {medicament.essentiel ? <Badge tone="good">Essentiel</Badge> : null}
            </span>
            <span className="text-[13px] text-encre-secondaire">
              DCI : {medicament.principeActif}
              {medicament.nomsCommerciaux.length > 0 ? ` · ${medicament.nomsCommerciaux.join(", ")}` : ""}
              {medicament.codeAtc ? ` · ATC ${medicament.codeAtc}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
