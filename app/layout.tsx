import type { Metadata, Viewport } from "next";
import "./globals.css";
import LaunchController from "./components/LaunchController";
import PWARegister from "./components/PWARegister";

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

const launchCriticalCss = `
  #flowledger-launch{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,#2d4037 0,#1d2b25 34%,#17211d 72%);color:#fff;font-family:"SF Pro Display","SF Pro Text","Avenir Next",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;will-change:opacity,transform}
  #flowledger-launch:before{content:"";position:absolute;inset:0;background:linear-gradient(130deg,transparent 25%,rgba(216,255,95,.035) 50%,transparent 72%);animation:launchSheen 1.8s ease-in-out infinite}
  #flowledger-launch.leaving{pointer-events:none;animation:launchOut .48s cubic-bezier(.4,0,.2,1) forwards}
  #flowledger-launch .launch-aura{position:absolute;width:min(78vw,540px);aspect-ratio:1;border-radius:50%;border:1px solid rgba(216,255,95,.08);box-shadow:0 0 0 46px rgba(216,255,95,.025),0 0 0 110px rgba(216,255,95,.012);animation:auraPulse 2.2s ease-in-out infinite}
  #flowledger-launch .launch-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;animation:launchContentIn .62s cubic-bezier(.22,1,.36,1) both}
  #flowledger-launch .launch-logo{width:116px;height:116px;border:1px solid rgba(255,255,255,.18);border-radius:32px;background:rgba(255,255,255,.045);box-shadow:0 24px 70px rgba(3,10,7,.3),inset 0 0 0 1px rgba(216,255,95,.04);display:flex;align-items:center;justify-content:center;font-size:50px;font-weight:850;letter-spacing:-7px;font-style:normal}
  #flowledger-launch .launch-logo b{color:#d8ff5f;font-weight:850}
  #flowledger-launch .launch-logo i{color:#d8ff5f;font-style:normal;margin-left:-8px}
  #flowledger-launch .launch-content>strong{margin-top:26px;font-size:23px;letter-spacing:.16em}
  #flowledger-launch .launch-content>small{margin-top:8px;color:#8f9e96;font-size:9px;font-weight:800;letter-spacing:.28em}
  #flowledger-launch .launch-progress{width:118px;height:3px;margin-top:34px;border-radius:99px;background:#34453d;overflow:hidden}
  #flowledger-launch .launch-progress i{display:block;width:48%;height:100%;border-radius:inherit;background:#d8ff5f;animation:launchProgress 1.15s cubic-bezier(.65,0,.35,1) infinite}
  @media(max-width:720px){#flowledger-launch .launch-logo{width:104px;height:104px;border-radius:29px;font-size:46px}}
  @media(prefers-reduced-motion:reduce){#flowledger-launch:before,#flowledger-launch .launch-aura,#flowledger-launch .launch-content,#flowledger-launch .launch-progress i{animation:none}#flowledger-launch.leaving{animation-duration:.01ms}}
  @keyframes launchContentIn{from{opacity:0;transform:translateY(18px) scale(.96)}}
  @keyframes launchOut{to{opacity:0;transform:scale(1.025);visibility:hidden}}
  @keyframes launchSheen{0%,100%{opacity:.25;transform:translateX(-28%)}50%{opacity:.8;transform:translateX(28%)}}
  @keyframes auraPulse{0%,100%{opacity:.52;transform:scale(.94)}50%{opacity:1;transform:scale(1)}}
  @keyframes launchProgress{0%{transform:translateX(-115%)}50%{transform:translateX(65%)}100%{transform:translateX(215%)}}
`;

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: "FlowLedger 净值簿",
  description: "把每天的流水，变成看得懂的净资产。快速记账、资产配置与月度复盘，在一处完成。",
  applicationName: "FlowLedger",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], shortcut: "/favicon.svg", apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "净值簿" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "FlowLedger 净值簿",
    description: "把每天的流水，变成看得懂的净资产。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "FlowLedger 净值簿" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowLedger 净值簿",
    description: "把每天的流水，变成看得懂的净资产。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#17211d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" style={{ background: "#17211d" }}><head>
    <style dangerouslySetInnerHTML={{ __html: launchCriticalCss }} />
    <link rel="apple-touch-startup-image" href="/apple-splash-1320x2868.png" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="/apple-splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="/apple-splash-1206x2622.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="/apple-splash-1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
    <link rel="apple-touch-startup-image" href="/apple-splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
  </head><body>
    <div id="flowledger-launch" className="launch-screen" role="status" aria-label="正在打开 FlowLedger 净值簿">
      <div className="launch-aura" />
      <div className="launch-content">
        <span className="launch-logo">F<b>L</b><i>.</i></span>
        <strong>净值簿</strong>
        <small>FLOWLEDGER</small>
        <div className="launch-progress"><i /></div>
      </div>
    </div>
    <LaunchController />
    <PWARegister />
    {children}
  </body></html>;
}
