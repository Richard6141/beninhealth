"use client";

import { useState } from "react";
import Link from "next/link";
import { validerConfirmationPin } from "@/modules/offline/pin-regles";
import { initialiserPin, telechargerEtChiffrerInstantane } from "@/modules/offline/offline-store";
import { indexedDbDisponible } from "@/modules/offline/indexeddb-client";

type Etape = "definition_pin" | "telechargement" | "pret";

/**
 * F-COM-01 : definition du PIN (deux saisies) puis telechargement chiffre de
 * l'instantane de l'aire. Composant Client : Web Crypto et IndexedDB ne sont
 * disponibles que dans le navigateur.
 */
export function EcranPreparation() {
  const [etape, setEtape] = useState<Etape>("definition_pin");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [nombrePersonnes, setNombrePersonnes] = useState<number | null>(null);
  const [dateInstantane, setDateInstantane] = useState<string | null>(null);

  if (!indexedDbDisponible()) {
    return (
      <p className="text-sm text-red-700">
        Le stockage hors ligne n&apos;est pas disponible sur ce navigateur. Le mode terrain ne peut pas etre prepare
        ici.
      </p>
    );
  }

  async function validerPinEtTelecharger() {
    setErreur(null);
    const validation = validerConfirmationPin(pin, confirmation);
    if (!validation.valide) {
      setErreur(validation.erreur);
      return;
    }

    setEnCours(true);
    try {
      await initialiserPin(pin);
      setEtape("telechargement");

      const resultat = await telechargerEtChiffrerInstantane();
      setNombrePersonnes(resultat.nombrePersonnes);
      setDateInstantane(new Date().toLocaleString("fr-FR"));
      setEtape("pret");
    } catch {
      setErreur("Le telechargement de l'instantane a echoue. Verifiez votre connexion puis reessayez.");
      setEtape("definition_pin");
    } finally {
      setEnCours(false);
    }
  }

  if (etape === "pret") {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Pret pour le terrain</h1>
        <p className="text-sm text-slate-700">
          Instantane telecharge le {dateInstantane}, {nombrePersonnes} personne{nombrePersonnes && nombrePersonnes > 1 ? "s" : ""} de
          votre aire, chiffre sur cet appareil.
        </p>
        <Link href="/terrain/synchronisation" className="inline-block rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
          Aller a la synchronisation
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Preparer l&apos;appareil</h1>
      <p className="text-sm text-slate-600">
        Definissez un code PIN a 6 chiffres qui protegera les donnees stockees sur cet appareil (RG-OFF-01). Evitez
        000000, 123456 ou une date evidente.
      </p>

      <label className="block text-sm font-medium text-slate-700" htmlFor="pin">
        Code PIN (6 chiffres)
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(evenement) => setPin(evenement.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <label className="block text-sm font-medium text-slate-700" htmlFor="confirmation">
        Confirmez le code PIN
      </label>
      <input
        id="confirmation"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={confirmation}
        onChange={(evenement) => setConfirmation(evenement.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {erreur && <p className="text-sm text-red-700">{erreur}</p>}
      {etape === "telechargement" && <p className="text-sm text-sky-700">Telechargement de l&apos;instantane de votre aire…</p>}

      <button
        type="button"
        onClick={validerPinEtTelecharger}
        disabled={enCours}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Valider et telecharger l&apos;instantane
      </button>
    </div>
  );
}
