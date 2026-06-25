export type Avatar = { id: string; emoji: string; label: string };

export const AVATARS: Avatar[] = [
  { id: "skull", emoji: "💀", label: "Skull" },
  { id: "crown", emoji: "👑", label: "Crown" },
  { id: "lightning", emoji: "⚡", label: "Lightning" },
  { id: "eye", emoji: "👁️", label: "Eye" },
  { id: "devil", emoji: "😈", label: "Devil" },
  { id: "wolf", emoji: "🐺", label: "Wolf" },
  { id: "diamond", emoji: "💎", label: "Diamond" },
  { id: "snake", emoji: "🐍", label: "Snake" },
  { id: "ghost", emoji: "👻", label: "Ghost" },
  { id: "shadow", emoji: "🌑", label: "Shadow" },
  { id: "angel", emoji: "😇", label: "Angel" },
  { id: "mask", emoji: "🎭", label: "Mask" },
];

export function getAvatar(id: string): Avatar {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
