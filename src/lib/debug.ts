// src/lib/debug.ts
// 개발 환경(DEV) 전용 디버그 로그 헬퍼.
// import.meta.env.DEV가 false인 프로덕션 빌드에서는 즉시 종료되어 실제 동작이 일어나지 않음.
// 브라우저에서 실행되는 코드이므로 fs/path 등 Node 전용 모듈은 사용하지 않음.

import debugConfig from "../../debug.config.json";

type DebugKey = keyof typeof debugConfig;

export function debugLog(key: DebugKey, ...args: unknown[]) {
  if (!import.meta.env.DEV) return;
  if (!debugConfig[key]) return;
  console.log(`[DEBUG:${String(key)}]`, ...args);
}