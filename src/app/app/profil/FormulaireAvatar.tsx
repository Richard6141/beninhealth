"use client";

import { useActionState, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { televerserAvatarAction, type ProfilActionState } from "@/modules/identity";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const AVATAR_PAR_DEFAUT = "/avatar-defaut.svg";
const etatInitial: ProfilActionState = { error: null, success: false };

export interface FormulaireAvatarProps {
  avatarUrl: string | null;
}

export function FormulaireAvatar({ avatarUrl }: FormulaireAvatarProps) {
  const [state, formAction, pending] = useActionState(televerserAvatarAction, etatInitial);
  const [apercu, setApercu] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  useEffect(() => {
    return () => {
      if (apercu) URL.revokeObjectURL(apercu);
    };
  }, [apercu]);

  function surChangementFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    if (fichier) {
      setApercu((precedent) => {
        if (precedent) URL.revokeObjectURL(precedent);
        return URL.createObjectURL(fichier);
      });
    }
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Téléversement impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Photo mise à jour">
          Votre photo de profil a bien été enregistrée.
        </Alert>
      ) : null}

      <div className="flex items-center gap-4">
        <span className="inline-flex h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface-appui">
          <Image
            src={apercu || avatarUrl || AVATAR_PAR_DEFAUT}
            alt="Aperçu de la photo de profil"
            width={80}
            height={80}
            unoptimized
            className="h-full w-full object-cover"
          />
        </span>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="avatar"
            className="inline-flex h-9 w-fit cursor-pointer items-center rounded-champ border border-bordure-forte bg-surface px-3 text-[13px] font-semibold text-encre transition-colors hover:bg-surface-appui"
          >
            Choisir une image
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={surChangementFichier}
            className="sr-only"
          />
          <p className="text-[12px] text-encre-attenuee">PNG, JPEG ou WebP, 3 Mo maximum.</p>
        </div>
      </div>

      <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
        {pending ? "Téléversement..." : "Mettre à jour la photo"}
      </Button>
    </form>
  );
}
