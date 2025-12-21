// src/managers/index.ts
import { ETH15mKlineManager } from './eth15m.kline-manager.js'
import { ETH1hKlineManager } from './eth1h.kline-manager.js'
import { ETH4hKlineManager } from './eth4h.kline-manager.js'
import { ETH5mKlineManager } from './eth5m.kline-manager.js'

export const eth5mManager = new ETH5mKlineManager()
export const eth15mManager = new ETH15mKlineManager()
export const eth1hManager = new ETH1hKlineManager()
export const eth4hManager = new ETH4hKlineManager()
