"use client";

import { useEffect, useState } from "react";
import {
  deverrouillerAvecPin,
  mettreEnFileAttentePersonne,
  nombreEnAttente,
  sessionDeverrouillee,
  synchroniser,
  type PayloadPersonneCommunautaireHorsLigne,
  type ResultatSynchronisationClient,
} from "@/modules/offline/offline-store";
import { IndicateurEtatReseau } from "../IndicateurEtatReseau";

/**
 * F-COM-08 : ecran de synchronisation. Contient aussi, pour prouver le
 * pipeline complet de bout en bout (perimetre assume ce soir, voir
 * docs/reste-a-faire.md), un formulaire minimal de creation hors ligne d'une
 * personne communautaire (F-COM-02), mis en file d'attente puis synchronise
 * par cet ecran. Les visites et vaccinations restent hors du perimetre
 * hors ligne ce soir (deja FAIT en ligne, F-COM-03/04).
 */
export function EcranSynchronisation() {
  const [pin, setPin] = useState("");
  const [deverrouille, setDeverrouille] = useState(false);
  const [erreurPin, setErreurPin] = useState<string | null>(null);
  const [enAttente, setEnAttente] = useState(0);
  const [synchronisationEnCours, setSynchronisationEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatSynchronisationClient | null>(null);
  const [erreurSync, setErreurSync] = useState<string | null>(null);

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [sexe, setSexe] = useState<"M" | "F">("F");
  const [dateNaissance, setDateNaissance] = useState("");
  const [villageQuartier, setVillageQuartier] = useState("");
  const [messagePersonne, setMessagePersonne] = useState<string | null>(null);

  useEffect(() => {
    if (deverrouille) {
      nombreEnAttente().then(setEnAttente).catch(() => undefined);
    }
  }, [deverrouille]);

  async function surDeverrouillage() {
    setErreurPin(null);
    const resultatDeverrouillage = await deverrouillerAvecPin(pin);
    if (resultatDeverrouillage.statut === "ok") {
      setDeverrouille(true);
      return;
    }
    if (resultatDeverrouillage.statut === "pin_incorrect") {
      setErreurPin(`Code PIN incorrect. ${resultatDeverrouillage.echecsRestants} tentative(s) restante(s).`);
    } else if (resultatDeverrouillage.statut === "verrouille_donnees_effacees") {
      setErreurPin("Trop d'echecs : les donnees locales non synchronisables ont ete effacees. Reconnectez-vous en ligne.");
    } else {
      setErreurPin("Aucun PIN defini sur cet appareil. Rendez-vous d'abord sur l'ecran de preparation.");
    }
  }

  async function surAjoutPersonne() {
    setMessagePersonne(null);
    if (!nom.trim() || !prenom.trim() || !dateNaissance || !villageQuartier.trim()) {
      setMessagePersonne("Tous les champs sont obligatoires.");
      return;
    }

    const payload: PayloadPersonneCommunautaireHorsLigne = {
      nom: nom.trim(),
      prenom: prenom.trim(),
      sexe,
      dateNaissance,
      dateNaissanceApproximative: false,
      villageQuartier: villageQuartier.trim(),
      chefMenage: null,
    };

    await mettreEnFileAttentePersonne(payload);
    setNom("");
    setPrenom("");
    setDateNaissance("");
    setVillageQuartier("");
    setMessagePersonne("Personne mise en file d'attente, sera envoyee a la synchronisation.");
    setEnAttente(await nombreEnAttente());
  }

  async function surSynchronisation() {
    setErreurSync(null);
    setSynchronisationEnCours(true);
    try {
      const resultatSynchro = await synchroniser();
      setResultat(resultatSynchro);
      setEnAttente(await nombreEnAttente());
    } catch {
      setErreurSync("La synchronisation a echoue. Reessayez au retour du reseau.");
    } finally {
      setSynchronisationEnCours(false);
    }
  }

  if (!deverrouille && !sessionDeverrouillee()) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Deverrouiller l&apos;appareil</h1>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(evenement) => setPin(evenement.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Code PIN"
        />
        {erreurPin && <p className="text-sm text-red-700">{erreurPin}</p>}
        <button
          type="button"
          onClick={surDeverrouillage}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
        >
          Deverrouiller
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IndicateurEtatReseau nombreEnAttente={enAttente} synchronisationEnCours={synchronisationEnCours} />

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Enregistrer une personne (hors ligne)</h2>
        <input
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          placeholder="Nom"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={prenom}
          onChange={(evenement) => setPrenom(evenement.target.value)}
          placeholder="Prenom"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={sexe}
          onChange={(evenement) => setSexe(evenement.target.value as "M" | "F")}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="F">Feminin</option>
          <option value="M">Masculin</option>
        </select>
        <input
          type="date"
          value={dateNaissance}
          onChange={(evenement) => setDateNaissance(evenement.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={villageQuartier}
          onChange={(evenement) => setVillageQuartier(evenement.target.value)}
          placeholder="Village ou quartier"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {messagePersonne && <p className="text-sm text-slate-700">{messagePersonne}</p>}
        <button
          type="button"
          onClick={surAjoutPersonne}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          Ajouter a la file d&apos;attente
        </button>
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={surSynchronisation}
          disabled={synchronisationEnCours || enAttente === 0}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Synchroniser maintenant
        </button>
        {erreurSync && <p className="text-sm text-red-700">{erreurSync}</p>}
        {resultat && (
          <p className="text-sm text-slate-700">
            Acceptees : {resultat.acceptees}. Deja recues : {resultat.dupliquees}. A verifier : {resultat.enRevue}.
            Refusees : {resultat.rejetees}.
          </p>
        )}
      </section>
    </div>
  );
}
