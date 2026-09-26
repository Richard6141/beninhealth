# Images de production de Benin Health Intelligence Platform (Next.js en sortie standalone),
# non root.
#
# Deux cibles publiees :
# - runner (par defaut) : l'application seule, sans sources ni outils ;
# - tools : sources, dependances et client Prisma, pour les taches ponctuelles du deploiement
#   (prisma migrate deploy, seed de demonstration). Jamais exposee, lancee puis supprimee.

FROM node:24-bookworm-slim AS base
# Le moteur Prisma a besoin d'OpenSSL pour se choisir et se charger.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Le verrou a ete resolu sans les dependances pairs facultatives (vitest et @types/node).
RUN npm ci --no-audit --no-fund --legacy-peer-deps

# Le build compile en mode production : src/lib/env.ts exige alors DATABASE_URL, NEXTAUTH_SECRET
# et les variables SMTP_*. Des valeurs factices, propres a cette commande, suffisent : aucune
# base ni aucun relais n'est contacte, et rien n'est garde dans l'image finale. L'application
# lit les vraies valeurs a son demarrage.
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN export DATABASE_URL=postgresql://build:build@localhost:5432/build \
  && export NEXTAUTH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')" \
  && export SMTP_HOST=smtp.invalid SMTP_PORT=465 SMTP_USER=build SMTP_PASSWORD=build \
  && export SMTP_FROM=build@invalid \
  && npx prisma generate && npm run build

FROM base AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Aucune commande par defaut utile : le deploiement passe la sienne (migrations, seed).
CMD ["npx", "prisma", "migrate", "status"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
