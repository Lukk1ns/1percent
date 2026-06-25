export type Prize = {
  label: string;
  emoji: string;
  color: string;
};

const PRIZES: { prize: Prize; weight: number }[] = [
  { prize: { label: "SHOT", emoji: "🥃", color: "#e0181f" }, weight: 6 },
  { prize: { label: "DRINK", emoji: "🍹", color: "#e0181f" }, weight: 4 },
  { prize: { label: "DOLCETTO", emoji: "🍬", color: "#e0181f" }, weight: 35.5 },
  { prize: { label: "GADGET", emoji: "🎁", color: "#e0181f" }, weight: 3 },
  { prize: { label: "PROSECCO", emoji: "🥂", color: "#e0181f" }, weight: 1 },
  { prize: { label: "BUONO AMAZON", emoji: "🛒", color: "#e0181f" }, weight: 0.5 },
  { prize: null as unknown as Prize, weight: 50 },
];

export function drawPrize(): Prize | null {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const { prize, weight } of PRIZES) {
    r -= weight;
    if (r <= 0) return prize ?? null;
  }
  return null;
}
