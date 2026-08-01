import type { Metadata } from "next";
import "./globals.css";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const description =
  "隐私优先的本地 JPEG EXIF 编辑工具。A privacy-first local JPEG EXIF editor for camera settings, GPS, time, authorship, and descriptions.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "影刻·EXIF｜Local EXIF Editor",
  description,
  openGraph: {
    title: "影刻·EXIF",
    description: "编辑照片的 EXIF 信息。本地处理，无损写入，安全导出。",
    type: "website",
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/og.png`,
        width: 1536,
        height: 1024,
        alt: "影刻·EXIF｜Local EXIF Editor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "影刻·EXIF",
    description: "编辑照片的 EXIF 信息。本地处理，无损写入，安全导出。",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
