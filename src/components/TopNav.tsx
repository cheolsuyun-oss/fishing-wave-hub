import { Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Fish, User } from "lucide-react";
import { supabase, getSession } from "@/lib/supabase";
import appIcon from "@/assets/app-icon.png";

export function TopNav() {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const [nickname, setNickname] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(async ({ session }) => {
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setNickname(data.nickname ?? null);
        setAvatarUrl(data.avatar_url ?? null);
      }
    });
  }, []);

  const displayName = nickname
    ? nickname.length > 6 ? nickname.slice(0, 6) + "..." : nickname
    : "마이페이지";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-md px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary">
            <img src={appIcon} alt="낚시와바다" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-tight">낚시와바다</p>
            <p className="text-[10px] text-muted-foreground">The Fisher and the Sea</p>
          </div>
        </Link>
        <nav className="flex items-center gap-4">
          {pathname !== "/fishing-log" && (
            <Link to="/fishing-log" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Fish className="w-4 h-4" />
              낚시기록
            </Link>
          )}
          {pathname !== "/mypage" && (
            <Link to="/mypage" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {avatarUrl ? (
                <img src={avatarUrl} alt="프로필" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4" />
              )}
              {displayName}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}