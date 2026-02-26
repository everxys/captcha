import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

/**
 * App metadata
 */
export const metadata: Metadata = {
  title: "验证码验证",
  description: "输入验证码访问问卷调查",
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
