import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elerent Monitor",
  description: "Monitoraggio delle città e degli affiliati Elerent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
