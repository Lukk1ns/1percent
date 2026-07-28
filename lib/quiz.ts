export type QuizOption = { id: string; text: string };

export type QuizQuestion =
  | { id: string; type: "choice"; text: string; options: QuizOption[] }
  | { id: string; type: "hybrid"; text: string; placeholder: string; tags: string[] };

/**
 * Le 4 domande del PUBBLICO — servono a profilare il tipo di serata
 * che cerca, e a calcolare l'archetipo mostrato sulla card.
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    type: "choice",
    text: "Cosa ti aspetti da una serata?",
    options: [
      { id: "a", text: "Bere bene" },
      { id: "b", text: "Conoscere gente interessante" },
      { id: "c", text: "Ballare e basta" },
      { id: "d", text: "Stare per i fatti miei in mezzo alla gente" },
    ],
  },
  {
    id: "q2",
    type: "choice",
    text: "In una serata, cosa fa davvero la differenza?",
    options: [
      { id: "a", text: "La musica" },
      { id: "b", text: "I drink" },
      { id: "c", text: "Le persone giuste" },
      { id: "d", text: "Il vibe — non si spiega, o c'è o non c'è" },
    ],
  },
  {
    id: "q3",
    type: "hybrid",
    text: "Le serate pazze…",
    placeholder: "Raccontaci (opzionale)",
    tags: ["Le vivo", "Le osservo", "Le provoco", "Le evito"],
  },
  {
    id: "q4",
    type: "hybrid",
    text: "Cosa proprio non sopporti?",
    placeholder: "Sfogati (opzionale)",
    tags: ["Il caos", "La musica sbagliata", "Le serate che finiscono troppo presto", "Chi sta sul telefono tutta la sera"],
  },
];

/**
 * Le 4 domande della CREW — altra cosa dal quiz del pubblico.
 * Qui non si profila un cliente: si capisce cosa sa fare uno che
 * lavorerà alle serate, e quanto pesa davvero il suo giro.
 *
 * Le risposte finiscono in profiles.crew_answers e si leggono dal
 * pannello admin. Le ultime due sono le più utili: la q4 raccoglie
 * critiche vere sulla concorrenza da chi la vive tutte le sere.
 */
export const CREW_QUESTIONS: QuizQuestion[] = [
  {
    id: "c1",
    type: "choice",
    text: "Cosa porti all'1%?",
    options: [
      { id: "gente", text: "Gente — è il mio mestiere portarla" },
      { id: "musica", text: "Musica — sto in consolle" },
      { id: "immagini", text: "Immagini — foto e video" },
      { id: "mani", text: "Mani — organizzazione, bar, allestimenti" },
    ],
  },
  {
    id: "c2",
    type: "choice",
    text: "Se stasera scrivi «si va», quanti si muovono davvero?",
    options: [
      { id: "sotto10", text: "Meno di 10" },
      { id: "10_30", text: "Tra 10 e 30" },
      { id: "30_100", text: "Tra 30 e 100" },
      { id: "oltre100", text: "Più di 100" },
    ],
  },
  {
    id: "c3",
    type: "hybrid",
    text: "Quando una serata è riuscita davvero?",
    placeholder: "Dillo con parole tue (opzionale)",
    tags: [
      "Pista piena fino alla fine",
      "C'era la gente giusta",
      "Il momento in cui parte IL pezzo",
      "I numeri a fine serata",
    ],
  },
  {
    id: "c4",
    type: "hybrid",
    text: "Cosa non funziona nelle serate qui in zona?",
    placeholder: "Senza peli sulla lingua (opzionale)",
    tags: [
      "Sempre la stessa musica",
      "Sempre la stessa gente",
      "Si paga troppo",
      "Finiscono presto",
      "Nessuno ci crede davvero",
    ],
  },
];
