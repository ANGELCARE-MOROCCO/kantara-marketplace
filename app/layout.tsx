import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { getLocalizationDisplayState } from "./lib/i18n";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kantara | Managed Morocco stays marketplace",
  description:
    "Kantara is the trusted bridge to Morocco: verified homes, clear rules, local intelligence, and managed marketplace confidence.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localization = await getLocalizationDisplayState();

  return (
    <html lang={localization.selectedLanguage} dir={localization.dir}>
      <body className={inter.className}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
