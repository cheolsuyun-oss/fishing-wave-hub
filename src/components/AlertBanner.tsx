import { AlertTriangle } from "lucide-react";

export function AlertBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 border border-red-600 px-4 py-3 text-white shadow-md">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <div className="text-sm font-bold leading-tight">
        <span className="mr-1">긴급 특보</span>
        {message}
      </div>
    </div>
  );
}
