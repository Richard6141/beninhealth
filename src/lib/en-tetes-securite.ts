/**
 * En-tetes de securite appliques a toutes les reponses (next.config.ts).
 *
 * Perimetre volontairement limite aux directives qui ne peuvent casser aucun
 * ecran : frame-ancestors, object-src, base-uri et form-action. Une
 * politique complete sur script-src et style-src exige un nonce genere a
 * chaque requete (proxy.ts) et donc un rendu dynamique de toutes les pages :
 * a faire avec une verification ecran par ecran, pas ici.
 */

export interface EnTeteHttp {
  key: string;
  value: string;
}

const POLITIQUE_CSP = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const POLITIQUE_PERMISSIONS = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
].join(", ");

/**
 * HSTS seulement en production : sur http://localhost il serait ignore, et
 * ne doit jamais etre servi par un poste de developpement qui bascule
 * ensuite en https. Pas de "preload" : irreversible, decision du produit.
 */
export function enTetesSecurite(production: boolean): EnTeteHttp[] {
  const enTetes: EnTeteHttp[] = [
    { key: "Content-Security-Policy", value: POLITIQUE_CSP },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: POLITIQUE_PERMISSIONS },
  ];

  if (production) {
    enTetes.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return enTetes;
}
