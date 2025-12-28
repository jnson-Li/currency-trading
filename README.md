# currency-trading
多周期回测时序图

时间轴  ───────────────────────────────────────────────>

5m K线:  |k1|k2|k3|k4|k5|k6|k7|k8|k9|k10|k11|k12|k13|...

          └───┬───┘
              │
15m K线:     |K1|        |K2|        |K3|        |K4|
              ▲            ▲            ▲
              │            │            │
        15m 收盘点     15m 收盘点   15m 收盘点

          └───────────────┬─────────────────────────┘
                          │
1h K线:                  |H1|                    |H2|
                          ▲
                          │
                    1h 收盘点

          └──────────────────────────────────────────┬──────────────┘
                                                      │
4h K线:                                              |4H1|
                                                      ▲
                                                      │
                                                 4h 收盘点
给我画一个个人量化交易系统思维导图，目前主要做ETH合约短线交易，我使用的后端语言是nodejs，我现在写的是实时检测币安ETH多周期k线数据，目前的周期有5m、15m、1h、4h，系统启动的时候会初始化每个周期类，周期里面会拉取币安的历史k线数据，并连接WS实时获取k线实时数据，并通过MultiTimeframeCoordinator多周期管理器检测每个WS的连接状态，如果每个WS连接状态都是健康的，就会在5mk线关闭的时候启动一个策略引擎类StrategyEngine，进行策略计算并调用gpt接口询问是否可以交易，如果可以交易就会调用币安接口进行自动交易。并且我想有一个回测系统，我会把币安往前推6个月的5m历史k线数据拉取下来并缓存到本地，使用实盘多周期系统策略对历史k线进行回测，回测系统设置初始资金手续费滑点，通过策略计算什么时候开仓平仓做多做空，最后计算得出最后资金

5m Kline close
   ↓
ETH5mKlineManager.emitClose()
   ↓
bindEvents 捕获
   ↓
coordinator.onIntervalClosed('5m')
   ↓
coordinator.recomputeState()
   ↓
if (permission.allowed)
   ↓
StrategyContextBuilder.build()
   ↓
StrategyEngine.evaluate()
