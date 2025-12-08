"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { useUIStore } from "@/lib/stores/ui"

interface BoxplotData {
  label: string
  values: number[]
  color?: string
}

interface BoxplotChartProps {
  data: BoxplotData[]
  title: string
  xAxisLabel?: string
  yAxisLabel?: string
  height?: number
  useLogScale?: boolean
}

interface BoxplotStats {
  label: string
  color: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers: number[]
  values: number[]
}

export function BoxplotChart({
  data,
  title,
  xAxisLabel,
  yAxisLabel = 'Value',
  height = 400,
  useLogScale = false,
}: BoxplotChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height })
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === 'dark'
  const previousDataRef = useRef<string>("")
  
  const textColor = isDark ? '#e5e7eb' : '#0f172a'
  const gridColor = isDark ? 'rgba(156, 163, 175, 0.1)' : 'rgba(100, 116, 139, 0.1)'
  const axisColor = isDark ? '#9ca3af' : '#64748b'
  const backgroundColor = isDark ? '#1e293b' : '#f8fafc'

  // Use resize observer for responsive sizing
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width)
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const margin = { top: 20, right: 20, bottom: 80, left: 60 }
    const width = Math.max(containerWidth - margin.left - margin.right, 300)
    const chartHeight = height - margin.top - margin.bottom

    setDimensions({ width, height: chartHeight })

    // Filter valid data
    const validData = data.map(d => ({
      ...d,
      values: d.values.filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
    })).filter(d => d.values.length > 0)

    if (validData.length === 0) {
      // Clear if no data
      d3.select(svgRef.current).selectAll("*").remove()
      return
    }

    // Calculate statistics for each dataset
    const boxplotStats: BoxplotStats[] = validData.map(d => {
      const sorted = [...d.values].sort((a, b) => a - b)
      const q1 = d3.quantile(sorted, 0.25) || 0
      const q2 = d3.quantile(sorted, 0.5) || 0 // median
      const q3 = d3.quantile(sorted, 0.75) || 0
      const iqr = q3 - q1
      const min = Math.max(sorted[0], q1 - 1.5 * iqr) // Lower whisker
      const max = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr) // Upper whisker
      const outliers = sorted.filter(v => v < min || v > max)

      return {
        label: d.label,
        color: d.color || (isDark ? '#3b82f6' : '#2563eb'),
        min,
        q1,
        median: q2,
        q3,
        max,
        outliers,
        values: d.values
      }
    })

    // Get overall domain for y-axis
    const allValues = boxplotStats.flatMap(d => d.values)
    const yDomain = d3.extent(allValues) as [number, number]

    // Check if this is the first render
    const isFirstRender = !svgRef.current.querySelector('g.main-group')
    const dataKey = JSON.stringify(boxplotStats.map(s => s.label))
    const dataChanged = previousDataRef.current !== dataKey
    previousDataRef.current = dataKey

    // Initialize SVG if needed
    let svg = d3.select(svgRef.current)
    if (isFirstRender) {
      svg.attr("width", width + margin.left + margin.right)
        .attr("height", height)
    }

    // Get or create main group
    let g = svg.select<SVGGElement>('g.main-group')
    if (g.empty()) {
      g = svg.append("g")
        .attr("class", "main-group")
        .attr("transform", `translate(${margin.left},${margin.top})`)
    }

    // Scales
    const xScale = d3.scaleBand()
      .domain(boxplotStats.map(d => d.label))
      .range([0, width])
      .padding(0.3)

    const boxWidth = xScale.bandwidth()

    const yScale = useLogScale
      ? d3.scaleLog()
          .domain([Math.max(yDomain[0], 0.001), yDomain[1]])
          .range([chartHeight, 0])
          .nice()
      : d3.scaleLinear()
          .domain(yDomain)
          .range([chartHeight, 0])
          .nice()

    // Update or create grid
    let gridGroup = g.select<SVGGElement>('g.grid')
    if (gridGroup.empty()) {
      gridGroup = g.append("g").attr("class", "grid")
    }
    
    const yAxisGrid = d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat(() => "")
      .ticks(5)

    gridGroup
      .transition()
      .duration(dataChanged ? 800 : 0)
      .ease(d3.easeQuadInOut)
      .call(yAxisGrid as any)
      .attr("stroke", gridColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")

    // Update or create X Axis (just the line, no labels)
    let xAxisGroup = g.select<SVGGElement>('g.x-axis')
    if (xAxisGroup.empty()) {
      xAxisGroup = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${chartHeight})`)
    }

    const xAxis = d3.axisBottom(xScale)
      .tickFormat(() => "") // Remove text labels
    
    // Call axis to create/update structure
    xAxisGroup
      .transition()
      .duration(dataChanged ? 800 : 0)
      .ease(d3.easeQuadInOut)
      .call(xAxis as any)

    xAxisGroup.selectAll("line, path")
      .attr("stroke", axisColor)

    // Create legend below the chart
    let legendGroup = g.select<SVGGElement>('g.legend')
    if (legendGroup.empty()) {
      legendGroup = g.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width / 2},${chartHeight + 40})`)
    }

    const legendItems = legendGroup
      .selectAll<SVGGElement, BoxplotStats>("g.legend-item")
      .data(boxplotStats, d => d.label)

    // Exit: remove old legend items
    legendItems.exit()
      .transition()
      .duration(800)
      .ease(d3.easeQuadInOut)
      .attr("opacity", 0)
      .remove()

    // Enter: create new legend items
    const legendItemsEnter = legendItems.enter()
      .append("g")
      .attr("class", "legend-item")
      .attr("opacity", 0)

    // Update: transition all legend items
    const legendItemsUpdate = legendItemsEnter.merge(legendItems)

    // Calculate legend item positions (centered, horizontal layout)
    const legendItemWidth = 120
    const legendStartX = -(boxplotStats.length * legendItemWidth) / 2

    legendItemsUpdate.each(function(d, i) {
      const itemGroup = d3.select(this)
      const itemX = legendStartX + i * legendItemWidth

      // Color indicator
      let colorRect = itemGroup.select<SVGRectElement>("rect")
      if (colorRect.empty()) {
        colorRect = itemGroup.append("rect")
          .attr("width", 12)
          .attr("height", 12)
          .attr("rx", 2)
      }
      colorRect
        .transition()
        .duration(dataChanged ? 800 : 0)
        .ease(d3.easeQuadInOut)
        .attr("x", itemX)
        .attr("y", -6)
        .attr("fill", d.color)

      // Label text (vertically centered with color rect)
      let labelText = itemGroup.select<SVGTextElement>("text")
      if (labelText.empty()) {
        labelText = itemGroup.append("text")
          .attr("fill", textColor)
          .attr("font-size", "11px")
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "middle")
      }
      labelText
        .transition()
        .duration(dataChanged ? 800 : 0)
        .ease(d3.easeQuadInOut)
        .attr("x", itemX + 16)
        .attr("y", 0)
        .text(d.label)
        .attr("opacity", 1)
        .attr("dominant-baseline", "middle")
    })

    // Update legend group position to center it
    legendGroup
      .transition()
      .duration(dataChanged ? 800 : 0)
      .ease(d3.easeQuadInOut)
      .attr("transform", `translate(${width / 2},${chartHeight + 40})`)

    // Fade in new legend items
    legendItemsEnter
      .transition()
      .duration(800)
      .ease(d3.easeQuadInOut)
      .attr("opacity", 1)

    // Update or create Y Axis
    let yAxisGroup = g.select<SVGGElement>('g.y-axis')
    if (yAxisGroup.empty()) {
      yAxisGroup = g.append("g").attr("class", "y-axis")
    }

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => {
        const value = d as number
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
        return value.toFixed(0)
      })

    yAxisGroup
      .transition()
      .duration(dataChanged ? 800 : 0)
      .ease(d3.easeQuadInOut)
      .call(yAxis as any)

    yAxisGroup.selectAll("text")
      .attr("fill", axisColor)
      .attr("font-size", "11px")

    yAxisGroup.selectAll("line, path")
      .attr("stroke", axisColor)

    // Update or create Y Axis Label
    let yAxisLabelEl = g.select<SVGTextElement>('text.y-axis-label')
    if (yAxisLabelEl.empty()) {
      yAxisLabelEl = g.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -chartHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", textColor)
        .attr("font-size", "12px")
        .attr("font-weight", "500")
    }
    yAxisLabelEl.text(yAxisLabel)

    // Get or create boxplots container
    let boxplotsGroup = g.select<SVGGElement>('g.boxplots')
    if (boxplotsGroup.empty()) {
      boxplotsGroup = g.append("g").attr("class", "boxplots")
    }

    // Bind data to boxplot groups
    const boxplotGroups = boxplotsGroup
      .selectAll<SVGGElement, BoxplotStats>("g.boxplot")
      .data(boxplotStats, d => d.label)

    // Exit: remove old boxplots
    boxplotGroups.exit()
      .transition()
      .duration(800)
      .ease(d3.easeQuadInOut)
      .attr("opacity", 0)
      .attr("transform", (d: any) => {
        const x = xScale(d.label) || 0
        return `translate(${x},${chartHeight / 2}) scale(0)`
      })
      .remove()

    // Enter: add new boxplots
    const boxplotEnter = boxplotGroups.enter()
      .append("g")
      .attr("class", "boxplot")
      .attr("opacity", 0)
      .attr("transform", (d: any) => {
        const x = xScale(d.label) || 0
        return `translate(${x},${chartHeight / 2}) scale(0)`
      })

    // Merge enter and update
    const boxplotUpdate = boxplotEnter.merge(boxplotGroups)

    // Animate boxplots to their positions with smooth x-axis updates
    boxplotUpdate
      .transition()
      .duration(dataChanged ? 800 : 0)
      .ease(d3.easeQuadInOut)
      .attr("opacity", 1)
      .attr("transform", (d: any) => {
        const x = xScale(d.label) || 0
        return `translate(${x},0)`
      })

    // Draw boxplot elements for each group
    boxplotUpdate.each(function(stats: BoxplotStats) {
      const group = d3.select(this)
      const x = 0 // Already translated
      const color = stats.color
      const transitionDuration = dataChanged ? 800 : 0

      // Box (Q1 to Q3)
      let box = group.select<SVGRectElement>("rect.box")
      if (box.empty()) {
        box = group.append("rect")
          .attr("class", "box")
          .attr("y", yScale(stats.q3))
          .attr("width", boxWidth)
          .attr("height", yScale(stats.q1) - yScale(stats.q3))
          .attr("fill", color)
          .attr("fill-opacity", 0.2)
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
      }
      box.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("y", yScale(stats.q3))
        .attr("height", yScale(stats.q1) - yScale(stats.q3))
        .attr("width", boxWidth)
        .attr("fill", color)
        .attr("stroke", color)

      // Median line
      let medianLine = group.select<SVGLineElement>("line.median")
      if (medianLine.empty()) {
        medianLine = group.append("line")
          .attr("class", "median")
          .attr("x1", 0)
          .attr("x2", boxWidth)
          .attr("y1", yScale(stats.median))
          .attr("y2", yScale(stats.median))
          .attr("stroke", color)
          .attr("stroke-width", 2)
      }
      medianLine.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("x2", boxWidth)
        .attr("y1", yScale(stats.median))
        .attr("y2", yScale(stats.median))
        .attr("stroke", color)

      // Lower whisker
      let lowerWhisker = group.select<SVGLineElement>("line.lower-whisker")
      if (lowerWhisker.empty()) {
        lowerWhisker = group.append("line")
          .attr("class", "lower-whisker")
          .attr("x1", boxWidth / 2)
          .attr("x2", boxWidth / 2)
          .attr("y1", yScale(stats.min))
          .attr("y2", yScale(stats.q1))
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
      }
      lowerWhisker.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("x1", boxWidth / 2)
        .attr("x2", boxWidth / 2)
        .attr("y1", yScale(stats.min))
        .attr("y2", yScale(stats.q1))
        .attr("stroke", color)

      // Upper whisker
      let upperWhisker = group.select<SVGLineElement>("line.upper-whisker")
      if (upperWhisker.empty()) {
        upperWhisker = group.append("line")
          .attr("class", "upper-whisker")
          .attr("x1", boxWidth / 2)
          .attr("x2", boxWidth / 2)
          .attr("y1", yScale(stats.q3))
          .attr("y2", yScale(stats.max))
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
      }
      upperWhisker.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("x1", boxWidth / 2)
        .attr("x2", boxWidth / 2)
        .attr("y1", yScale(stats.q3))
        .attr("y2", yScale(stats.max))
        .attr("stroke", color)

      // Whisker caps
      const capWidth = boxWidth * 0.3
      
      // Lower cap
      let lowerCap = group.select<SVGLineElement>("line.lower-cap")
      if (lowerCap.empty()) {
        lowerCap = group.append("line")
          .attr("class", "lower-cap")
          .attr("x1", boxWidth / 2 - capWidth / 2)
          .attr("x2", boxWidth / 2 + capWidth / 2)
          .attr("y1", yScale(stats.min))
          .attr("y2", yScale(stats.min))
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
      }
      lowerCap.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("x1", boxWidth / 2 - capWidth / 2)
        .attr("x2", boxWidth / 2 + capWidth / 2)
        .attr("y1", yScale(stats.min))
        .attr("y2", yScale(stats.min))
        .attr("stroke", color)

      // Upper cap
      let upperCap = group.select<SVGLineElement>("line.upper-cap")
      if (upperCap.empty()) {
        upperCap = group.append("line")
          .attr("class", "upper-cap")
          .attr("x1", boxWidth / 2 - capWidth / 2)
          .attr("x2", boxWidth / 2 + capWidth / 2)
          .attr("y1", yScale(stats.max))
          .attr("y2", yScale(stats.max))
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
      }
      upperCap.transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("x1", boxWidth / 2 - capWidth / 2)
        .attr("x2", boxWidth / 2 + capWidth / 2)
        .attr("y1", yScale(stats.max))
        .attr("y2", yScale(stats.max))
        .attr("stroke", color)

      // Outliers
      const outliers = group.selectAll<SVGCircleElement, number>("circle.outlier")
        .data(stats.outliers)

      outliers.exit()
        .transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("opacity", 0)
        .attr("r", 0)
        .remove()

      outliers.enter()
        .append("circle")
        .attr("class", "outlier")
        .attr("cx", boxWidth / 2)
        .attr("cy", (d: number) => yScale(d))
        .attr("r", 0)
        .attr("fill", color)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("opacity", 0.7)
        .merge(outliers)
        .transition()
        .duration(transitionDuration)
        .ease(d3.easeQuadInOut)
        .attr("cx", boxWidth / 2)
        .attr("r", 3)
        .attr("cy", (d: number) => yScale(d))
    })

    // Tooltip - create once and reuse
    let tooltip = d3.select("body").select<HTMLDivElement>("div.boxplot-tooltip")
    if (tooltip.empty()) {
      tooltip = d3.select("body").append("div")
        .attr("class", "boxplot-tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background", isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)")
        .style("border", `1px solid ${isDark ? '#334155' : '#e2e8f0'}`)
        .style("border-radius", "6px")
        .style("padding", "8px 12px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("box-shadow", "0 4px 6px -1px rgba(0, 0, 0, 0.1)")
        .style("z-index", "1000")
    }

    // Add hover interactions
    boxplotUpdate.selectAll("rect.box, line.median, line.lower-whisker, line.upper-whisker")
      .on("mouseover", function(event, d) {
        const stats = d as BoxplotStats
        tooltip.transition()
          .duration(200)
          .style("opacity", 1)

        tooltip.html(`
          <div style="font-weight: 600; color: ${textColor}; margin-bottom: 4px;">
            ${stats.label}
          </div>
          <div style="color: ${axisColor};">
            <strong>Min:</strong> ${stats.min.toFixed(2)}<br/>
            <strong>Q1:</strong> ${stats.q1.toFixed(2)}<br/>
            <strong>Median:</strong> ${stats.median.toFixed(2)}<br/>
            <strong>Q3:</strong> ${stats.q3.toFixed(2)}<br/>
            <strong>Max:</strong> ${stats.max.toFixed(2)}<br/>
            <strong>Outliers:</strong> ${stats.outliers.length}<br/>
            <strong>Count:</strong> ${stats.values.length}
          </div>
        `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 10) + "px")
      })
      .on("mouseout", function() {
        tooltip.transition()
          .duration(200)
          .style("opacity", 0)
      })

  }, [data, containerWidth, height, textColor, axisColor, gridColor, backgroundColor, xAxisLabel, yAxisLabel, title, isDark, useLogScale])

  // Cleanup tooltip on unmount
  useEffect(() => {
    return () => {
      d3.select("body").select("div.boxplot-tooltip").remove()
    }
  }, [])

  if (data.length === 0 || data.every(d => d.values.length === 0)) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-sm text-muted-foreground">No valid data to display</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
