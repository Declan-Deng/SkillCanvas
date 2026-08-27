import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "SkillCanvas — 让 AI 真正懂你";
  const description = "AI 通过对话、资料和反馈理解你的目标、偏好与边界，生成、验证并持续优化真正属于你的专属 Skill。";

  return {
    title,
    description,
    icons: {
      icon: [
        { url: "/favicon.ico?v=20260827", sizes: "32x32", type: "image/x-icon" },
        { url: "/skillcanvas-browser-icon.png?v=20260827", sizes: "64x64", type: "image/png" },
      ],
      shortcut: "/favicon.ico?v=20260827",
      apple: [{ url: "/skillcanvas-apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "SkillCanvas 从理解你到生成专属 Skill" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
