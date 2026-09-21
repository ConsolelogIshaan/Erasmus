import localFont from "next/font/local";

/**
 * Instrument Sans — primary typeface for Erasmus.
 * Grotesque sans-serif with geometric precision and modern personality.
 * Loaded from local variable TTF fonts provided in /src/assets/fonts/instrument-sans.
 */
export const instrumentSans = localFont({
  src: [
    {
      path: "../../assets/fonts/instrument-sans/InstrumentSans-Variable.ttf",
      style: "normal",
    },
    {
      path: "../../assets/fonts/instrument-sans/InstrumentSans-Italic-Variable.ttf",
      style: "italic",
    },
  ],
  variable: "--font-instrument-sans",
  display: "swap",
});
