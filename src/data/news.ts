// Titres de news fictifs (GDD 2.4 « News »). {T} est remplacé par le ticker de l'action.

export const POSITIVE_HEADLINES = [
  '{T} : résultats trimestriels supérieurs aux attentes',
  '{T} : signature d’un contrat majeur',
  '{T} : un analyste relève sa recommandation',
  '{T} : prévisions annuelles revues à la hausse',
] as const;

export const NEGATIVE_HEADLINES = [
  '{T} : résultats trimestriels inférieurs aux attentes',
  '{T} : enquête ouverte par le régulateur',
  '{T} : un analyste abaisse sa recommandation',
  '{T} : prévisions annuelles revues à la baisse',
] as const;
