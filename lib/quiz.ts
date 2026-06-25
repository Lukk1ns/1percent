export type QuizOption = { id: string; text: string };

export type QuizQuestion =
  | { id: string; type: "choice"; text: string; options: QuizOption[] }
  | { id: string; type: "hybrid"; text: string; placeholder: string; tags: string[] };

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
