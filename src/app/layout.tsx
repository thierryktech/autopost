import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Thai, Prompt } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const prompt = Prompt({ subsets: ["thai", "latin"], variable: "--font-prompt", display: "swap", weight: ["500", "700"] });
const thai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-thai", display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Balena Reel Studio", template: "%s · Balena Reel Studio" },
  description: "Turn your coffee footage into Facebook Reels.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Balena Reels", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2b4a4e",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${thai.variable} ${prompt.variable}`}>
      <body>{children}</body>
    </html>
  );
}
