"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type Post = {
  id: string;
  text: string;
  alias: string;
  avatar_id: string;
  created_at: string;
};

// Disposizione: colonne alternate sinistra/destra, distanziate in verticale,
// ancorate ai bordi così nessun post-it esce dallo schermo. Niente sovrapposizioni.
function layout(index: number, total: number, id: string) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  const rot = ((h >> 11) % 13) - 6; // leggera rotazione -6..+6°
  const side = index % 2; // 0 = sinistra, 1 = destra
  const col = Math.floor(index / 2);
  const colCount = Math.ceil(total / 2);
  const span = 68; // distribuiti tra 8% e 76% dell'altezza
  const step = colCount > 1 ? span / (colCount - 1) : 0;
  const jitter = (h % 7) - 3; // piccolo scarto naturale
  const y = Math.max(4, Math.min(80, 8 + step * col + jitter));
  return { side, y, rot };
}

export function PostitBoard() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data } = await supabase.rpc("approved_posts");
      if (data) setPosts(data as Post[]);
    }

    load();

    const channel = supabase
      .channel("posts-approved")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (posts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {posts.map((post, index) => {
        const { side, y, rot } = layout(index, posts.length, post.id);
        const avatar = getAvatar(post.avatar_id);
        const pos = side === 0 ? { left: "1.25rem" } : { right: "1.25rem" };
        return (
          <div
            key={post.id}
            className="absolute w-28 sm:w-32 select-none"
            style={{
              ...pos,
              top: `${y}%`,
              transform: `rotate(${rot}deg)`,
              opacity: 0.88,
            }}
          >
            <div
              className="px-3 pt-3 pb-2 flex flex-col gap-1"
              style={{
                background: "#FFF176",
                boxShadow: "3px 4px 10px rgba(0,0,0,0.45)",
              }}
            >
              <p
                className="text-black leading-tight break-words"
                style={{
                  fontFamily: "var(--font-caveat)",
                  fontSize: "0.95rem",
                  lineHeight: 1.3,
                }}
              >
                {post.text}
              </p>
              <p
                className="text-black/50 mt-1"
                style={{ fontFamily: "var(--font-caveat)", fontSize: "0.72rem" }}
              >
                {avatar.emoji} {post.alias}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
