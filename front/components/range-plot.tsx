"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface DistributionStats {
  mean: number
  median: number
  std: number
  min: number
  max: number
  n: number
}

interface RangePlotProps {
  stats: DistributionStats
  label: string
  colorClass: "primary" | "secondary" | "accent"
  height?: number
}

export function RangePlot({ stats, label, colorClass, height = 60 }: RangePlotProps) {
  const { mean, median, std, min, max } = stats
  
  // Calculate positions (0-100% of width)
  const range = max - min
  const meanPos = range > 0 ? ((mean - min) / range) * 100 : 50
  const medianPos = range > 0 ? ((median - min) / range) * 100 : 50
  const meanMinusStd = Math.max(min, mean - std)
  const meanPlusStd = Math.min(max, mean + std)
  const stdBandLeft = range > 0 ? ((meanMinusStd - min) / range) * 100 : 0
  const stdBandRight = range > 0 ? ((meanPlusStd - min) / range) * 100 : 100
  const stdBandWidth = stdBandRight - stdBandLeft

  // Color classes based on theme
  const colorMap = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    accent: "bg-accent"
  }

  const dotColorMap = {
    primary: "bg-primary border-primary-foreground",
    secondary: "bg-secondary border-secondary-foreground",
    accent: "bg-accent border-accent-foreground"
  }

  const bandColorMap = {
    primary: "bg-primary/60",
    secondary: "bg-secondary/60",
    accent: "bg-accent/60"
  }

  const tooltipContent = (
    <div className="text-xs space-y-1">
      <div className="font-semibold">{label}</div>
      <div className="space-y-0.5 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <span>Mean:</span>
          <span className="tabular-nums font-medium">{mean.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Median:</span>
          <span className="tabular-nums font-medium">{median.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Std Dev:</span>
          <span className="tabular-nums font-medium">{std.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Min:</span>
          <span className="tabular-nums font-medium">{min.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Max:</span>
          <span className="tabular-nums font-medium">{max.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
          <span>Count:</span>
          <span className="tabular-nums font-medium">{stats.n.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={cn(
              "cursor-help group",
              label ? "flex items-center gap-4" : "w-full"
            )}
            style={{ height: `${height}px` }}
          >
            {/* Label */}
            {label && (
              <div className="text-sm font-medium text-foreground min-w-[100px] text-right">
                {label}
              </div>
            )}
            
            {/* Plot area */}
            <div className={cn("relative", label ? "flex-1" : "w-full")} style={{ height: `${height}px` }}>
              {/* Outer line: min-max */}
              <div 
                className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 border-t border-dashed border-border/50"
              />
              
              {/* Thick inner band: mean ± std */}
              {stdBandWidth > 0 && (
                <div
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 h-4 rounded-sm transition-opacity group-hover:opacity-80",
                    bandColorMap[colorClass]
                  )}
                  style={{
                    left: `${stdBandLeft}%`,
                    width: `${stdBandWidth}%`,
                  }}
                />
              )}
              
              {/* Dot: mean */}
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2 transition-transform group-hover:scale-125",
                  dotColorMap[colorClass]
                )}
                style={{
                  left: `${meanPos}%`,
                }}
              />
              
              {/* Small vertical tick: median */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-3 bg-foreground/70 transition-opacity group-hover:opacity-100 opacity-80"
                style={{
                  left: `${medianPos}%`,
                }}
              />
              
              {/* Min label */}
              <div 
                className="absolute text-xs font-medium tabular-nums text-muted-foreground bottom-1 left-0 opacity-70"
              >
                {min.toFixed(1)}
              </div>
              
              {/* Max label */}
              <div 
                className="absolute text-xs font-medium tabular-nums text-muted-foreground bottom-1 right-0 opacity-70"
              >
                {max.toFixed(1)}
              </div>
              
              {/* Mean label */}
              <div 
                className="absolute text-xs font-medium tabular-nums text-foreground top-0 transition-opacity group-hover:opacity-100 opacity-90"
                style={{ 
                  left: `${meanPos}%`,
                  transform: 'translateX(-50%)'
                }}
              >
                {mean.toFixed(1)}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
