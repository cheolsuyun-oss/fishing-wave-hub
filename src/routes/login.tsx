import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Fish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase, sendMagicLink, getSession } from "@/lib/supabase";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(({ session }) => {
      if (session) navigate({ to: "/" });
    });
  }, []);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await sendMagicLink(email.trim());
    setLoading(false);
    if (error) {
      setError("이메일 발송에 실패했습니다. 다시 시도해 주세요.");
    } else {
      setSent(true);
    }
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

      <div className="mx-auto max-w-md px-4 pt-16 pb-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-primary mx-auto mb-4">
            <img src={appIcon} alt="낚시와바다" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-bold text-foreground">로그인 / 회원가입</h1>
          <p className="text-sm text-muted-foreground mt-1">
            이메일만 입력하면 바로 시작할 수 있어요
          </p>
        </div>

        <Card className="p-6 bg-white shadow-md">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="text-base font-bold text-foreground mb-2">이메일을 확인해 주세요</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">{email}</span>로<br />
                로그인 링크를 보냈어요.<br />
                링크를 클릭하면 자동으로 로그인됩니다.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-6 text-xs text-muted-foreground underline"
              >
                다른 이메일로 다시 시도
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">
                  이메일 주소
                </label>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  disabled={loading}
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button
                type="button"
                className="w-full"
                onClick={handleSubmit}
                disabled={loading || !email.trim()}
              >
                {loading ? "발송 중..." : "로그인 링크 받기"}
              </Button>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[11px]">
                  <span className="bg-white px-2 text-muted-foreground">또는</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${window.location.origin}/` },
                  });
                }}
              >
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4 mr-2" />
                Google로 로그인
              </Button>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                처음 이용하시면 자동으로 회원가입이 됩니다.<br />
                비밀번호 없이 이메일 링크로만 로그인해요.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}