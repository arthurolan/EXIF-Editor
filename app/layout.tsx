import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "隐私优先的本地 JPEG EXIF 编辑工具。A privacy-first local JPEG EXIF editor for GPS, time, authorship, and descriptions.";

  return {
    metadataBase: new URL(origin),
    title: "影刻·EXIF｜Local EXIF Editor",
    description,
    openGraph: {
      title: "影刻·EXIF",
      description: "重写照片的时间、地点和描述。本地处理，无损写入，安全导出。",
      type: "website",
      url: origin,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1536,
          height: 1024,
          alt: "影刻·EXIF｜Local EXIF Editor",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "影刻·EXIF",
      description: "重写照片的时间、地点和描述。本地处理，无损写入，安全导出。",
      images: [`${origin}/og.png`],
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
      <body>{children}</body>
    </html>
  );
}
