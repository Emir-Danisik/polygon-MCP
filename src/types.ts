// src/types.ts
export interface PolygonStockResponse {
    status: string;
    from: string;
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    afterHours: number;
    preMarket: number;
  }
  
  export interface StockData {
    symbol: string;
    price: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    timestamp: string;
  }
  
  export interface GetStockPriceArgs {
    symbol: string;
    date?: string;
  }
  
  // Type guard for stock price arguments
  export function isValidStockPriceArgs(args: any): args is GetStockPriceArgs {
    return (
      typeof args === "object" &&
      args !== null &&
      "symbol" in args &&
      typeof args.symbol === "string" &&
      (args.date === undefined || typeof args.date === "string")
    );
  }