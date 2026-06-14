import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Fish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSession, signOut } from "@/lib/supabase";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/mypage")({
  component: MypagePage,
});

function MypagePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then(({ session }) => {
      if (session?.user?.email) {
        setEmail(session.user.email);
      }
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
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
            <Link to="/fishing-log" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Fish className="w-4 h-4" />
              낚시기록
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-8 pb-12">
        <h1 className="text-base font-bold text-foreground mb-4">마이페이지</h1>

        {loading ? (
          <div className="rounded-xl bg-muted animate-pulse h-24 w-full" />
        ) : email ? (
          <Card className="p-5 bg-white shadow-md space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">로그인된 계정</p>
              <p className="text-sm font-medium text-foreground">{email}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              로그아웃
            </Button>
          </Card>
        ) : (
          <Card className="p-5 bg-white shadow-md text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              로그인하면 낚시 기록을 저장하고<br />어디서든 불러올 수 있어요.
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => navigate({ to: "/login" })}
            >
              로그인 / 회원가입
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}