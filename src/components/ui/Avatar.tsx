import { cn } from "@/lib/cn";

export interface AvatarProps {
  /** Nom complet, utilisé pour les initiales et la couleur déterministe. */
  name: string;
  size?: number;
  className?: string;
}

const tones = [
  { bg: "bg-accent-clair", text: "text-accent" },
  { bg: "bg-bon-clair", text: "text-bon" },
  { bg: "bg-vigilance-clair", text: "text-vigilance" },
  { bg: "bg-info-clair", text: "text-info" },
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Avatar rond à initiales : couleur de fond choisie de façon déterministe à
 * partir du nom (même personne = toujours la même couleur), parmi des tons
 * clairs (accent, bon, vigilance, information).
 */
export function Avatar({ name, size = 36, className }: AvatarProps) {
  const tone = tones[hashName(name) % tones.length];
  const initials = getInitials(name);

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        tone.bg,
        tone.text,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}
