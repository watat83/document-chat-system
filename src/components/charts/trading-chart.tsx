'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

// Dynamic import for recharts to avoid SSR issues
import dynamic from 'next/dynamic'

const LineChart = dynamic(
  () => import('recharts').then((mod) => mod.LineChart),
  { ssr: false }
)
const Line = dynamic(
  () => import('recharts').then((mod) => mod.Line),
  { ssr: false }
)
const XAxis = dynamic(
  () => import('recharts').then((mod) => mod.XAxis),
  { ssr: false }
)
const YAxis = dynamic(
  () => import('recharts').then((mod) => mod.YAxis),
  { ssr: false }
)
const CartesianGrid = dynamic(
  () => import('recharts').then((mod) => mod.CartesianGrid),
  { ssr: false }
)
const Tooltip = dynamic(
  () => import('recharts').then((mod) => mod.Tooltip),
  { ssr: false }
)
const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
)

interface TradingChartProps {
  symbol: string
  height?: number
  showControls?: boolean
  className?: string
}

interface PriceDataPoint {
  time: string
  price: number
  change: number
}

// Generate mock trading data for demonstration
const generateMockData = (symbol: string): PriceDataPoint[] => {
  const data: PriceDataPoint[] = []
  let basePrice = 100
  
  // Set different base prices for different symbols
  switch (symbol.toUpperCase()) {
    case 'BTC':
      basePrice = 45000
      break
    case 'ETH':
      basePrice = 2800
      break
    case 'AAPL':
      basePrice = 180
      break
    case 'GOOGL':
      basePrice = 140
      break
    case 'SPY':
      basePrice = 450
      break
    default:
      basePrice = 100
  }

  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    
    // Create realistic price movement
    const volatility = basePrice * 0.02 // 2% volatility
    const change = (Math.random() - 0.5) * volatility
    basePrice = Math.max(basePrice + change, basePrice * 0.8) // Prevent negative prices
    
    data.push({
      time: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Number(basePrice.toFixed(2)),
      change: Number(change.toFixed(2))
    })
  }
  
  return data
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const isPositive = data.change >= 0
    
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
          ${payload[0].value.toLocaleString()}
        </p>
        <p className={`text-sm flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
          {isPositive ? '+' : ''}${data.change.toFixed(2)} ({((data.change / data.price) * 100).toFixed(2)}%)
        </p>
      </div>
    )
  }
  
  return null
}

export function TradingChart({ symbol, height = 400, showControls = true, className }: TradingChartProps) {
  const [data, setData] = useState<PriceDataPoint[]>([])
  const [timeframe, setTimeframe] = useState('30D')
  const [isLoading, setIsLoading] = useState(true)

  const [previousInput, setPreviousInput] = useState({ symbol, timeframe })
  if (previousInput.symbol !== symbol || previousInput.timeframe !== timeframe) {
    setPreviousInput({ symbol, timeframe })
    setIsLoading(true)
  }

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      setData(generateMockData(symbol))
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [symbol, timeframe])

  const currentPrice = data[data.length - 1]?.price || 0
  const previousPrice = data[data.length - 2]?.price || 0
  const priceChange = currentPrice - previousPrice
  const percentChange = previousPrice ? (priceChange / previousPrice) * 100 : 0
  const isPositive = priceChange >= 0

  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                {symbol.toUpperCase()}
              </CardTitle>
              <CardDescription>Loading chart data...</CardDescription>
            </div>
            <Badge variant="outline">
              <Activity className="h-3 w-3 mr-1" />
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              {symbol.toUpperCase()}
            </CardTitle>
            <CardDescription>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${currentPrice.toLocaleString()}
                </span>
                <span className={`flex items-center text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {isPositive ? '+' : ''}${priceChange.toFixed(2)} ({percentChange.toFixed(2)}%)
                </span>
              </div>
            </CardDescription>
          </div>
          <Badge variant="outline">
            <Activity className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
        
        {showControls && (
          <div className="flex space-x-2">
            {['1D', '7D', '30D', '1Y'].map((period) => (
              <Button
                key={period}
                variant={timeframe === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeframe(period)}
                className="h-8"
              >
                {period}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: height }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis 
                dataKey="time" 
                className="text-gray-600 dark:text-gray-400"
                fontSize={12}
              />
              <YAxis 
                className="text-gray-600 dark:text-gray-400"
                fontSize={12}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#16a34a' : '#dc2626'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, className: 'fill-current' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          * This is demo data for illustration purposes. Real financial data would require external API integration.
        </div>
      </CardContent>
    </Card>
  )
}