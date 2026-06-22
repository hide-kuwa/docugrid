import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuGrid",
  description: "Tax Document Matrix",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-100">
        {children}
      </body>
    </html>
  );
}