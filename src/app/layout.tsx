import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Hour",
  description: "Calm, step-by-step help right after an online scam: evidence, 1930, cybercrime.gov.in and bank letters.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
