export type Archetype = "Il Predatore" | "Il Fantasma" | "Il Purista" | "Il Provocatore";

type Scores = Record<Archetype, number>;

const Q1_SCORES: Record<string, Partial<Scores>> = {
  a: { "Il Predatore": 3 },
  b: { "Il Provocatore": 2, "Il Fantasma": 1 },
  c: { "Il Purista": 3 },
  d: { "Il Fantasma": 3 },
};

const Q2_SCORES: Record<string, Partial<Scores>> = {
  a: { "Il Purista": 3 },
  b: { "Il Predatore": 2 },
  c: { "Il Provocatore": 2 },
  d: { "Il Fantasma": 3, "Il Purista": 1 },
};

const Q3_TAG_SCORES: Record<string, Partial<Scores>> = {
  "Le vivo": { "Il Predatore": 3 },
  "Le osservo": { "Il Fantasma": 2, "Il Purista": 1 },
  "Le provoco": { "Il Provocatore": 3 },
  "Le evito": { "Il Purista": 2, "Il Fantasma": 1 },
};

const Q4_TAG_SCORES: Record<string, Partial<Scores>> = {
  "Il caos": { "Il Fantasma": 2, "Il Purista": 1 },
  "La musica sbagliata": { "Il Purista": 3 },
  "Le serate che finiscono troppo presto": { "Il Predatore": 2, "Il Provocatore": 1 },
  "Chi sta sul telefono tutta la sera": { "Il Provocatore": 2, "Il Predatore": 1 },
};

export function computeArchetype(answers: {
  q1?: string;
  q2?: string;
  q3?: { tag?: string };
  q4?: { tag?: string };
}): Archetype {
  const totals: Scores = {
    "Il Predatore": 0,
    "Il Fantasma": 0,
    "Il Purista": 0,
    "Il Provocatore": 0,
  };

  function add(map: Record<string, Partial<Scores>>, key?: string) {
    if (!key) return;
    const s = map[key];
    if (!s) return;
    for (const [arch, pts] of Object.entries(s)) {
      totals[arch as Archetype] += pts ?? 0;
    }
  }

  add(Q1_SCORES, answers.q1);
  add(Q2_SCORES, answers.q2);
  add(Q3_TAG_SCORES, answers.q3?.tag);
  add(Q4_TAG_SCORES, answers.q4?.tag);

  return (Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0]) as Archetype;
}
