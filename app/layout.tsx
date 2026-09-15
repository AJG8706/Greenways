import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { atkinsonHyperlegibleNext, zillaSlab } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greenways",
  description: "Walk the land. Find every corner. — by Texas Greener Pastures",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32" },
      { url: "/brand/favicon-16.png", sizes: "16x16" },
    ],
    apple: "/brand/apple-touch-icon-180.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${zillaSlab.variable} ${atkinsonHyperlegibleNext.variable}`}
    >
      <body className="gw">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
