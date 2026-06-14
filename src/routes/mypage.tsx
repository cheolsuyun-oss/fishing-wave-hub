import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase, getSession, signOut } from "@/lib/supabase";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/mypage")({
  component: MypagePage,
});

function MypagePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nicknameEdit, setNicknameEdit] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSession().then(async ({ session }) => {
      if (!session) {
        setLoading(false);
        return;
      }
      setEmail(session.user.email ?? null);
      setUserId(session.user.id);

      const { data } = await supabase
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("id", session.user.id)
        .single();

      if (data) {
        setNickname(data.nickname ?? "");
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const handleNicknameSave = async () => {
    if (!userId) return;
    setSaving(true);
    await supabase.from("profiles").upsert({
      id: userId,
      nickname: nicknameDraft.trim(),
      updated_at: new Date().toISOString(),
    });
    setNickname(nicknameDraft.trim());
    setNicknameEdit(false);
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setSaving(true);

    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").upsert({
        id: userId,
        avatar_url: url,
        updated_at: new Date().toISOString(),
      });
      setAvatarUrl(url);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <div className="mx-auto max-w-md px-4 pt-8 pb-12">
        <h1 className="text-base font-bold text-foreground mb-4">마이페이지</h1>

        {loading ? (
          <div className="rounded-xl bg-muted animate-pulse h-40 w-full" />
        ) : email ? (
          <div className="space-y-4">
            {/* 프로필 카드 */}
            <Card className="p-5 bg-white shadow-md">
              <div className="flex items-center gap-4 mb-4">
                {/* 프로필 사진 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex-shrink-0"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="프로필"
                      className="w-16 h-16 rounded-full object-cover border-2 border-border"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs border-2 border-border">
                      사진없음
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px]">
                    ✎
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />

                {/* 닉네임 */}
                <div className="flex-1 min-w-0">
                  {nicknameEdit ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={nicknameDraft}
                        onChange={(e) => setNicknameDraft(e.target.value)}
                        placeholder="닉네임 입력"
                        maxLength={20}
                        className="h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleNicknameSave}
                        disabled={saving}
                        className="text-xs text-primary font-medium whitespace-nowrap"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setNicknameEdit(false)}
                        className="text-xs text-muted-foreground whitespace-nowrap"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {nickname || "닉네임 없음"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNicknameDraft(nickname);
                          setNicknameEdit(true);
                        }}
                        className="text-[11px] text-muted-foreground underline flex-shrink-0"
                      >
                        수정
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{email}</p>
                </div>
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
          </div>
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