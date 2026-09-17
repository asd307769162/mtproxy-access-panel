import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTProxy 专属代理",
  description: "MTProxy代理激活、流量和设备管理",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
