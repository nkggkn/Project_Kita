import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./project.css";
import "./interaction.css";
import "./caregiver.css";
import LanguageProvider from "./language-provider";
import AppRegistration from "./app-registration";
import "./mobile-app.css";
import PlayfulExperience from "./playful-experience";
import "./playful.css";
import "./tricolor-theme.css";
import "./watch.css";
export const viewport: Viewport = {themeColor:"#2258a6",viewportFit:"cover"};

export const metadata: Metadata = {
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: "Kaki Kita", statusBarStyle: "default" },
  title: "Kaki Kita AI | Your AI Kaki. Looking Out for All of Us.",
  description: "Kita Vision photo analysis, Kita Watch video review, Kita Safety checklists, Kaki Kopi community services, and your private room library. By PROJECT KITA.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><AppRegistration/><LanguageProvider><PlayfulExperience>{children}</PlayfulExperience></LanguageProvider></body>
    </html>
  );
}
