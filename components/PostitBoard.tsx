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

// Posizioni e rotazioni deterministiche dal post ID
function layout(id: string) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  const side = h % 2;
  // Sinistra 2-18%, destra 68-85%
  const x = side === 0 ? 2 + (h % 16) : 68 + (h % 17);
  const y = 3 + ((h >> 5) % 84);
  const rot = ((h >> 11) % 17) - 8;
  return { x, y, rot };
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
        { event: "UPDATE", schema: "public", table: "posts" },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (posts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {posts.map((post) => {
        const { x, y, rot } = layout(post.id);
        const avatar = getAvatar(post.avatar_id);
        return (
          <div
            key={post.id}
            className="absolute w-36 select-none"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: `rotate(${rot}deg)`,
              opacity: 0.82,
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
