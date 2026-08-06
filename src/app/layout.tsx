import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Navigation from "@/components/ui/Navigation";
import Footer from "@/components/ui/Footer";
import { Providers } from "./providers";
import "../styles/globals.css";
import "@/styles/scrollbar-hide.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Creator-Brand Collaboration Platform",
  description: "Connect with amazing content creators",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <body className="font-body">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navigation />
            <div className="flex-grow">{children}</div>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
