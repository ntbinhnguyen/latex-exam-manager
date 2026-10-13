import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Quản lý đề thi LaTeX",
  description: "Nhập, quản lý ngân hàng câu hỏi và sinh đề thi từ LaTeX",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        {/* Thêm thư viện stylesheet của TikzJax */}
        <link
          rel="stylesheet"
          type="text/css"
          href="https://tikzjax.com/v1/fonts.css"
        />
      </head>
      <body className="flex min-h-full bg-slate-50 text-slate-900">
        <Sidebar />
        <main className="min-w-0 flex-1 p-2 sm:p-4 lg:p-6 overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
