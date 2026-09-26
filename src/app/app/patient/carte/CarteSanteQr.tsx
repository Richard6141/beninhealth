"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { genererJetonCarteSanteAction } from "@/modules/patient/carte-sante";
import { Button } from "@/components/ui/Button";

/**
 * QR de la carte sante numerique (F-CIT-05), regenere automatiquement
 * toutes les 5 minutes (RG-CIT-40) avec un compte a rebours visible. Chaque
 * jeton est a usage unique : si l'accueil vient de le scanner, ce composant
 * continue d'afficher le meme QR jusqu'a expiration (il n'y a pas de moyen
 * de savoir cote client qu'il a ete consomme) - l'utilisateur peut le
 * regenerer manuellement avec le bouton si besoin.
 */
export function CarteSanteQr() {
  const [dataUrlQr, setDataUrlQr] = useState<string | null>(null);
  const [secondesRestantes, setSecondesRestantes] = useState(0);
  const [chargement, setChargement] = useState(true);

  const regenerer = useCallback(async () => {
    const jeton = await genererJetonCarteSanteAction();
    setChargement(false);

    if (!jeton) return;

    setDataUrlQr(jeton.dataUrlQr);
    setSecondesRestantes(Math.round((jeton.expirationMs - Date.now()) / 1000));
  }, []);

  // Premier chargement : callback de promesse, jamais de setState synchrone dans l'effet.
  useEffect(() => {
    let actif = true;

    genererJetonCarteSanteAction().then((jeton) => {
      if (!actif) return;
      setChargement(false);

      if (!jeton) return;

      setDataUrlQr(jeton.dataUrlQr);
      setSecondesRestantes(Math.round((jeton.expirationMs - Date.now()) / 1000));
    });

    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    const intervalle = setInterval(() => {
      setSecondesRestantes((valeur) => {
        if (valeur <= 1) {
          regenerer();
          return 0;
        }
        return valeur - 1;
      });
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
      <Button type="button" variant="secondary" size="sm" onClick={() => { setChargement(true); void regenerer(); }} disabled={chargement}>
        <RefreshCw size={14} aria-hidden="true" className="mr-1.5" />
        Actualiser
      </Button>
    </div>
  );
}
