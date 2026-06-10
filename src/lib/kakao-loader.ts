let loadPromise: Promise<any> | null = null;

export function loadKakaoMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao Maps can only load in the browser"));
  }
  const w = window as any;
  if (w.kakao?.maps?.LatLng) return Promise.resolve(w.kakao);
  if (loadPromise) return loadPromise;

  const key = "49de47358841e5cfac19d71b1d08d7a1";

  loadPromise = new Promise((resolve, reject) => {
    // 이전 실패한 스크립트 태그가 있으면 제거 (재시도 가능하도록)
    const stale = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-loader="true"]',
    );
    if (stale && !w.kakao?.maps) {
      stale.remove();
    }

    const src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      key,
    )}&libraries=services&autoload=false`;

    const s = document.createElement("script");
    s.dataset.kakaoMapsLoader = "true";
    s.async = true;
    s.src = src;
    s.onload = () => {
      if (!w.kakao?.maps) {
        loadPromise = null;
        reject(
          new Error(
            "카카오맵 SDK 가 응답했지만 초기화되지 않았습니다. 앱 키가 올바른지 확인하세요.",
          ),
        );
        return;
      }
      w.kakao.maps.load(() => resolve(w.kakao));
    };
    s.onerror = () => {
      loadPromise = null;
      const host =
        typeof window !== "undefined" ? window.location.host : "(unknown)";
      reject(
        new Error(
          `카카오맵 SDK 로드 실패. 카카오 개발자 콘솔(developers.kakao.com) → 내 애플리케이션 → 플랫폼 → Web 에 현재 도메인(${host})을 등록했는지, JavaScript 키(${key.slice(0, 6)}…)가 맞는지 확인하세요.`,
        ),
      );
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}
