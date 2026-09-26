-- RG-RDV-03 : aucune double reservation. Un professionnel ne peut avoir qu'un
-- seul rendez-vous non annule a un instant donne. Index UNIQUE PARTIEL, non
-- exprimable dans schema.prisma : Prisma ne le voit pas, une migration generee
-- par `prisma migrate diff` proposerait donc a tort de le supprimer (voir le
-- commentaire du modele RendezVous). Les rendez-vous sans professionnel
-- (NULL) et les rendez-vous annules ne sont pas concernes.
CREATE UNIQUE INDEX "RendezVous_professionnelId_date_actif_key"
  ON "RendezVous" ("professionnelId", "date")
  WHERE "professionnelId" IS NOT NULL AND "statut" <> 'annule';
