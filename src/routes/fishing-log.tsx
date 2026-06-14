import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { User, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase, getSession } from "@/lib/supabase";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/fishing-log")({
  component: FishingLogPage,
});

type FishingLog = {
  id: string;
  fished_at: string;
  point_name: string;
  memo: string | null;
  photo_url: string | null;
  weather_code: string | null;
  catch_info: string | null;
};

type SortKey = "fished_at" | "point_name";
type SortDir = "asc" | "desc";

const WEATHER_OPTIONS = [
  { code: "sunny", label: "☀️" },
  { code: "partly", label: "⛅" },
  { code: "cloudy", label: "☁️" },
  { code: "rainy", label: "🌧️" },
  { code: "windy", label: "🌬️" },
  { code: "night_clear", label: "🌙" },
  { code: "night_moon", label: "🌛" },
];

const MAX_LOGS = 10;
const MEMO_MAX = 200;

function FishingLogPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [logs, setLogs] = useState<FishingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("fished_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    fished_at: new Date().toISOString().slice(0, 10),
    point_name: "",
    memo: "",
    weather_code: "",
    catch_info: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(({ session }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setUserId(session.user.id);
      fetchLogs(session.user.id);
    });
  }, []);

  async function fetchLogs(uid: string) {
    setLoading(true);
    const { data } = await supabase
      .from("fishing_logs")
      .select("*")
      .eq("user_id", uid)
      .order("fished_at", { ascending: false });
    setLogs(data ?? []);
    setLoading(false);
  }

  const sorted = [...logs].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="opacity-30 text-[10px]">▲▼</span>;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.point_name.trim()) {
      setFormError("포인트명을 입력해 주세요.");
      return;
    }
    if (!userId) return;
    if (logs.length >= MAX_LOGS) {
      setFormError(`최대 ${MAX_LOGS}개까지 등록 가능합니다.`);
      return;
    }
    setSaving(true);
    setFormError(null);

    let photo_url: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("fishing-photos")
        .upload(path, photoFile);
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("fishing-photos")
          .getPublicUrl(path);
        photo_url = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from("fishing_logs").insert({
      user_id: userId,
      fished_at: form.fished_at,
      point_name: form.point_name.trim(),
      memo: form.memo.trim() || null,
      weather_code: form.weather_code || null,
      catch_info: form.catch_info.trim() || null,
      photo_url,
    });

    setSaving(false);
    if (error) {
      setFormError("저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }

    setAddOpen(false);
    setForm({
      fished_at: new Date().toISOString().slice(0, 10),
      point_name: "",
      memo: "",
      weather_code: "",
      catch_info: "",
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    fetchLogs(userId);
  };

  const handleDelete = async () => {
    if (!deleteId || !userId) return;
    await supabase.from("fishing_logs").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchLogs(userId);
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
            <Link to="/mypage" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <User className="w-4 h-4" />
              마이페이지
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-6 pb-12">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-bold text-foreground">낚시 기록</h1>
          <span className="text-xs text-muted-foreground">{logs.length}/{MAX_LOGS}건</span>
        </div>
        {logs.length > 0 && (
          <div className="flex items-center mb-3 text-xs text-muted-foreground px-4">
            <button type="button" onClick={() => toggleSort("fished_at")} className="flex items-center gap-0.5 hover:text-foreground w-[60px] flex-shrink-0">
              날짜 <SortIcon k="fished_at" />
            </button>
            <button type="button" onClick={() => toggleSort("point_name")} className="flex items-center gap-0.5 hover:text-foreground">
              포인트 <SortIcon k="point_name" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-muted animate-pulse h-20 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            아직 등록된 낚시 기록이 없어요.<br />첫 번째 기록을 남겨보세요 🎣
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((log) => {
              const isExpanded = expandedId === log.id;
              const weather = WEATHER_OPTIONS.find((w) => w.code === log.weather_code);
              return (
                <Card key={log.id} className="bg-white shadow-sm overflow-hidden">
                  <div className="px-4 pt-3 pb-2">
                    {/* 날짜 + 포인트명 + 삭제 버튼 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">{log.fished_at}</span>
                        <div className="text-sm font-semibold text-foreground truncate">{log.point_name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteId(log.id)}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 ml-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* 사진 + 날씨/조과/메모 */}
                    <div className="flex items-start gap-3">
                      {log.photo_url ? (
                        <img src={log.photo_url} alt="낚시 사진" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-[10px] flex-shrink-0">
                          사진없음
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{weather?.label ?? "—"}</span>
                          <span className="text-xs text-muted-foreground truncate">{log.catch_info ?? "조과 없음"}</span>
                        </div>
                        {log.memo && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            className="w-full text-left mt-0.5 flex items-center gap-1"
                          >
                            <p className="text-xs text-muted-foreground line-clamp-1 flex-1">{log.memo}</p>
                            <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 확장 영역: 메모 전체 */}
                  {isExpanded && log.memo && (
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <p className="text-xs font-medium text-foreground mb-1">메모</p>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{log.memo}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {logs.length < MAX_LOGS && (
          <Button type="button" variant="outline" onClick={() => setAddOpen(true)} className="mt-4 w-full h-12 border-dashed">
            <Plus className="w-4 h-4" />
            기록 추가
          </Button>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-background w-full max-w-md rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-bold mb-4">새 낚시 기록</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">출조일 <span className="text-red-500">*</span></label>
                <Input type="date" value={form.fished_at} onChange={(e) => setForm({ ...form, fished_at: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">포인트명 <span className="text-red-500">*</span></label>
                <Input placeholder="예: 안면도 방파제" value={form.point_name} onChange={(e) => setForm({ ...form, point_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  메모 <span className="text-muted-foreground">({form.memo.length}/{MEMO_MAX}자)</span>
                </label>
                <Textarea
                  placeholder="그날의 기억을 남겨보세요"
                  rows={3}
                  value={form.memo}
                  maxLength={MEMO_MAX}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">날씨</label>
                <div className="flex gap-2 flex-wrap">
                  {WEATHER_OPTIONS.map((w) => (
                    <button key={w.code} type="button" onClick={() => setForm({ ...form, weather_code: w.code })}
                      className={`text-xl p-1.5 rounded-lg border transition-colors ${form.weather_code === w.code ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">조과</label>
                <Input placeholder="예: 광어 82cm, 원투" value={form.catch_info} onChange={(e) => setForm({ ...form, catch_info: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">사진 (최대 1장)</label>
                <label className="cursor-pointer text-xs text-primary underline hover:text-primary/80">
                  파일 선택
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
                {photoPreview && <img src={photoPreview} alt="미리보기" className="mt-2 w-full h-40 object-cover rounded-lg" />}
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setAddOpen(false); setFormError(null); }}>취소</Button>
                <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>낚시기록을 정말 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>삭제된 기록은 복구할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}