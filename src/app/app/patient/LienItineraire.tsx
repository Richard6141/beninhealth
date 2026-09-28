import { Navigation } from "lucide-react";
import { lienItineraire } from "@/modules/facility/itineraire";

/**
 * Lien externe "Itineraire" vers un etablissement (F-CIT-02, meme patron que
 * F-ETA-02). N'affiche rien quand les coordonnees manquent ou sont invalides
 * (voir facility/itineraire.ts), plutot qu'un lien vers un point faux.
 */
export function LienItineraire({
  latitude,
  longitude,
  etablissementNom,
}: {
  latitude: number | null;
  longitude: number | null;
  etablissementNom: string;
}) {
  const href = lienItineraire(latitude, longitude);

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Itinéraire vers ${etablissementNom} (ouvre une carte dans un nouvel onglet)`}
      className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
    >
      <Navigation size={13} aria-hidden="true" />
      Itinéraire
    </a>
  );
}
