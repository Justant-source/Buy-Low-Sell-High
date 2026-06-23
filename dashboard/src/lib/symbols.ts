export interface SymbolMetadata {
  symbol: string;
  csvFilename: string;
}

const SYMBOLS: SymbolMetadata[] = [
  {
    symbol: "SOXL",
    csvFilename: "soxl_daily_2011_present.csv",
  },
  {
    symbol: "TQQQ",
    csvFilename: "tqqq_daily_2011_present.csv",
  },
  {
    symbol: "KORU",
    csvFilename: "koru_daily_2013_present.csv",
  },
  {
    symbol: "000660",
    csvFilename: "000660_daily_2015_present.csv",
  },
  {
    symbol: "0193T0",
    csvFilename: "0193t0_daily_2015_present.csv",
  },
  {
    symbol: "233740",
    csvFilename: "233740_daily_2015_present.csv",
  },
  {
    symbol: "462330",
    csvFilename: "462330_daily_2023_present.csv",
  },
];

export function getSymbolMetadata(symbol: string): SymbolMetadata | undefined {
  const upperSymbol = symbol.toUpperCase();
  return SYMBOLS.find((entry) => entry.symbol === upperSymbol);
}

export function defaultCsvFilenameForSymbol(symbol: string): string {
  return getSymbolMetadata(symbol)?.csvFilename ?? `${symbol.toLowerCase()}_daily_2011_present.csv`;
}
