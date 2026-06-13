import type { Metadata } from "next";
import "./globals.css";
import DynamicTitle from "@/components/DynamicTitle";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Colegio Hub";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Colegio Hub — SaaS control plane",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DynamicTitle />
        {children}
      </body>
    </html>
  );
}
