import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hundred Tiny Users",
  description: "Synthetic browser users attack a hackathon portal."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
