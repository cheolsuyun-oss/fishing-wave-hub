import { Link, useRouter } from "@tanstack/react-router";
import { Home, Search, User } from "lucide-react";

export function BottomNav() {
  const router = useRouter();
  const pathname = router.state.location.pathname;

  const navItems = [
    { to: "/", icon: Home, label: "홈" },
    { to: "/search", icon: Search, label: "포인트 검색" },
    { to: "/mypage", icon: User, label: "마이페이지" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-md flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
