import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Navigation from "@/components/ui/Navigation";
import Link from "next/link";
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
            <footer className="bg-white mt-auto">
              <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">
                      Company
                    </h3>
                    <ul className="mt-4 space-y-4">
                      <li>
                        <Link href="/about" className="text-gray-500 hover:text-gray-900">
                          About
                        </Link>
                      </li>
                      <li>
                        <Link href="/contact" className="text-gray-500 hover:text-gray-900">
                          Contact
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">
                      Creators
                    </h3>
                    <ul className="mt-4 space-y-4">
                      <li>
                        <Link href="/join-creator" className="text-gray-500 hover:text-gray-900">
                          Join as Creator
                        </Link>
                      </li>
                      <li>
                        <Link href="/career" className="text-gray-500 hover:text-gray-900">
                          Join Us
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">
                      Brands
                    </h3>
                    <ul className="mt-4 space-y-4">
                      <li>
                        <Link href="/how-it-works" className="text-gray-500 hover:text-gray-900">
                          How it Works
                        </Link>
                      </li>
                      <li>
                        <Link href="/join-brand" className="text-gray-500 hover:text-gray-900">
                          Join as Brand
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">
                      Legal
                    </h3>
                    <ul className="mt-4 space-y-4">
                      <li>
                        <Link href="/privacy" className="text-gray-500 hover:text-gray-900">
                          Privacy
                        </Link>
                      </li>
                      <li>
                        <Link href="/terms" className="text-gray-500 hover:text-gray-900">
                          Terms
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
