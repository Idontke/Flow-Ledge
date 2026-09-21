"use client";

import { useEffect, useState } from "react";

export default function PWARegister() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const registerTimer = window.setTimeout(() => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }, 1_000);
    return () => {
      window.clearTimeout(registerTimer);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  return online ? null : <div className="offline-banner" role="status"><span>离线模式</span>可以查看已加载内容；新增、编辑和行情刷新需要联网。</div>;
}
