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
    "隐私优先的本地 JPEG EXIF 编辑工具：修改或删除 GPS、拍摄时间、作者与描述，导出前自动复核。";

  return {
    metadataBase: new URL(origin),
    title: "影刻·EXIF｜为照片重写时间与地点",
    description,
    openGraph: {
      title: "影刻·EXIF",
      description: "为照片重写时间与地点。本地处理，无损写入，安全导出。",
      type: "website",
      url: origin,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1536,
          height: 1024,
          alt: "影刻·EXIF｜为照片重写时间与地点",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "影刻·EXIF",
      description: "为照片重写时间与地点。本地处理，无损写入，安全导出。",
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
