import { createFileRoute } from "@tanstack/react-router";
import { User } from "lucide-react";

export const Route = createFileRoute("/mypage")({
  component: MyPage,
});

function MyPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center">
        <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h1 className="text-lg font-bold text-foreground">마이페이지</h1>
        <p className="text-sm text-muted-foreground mt-1">
          마이페이지는 곧 제공될 예정입니다.
        </p>
      </div>
    </div>
  );
}
