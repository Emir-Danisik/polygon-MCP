// src/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { 
  StockData,
  PolygonStockResponse,
  isValidStockPriceArgs 
} from "./types.js";

dotenv.config();

const API_KEY = process.env.POLYGON_API_KEY;
if (!API_KEY) {
  throw new Error("POLYGON_API_KEY environment variable is required");
}

const API_CONFIG = {
  BASE_URL: 'https://api.polygon.io/v1',
  DEFAULT_SYMBOL: 'AAPL',
  ENDPOINTS: {
    LAST_TRADE: 'last/stocks',
    DAILY_OPEN_CLOSE: 'open-close'
  }
} as const;

class PolygonServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server({
      name: "polygon-stock-server",
      version: "0.1.0"
    }, {
      capabilities: {
        resources: {},
        tools: {}
      }
    });

    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      params: {
        apiKey: API_KEY
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [{
          uri: `stock://${API_CONFIG.DEFAULT_SYMBOL}/current`,
          name: `Current stock price for ${API_CONFIG.DEFAULT_SYMBOL}`,
          mimeType: "application/json",
          description: "Real-time stock data including price, volume, and daily stats"
        }]
      })
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const symbol = API_CONFIG.DEFAULT_SYMBOL;
        if (request.params.uri !== `stock://${symbol}/current`) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }

        try {
          const response = await this.axiosInstance.get<PolygonStockResponse>(
            `${API_CONFIG.ENDPOINTS.LAST_TRADE}/${symbol}`,
          );

          const stockData: StockData = {
            symbol: response.data.symbol,
            price: response.data.close,
            open: response.data.open,
            high: response.data.high,
            low: response.data.low,
            volume: response.data.volume,
            timestamp: new Date().toISOString()
          };

          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(stockData, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              `Polygon API error: ${error.response?.data.message ?? error.message}`
            );
          }
          throw error;
        }
      }
    );
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [{
          name: "get_stock_price",
          description: "Get stock price information for a specific symbol",
          inputSchema: {
            type: "object",
            properties: {
              symbol: {
                type: "string",
                description: "Stock symbol (e.g., AAPL)"
              },
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format (optional, defaults to latest)"
              }
            },
            required: ["symbol", "date"]
          }
        }]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name !== "get_stock_price") {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }

        if (!isValidStockPriceArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid stock price arguments"
          );
        }

        const { symbol, date } = request.params.arguments;

        try {
          let endpoint = `${API_CONFIG.ENDPOINTS.LAST_TRADE}/${symbol}`;
          
          if (date) {
            endpoint = `${API_CONFIG.ENDPOINTS.DAILY_OPEN_CLOSE}/${symbol}/${date}`;
          }

          const response = await this.axiosInstance.get<PolygonStockResponse>(endpoint);

          const stockData: StockData = {
            symbol: response.data.symbol,
            price: response.data.close,
            open: response.data.open,
            high: response.data.high,
            low: response.data.low,
            volume: response.data.volume,
            timestamp: response.data.from || new Date().toISOString()
          };

          return {
            content: [{
              type: "text",
              text: JSON.stringify(stockData, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            return {
              content: [{
                type: "text",
                text: `Polygon API error: ${error.response?.data.message ?? error.message}`
              }],
              isError: true,
            }
          }
          throw error;
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Polygon Stock MCP server running on stdio");
  }
}

const server = new PolygonServer();
server.run().catch(console.error);