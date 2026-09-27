"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { genererJetonCarteSanteAction } from "@/modules/patient/carte-sante";
import { Button } from "@/components/ui/Button";

/**
 * QR de la carte sante numerique (F-CIT-05), regenere automatiquement
 * toutes les 5 minutes (RG-CIT-40) avec un compte a rebours visible. Chaque
 * jeton est a usage unique : si l'accueil vient de le scanner, ce composant
 * continue d'afficher le meme QR jusqu'a expiration (il n'y a pas de moyen
 * de savoir cote client qu'il a ete consomme) : l'utilisateur peut le
 * regenerer manuellement avec le bouton si besoin.
 *
 * Une seule generation a la fois (garde par reference) : deux appels
 * concurrents produiraient deux jetons dont l'ecran n'afficherait que le
 * dernier a repondre.
 */
export function CarteSanteQr() {
  const [dataUrlQr, setDataUrlQr] = useState<string | null>(null);
  const [secondesRestantes, setSecondesRestantes] = useState(0);
  const [chargement, setChargement] = useState(true);
  const generationEnCours = useRef(false);
  const expirationMs = useRef(0);

  const regenerer = useCallback(async () => {
    if (generationEnCours.current) return;
    generationEnCours.current = true;

    try {
      const jeton = await genererJetonCarteSanteAction();

      if (!jeton) return;

      expirationMs.current = jeton.expirationMs;
      setDataUrlQr(jeton.dataUrlQr);
      setSecondesRestantes(Math.max(0, Math.round((jeton.expirationMs - Date.now()) / 1000)));
    } finally {
      generationEnCours.current = false;
      setChargement(false);
    }
  }, []);

  // Premier chargement : la generation est asynchrone, aucun setState synchrone dans l'effet.
  useEffect(() => {
    void regenerer();
  }, [regenerer]);

  // Compte a rebours calcule depuis l'expiration reelle ; renouvelle le QR a zero, jamais avant d'en avoir un.
  useEffect(() => {
    const intervalle = setInterval(() => {
      if (expirationMs.current === 0) return;

      const restantes = Math.max(0, Math.round((expirationMs.current - Date.now()) / 1000));
      setSecondesRestantes(restantes);

      if (restantes === 0) {
        expirationMs.current = 0;
        void regenerer();
      }
    }, 1000);

    return () => clearInterval(intervalle);
  }, [regenerer]);

  const minutes = Math.floor(secondesRestantes / 60);
  const secondes = secondesRestantes % 60;

  return (
    <div className="flex flex-col items-center gap-3">
      {dataUrlQr ? (
        <Image src={dataUrlQr} alt="QR code de la carte santé" width={220} height={220} unoptimized />
      ) : (
        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-champ border border-dashed border-bordure-forte bg-plan text-[13px] text-encre-attenuee">
          Génération...
        </div>
      )}
      <p className="chiffres text-[13px] text-encre-secondaire">
        Valide encore {minutes}:{secondes.toString().padStart(2, "0")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setChargement(true);
          void regenerer();
        }}
        disabled={chargement}
      >
        <RefreshCw size={14} aria-hidden="true" className="mr-1.5" />
        Actualiser
      </Button>
    </div>
  );
}
