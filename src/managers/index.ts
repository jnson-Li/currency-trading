// src/managers/index.ts
import { ETH15mKlineManager } from './eth15m.kline-manager.js'
import { ETH1hKlineManager } from './eth1h.kline-manager.js'

export const eth15mManager = new ETH15mKlineManager()
export const eth1hManager = new ETH1hKlineManager()
