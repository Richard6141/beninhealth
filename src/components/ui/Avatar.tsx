import Image from "next/image";
import { cn } from "@/lib/cn";

const AVATAR_PAR_DEFAUT = "/avatar-defaut.svg";

export interface AvatarProps {
  /** Nom complet, utilise pour le texte accessible (alt / aria-label). */
  name: string;
  /** Photo de profil televersee. Absente ou nulle : image neutre par defaut. */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/**
 * Avatar rond : affiche la photo de profil televersee par l'utilisateur, ou
 * une illustration neutre par defaut tant qu'aucune photo n'a ete televersee.
 * Volontairement pas d'initiales : une meme image neutre pour tout le monde
 * avant televersement, plutot qu'une pastille de couleur par personne.
 */
export function Avatar({ name, avatarUrl, size = 36, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full bg-surface-appui",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={avatarUrl || AVATAR_PAR_DEFAUT}
        alt={name}
        width={size}
        height={size}
        unoptimized={!avatarUrl}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
