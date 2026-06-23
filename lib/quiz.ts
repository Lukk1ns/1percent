export type QuizQuestion = {
  id: string;
  text: string;
  options: { id: string; text: string }[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    text: "Mercoledì sera — cosa fai di solito?",
    options: [
      { id: "a", text: "Resto a casa, domani si lavora" },
      { id: "b", text: "Dipende, se c'è qualcosa di valido" },
      { id: "c", text: "Esco comunque. Il resto è scuse" },
    ],
  },
  {
    id: "q2",
    text: "Come scegli dove andare?",
    options: [
      { id: "a", text: "Aspetto che qualcuno organizzi qualcosa" },
      { id: "b", text: "Seguo il gruppo, di solito" },
      { id: "c", text: "Se mi va, vado. Punto" },
    ],
  },
  {
    id: "q3",
    text: "Il 99% stasera è a casa. Tu?",
    options: [
      { id: "a", text: "Anche io, onestamente" },
      { id: "b", text: "Forse esco, non so ancora" },
      { id: "c", text: "Già fuori nella mia testa" },
    ],
  },
  {
    id: "q4",
    text: "Cosa cerchi in una serata?",
    options: [
      { id: "a", text: "Relax, niente di troppo" },
      { id: "b", text: "Divertimento con le persone giuste" },
      { id: "c", text: "Qualcosa che il 99% non capisce" },
    ],
  },
];
