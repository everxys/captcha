import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

/**
 * App metadata
 */
export const metadata: Metadata = {
  title: "验证码管理后台",
  description: "验证码管理与签发",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
