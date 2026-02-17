"use client"

import { useEffect, useState, useRef } from "react"
import * as d3 from "d3"
import { Network } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useTreeStructure, useFilteredTreeByRootTaxon } from "@/lib/stores/flattened-tree"
import type { FlatTreeNode } from "@/lib/api/taxons"

interface TreeOfLifeD3Props {
  title?: string
  description?: React.ReactNode
  rootTaxid?: string | null
  onTaxonSelect?: (taxid: string, taxon: FlatTreeNode) => void
}

export function TreeOfLifeD3New({ title, description, rootTaxid = null, onTaxonSelect }: TreeOfLifeD3Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const hoveredNodeRef = useRef<any>(null)
  const zoomBehaviorRef = useRef<any>(null)
  const nodesArrayRef = useRef<any[]>([])
  const drawFunctionRef = useRef<((transform: d3.ZoomTransform) => void) | null>(null)
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === 'dark'

  // Use store for data management
  const {
    isLoading: loading,
    error,
    fetchFlattenedTree,
  } = useFlattenedTreeStore()

  const fullTreeStructure = useTreeStructure()
  const filteredTreeStructure = useFilteredTreeByRootTaxon(rootTaxid)
  const treeStructure = rootTaxid ? filteredTreeStructure : fullTreeStructure

  // Sync hoveredNode state with ref
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])


  // Fetch data on mount
  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  // Create D3 tree and render with Canvas
  useEffect(() => {
    if (!treeStructure || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const root = treeStructure

    const width = container.clientWidth
    const height = 800  // Reduced from 1000px for better fit

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Create pack layout for circle packing
    const packLayout = d3.pack<FlatTreeNode>()
      .size([width - 40, height - 40])
      .padding(3)  // Space between circles

    // Add value accessor for pack layout (uses annotations_count only)
    root.sum((d: any) => {
      // Use annotations_count as the value, with a minimum to ensure visibility
      const value = d.annotations_count || 0
      return Math.max(value, 1)
    })

    const packNodes = packLayout(root)

    // Get all nodes from pack layout
    const allNodes = packNodes.descendants()
    const annotationCounts = allNodes
      .map((d: any) => d.data.annotations_count || 0)
      .filter(c => c > 0)
    const maxCount = d3.max(annotationCounts) || 1

    // Theme-aware colors: grey/black for light mode, vibrant colors for dark mode
    const parentColor = isDark ? '#818cf8' : '#334155'      // Indigo in dark, darker grey in light (Slate 700)
    const leafColor = isDark ? '#34d399' : '#0f172a'        // Emerald in dark, near-black in light (Slate 900)
    const textColor = '#ffffff'                              // White text in both modes for contrast
    const hoverColor = isDark ? '#fbbf24' : '#f59e0b'       // Amber
    const strokeColor = isDark ? '#64748b' : '#cbd5e1'      // Strokes - visible in both themes

    const visibleNodes = allNodes

    // Store nodes for hit detection with pack coordinates (no offset needed)
    const nodesArray = visibleNodes.map((d: any) => ({
      node: d,
      x: d.x,
      y: d.y,
      radius: d.r
    }))

    // Store nodes array in ref for search functionality
    nodesArrayRef.current = nodesArray

    // View frustum culling helper
    const isInView = (x: number, y: number, r: number, transform: d3.ZoomTransform, margin = 50) => {
      const screenX = x * transform.k + transform.x
      const screenY = y * transform.k + transform.y
      const screenR = r * transform.k
      return (
        screenX + screenR > -margin &&
        screenX - screenR < width + margin &&
        screenY + screenR > -margin &&
        screenY - screenR < height + margin
      )
    }

    // Optimized draw function for circle packing
    const draw = (transform: d3.ZoomTransform) => {
      ctx.save()
      ctx.clearRect(0, 0, width, height)

      // Apply transform
      ctx.translate(transform.x, transform.y)
      ctx.scale(transform.k, transform.k)

      const zoomLevel = transform.k

      // Draw circles from largest to smallest (parent to children) for proper layering
      const sortedNodes = [...nodesArray].sort((a, b) => b.radius - a.radius)

      // Draw all circles with frustum culling
      for (const item of sortedNodes) {
        const x = item.x
        const y = item.y
        const radius = item.radius

        // Frustum culling
        if (!isInView(x, y, radius, transform)) continue

        const d = item.node
        const isHovered = hoveredNodeRef.current && hoveredNodeRef.current.data.id === d.data.id
        const hasChildren = d.children && d.children.length > 0

        // Draw circle
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)

        // Fill with color based on state and hierarchy
        if (isHovered) {
          ctx.fillStyle = hoverColor
          ctx.globalAlpha = isDark ? 0.8 : 0.85
        } else if (hasChildren) {
          ctx.fillStyle = parentColor
          const baseOpacity = isDark ? 0.12 : 0.18
          const depthMultiplier = isDark ? 0.08 : 0.12
          ctx.globalAlpha = baseOpacity + (depthMultiplier * Math.min(d.depth, 5))
        } else {
          ctx.fillStyle = leafColor
          ctx.globalAlpha = isDark ? 0.7 : 0.8
        }
        ctx.fill()

        ctx.globalAlpha = 1
        // Stroke for definition - full circle outline
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        if (isHovered) {
          ctx.strokeStyle = hoverColor
          ctx.lineWidth = 2.5 / transform.k
          ctx.globalAlpha = isDark ? 0.9 : 0.95
        } else {
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 1 / transform.k
          ctx.globalAlpha = isDark ? 0.35 : 0.5
        }
        ctx.stroke()

        ctx.globalAlpha = 1
      }

      // Draw labels in screen space so they render crisply at any zoom level
      // (avoids sub-pixel font sizes that break at high zoom)
      if (zoomLevel > 0.5) {
        const labelCandidates = [...nodesArray]
          .sort((a, b) => b.radius - a.radius)
          .filter(item => {
            const screenRadius = item.radius * transform.k
            return screenRadius >= 20
          })

        const renderedLabels: Array<{ x: number, y: number, width: number, height: number }> = []

        // Switch to screen space for label rendering (keep dpr for sharp text)
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'

        for (const item of labelCandidates) {
          const x = item.x
          const y = item.y
          const radius = item.radius

          if (!isInView(x, y, radius, transform)) continue

          const d = item.node
          const screenRadius = radius * transform.k
          const screenX = x * transform.k + transform.x
          const screenY = y * transform.k + transform.y

          const name = d.data.scientific_name
          const maxChars = Math.max(8, Math.floor(screenRadius / 3.5))
          const displayName = name.length > maxChars ? name.substring(0, maxChars) + '...' : name

          // Font size in screen pixels - always crisp, independent of zoom
          const fontSize = Math.max(8, Math.min(14, screenRadius / 4.5))
          ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`

          const metrics = ctx.measureText(displayName)
          const textWidth = metrics.width
          const textHeight = fontSize

          const hasCollision = renderedLabels.some(label => {
            const dx = Math.abs(screenX - label.x)
            const dy = Math.abs(screenY - label.y)
            return dx < (textWidth + label.width) / 2 + 5 &&
              dy < (textHeight + label.height) / 2 + 5
          })

          if (hasCollision) continue

          ctx.fillStyle = textColor
          ctx.fillText(displayName, screenX, screenY)

          renderedLabels.push({ x: screenX, y: screenY, width: textWidth, height: textHeight })

          if (renderedLabels.length > 100) break
        }

        ctx.restore()
      }

      ctx.restore()
    }

    // Store draw function in ref for external access
    drawFunctionRef.current = draw

    // Debounced draw for smoother performance during zoom
    let animationFrameId: number | null = null
    const debouncedDraw = (transform: d3.ZoomTransform) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      animationFrameId = requestAnimationFrame(() => {
        draw(transform)
      })
    }

    // Setup zoom behavior with debounced rendering
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 50])
      .on("zoom", (event) => {
        currentTransformRef.current = event.transform
        debouncedDraw(event.transform)
      })

    zoomBehaviorRef.current = zoom
    d3.select(canvas).call(zoom as any)

    // Throttled mouse interaction for better performance
    let mouseMoveTimeout: number | null = null
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const transform = currentTransformRef.current

      // Transform mouse coordinates to canvas space
      const canvasX = (mouseX - transform.x) / transform.k
      const canvasY = (mouseY - transform.y) / transform.k

      // Throttle hover detection
      if (mouseMoveTimeout) return
      mouseMoveTimeout = window.setTimeout(() => {
        mouseMoveTimeout = null

        // Find hovered node - check smallest circles first (most specific)
        let found = null
        let smallestRadius = Infinity

        for (const item of nodesArray) {
          const dx = canvasX - item.x
          const dy = canvasY - item.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          // Check if inside this circle and it's smaller than previously found
          if (distance <= item.radius && item.radius < smallestRadius) {
            found = item.node
            smallestRadius = item.radius
          }
        }

        const currentHovered = hoveredNodeRef.current
        if (found !== currentHovered) {
          hoveredNodeRef.current = found
          setHoveredNode(found)
          if (found) {
            // Position tooltip relative to canvas container
            setTooltipPos({
              x: mouseX,
              y: mouseY
            })
          } else {
            setTooltipPos(null)
          }
          debouncedDraw(transform)
        } else if (found) {
          // Update tooltip position as mouse moves
          setTooltipPos({
            x: mouseX,
            y: mouseY
          })
        }

        canvas.style.cursor = found ? 'pointer' : 'default'
      }, 16) // ~60fps
    }

    const handleClick = () => {
      const currentHovered = hoveredNodeRef.current
      if (!currentHovered || !onTaxonSelect) return
      const nodeItem = nodesArrayRef.current.find(item => item.node.data.id === currentHovered.data.id)
      if (nodeItem) {
        onTaxonSelect(nodeItem.node.data.id, nodeItem.node.data)
      }
    }

    const handleMouseLeave = () => {
      if (mouseMoveTimeout) {
        clearTimeout(mouseMoveTimeout)
        mouseMoveTimeout = null
      }
      if (hoveredNodeRef.current) {
        hoveredNodeRef.current = null
        setHoveredNode(null)
        setTooltipPos(null)
        debouncedDraw(currentTransformRef.current)
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    // Initial zoom to fit the packed circles
    const initialTransform = d3.zoomIdentity
      .translate(0, 0)
      .scale(1)

    d3.select(canvas).call(zoom.transform as any, initialTransform)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      if (mouseMoveTimeout) {
        clearTimeout(mouseMoveTimeout)
      }
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [treeStructure, isDark, onTaxonSelect])

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading tree data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center space-y-4">
          <div className="rounded-full bg-destructive/10 px-4 py-4 w-fit mx-auto">
            <Network className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Unable to load tree data</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full space-y-2">
      <p className="text-xs text-muted-foreground">
        {description ?? "Circle-packing view of the taxonomy hierarchy. Nested circles represent parent–child relationships; size reflects annotation count."}
      </p>
      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
        <span>Scroll to zoom · Drag to pan · Click circles to explore</span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ height: '800px' }}
      >
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Tooltip */}
        {hoveredNode && tooltipPos && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: `${tooltipPos.x + 10}px`,
              top: `${tooltipPos.y - 10}px`,
            }}
          >
            <div className="bg-card border border-border rounded-lg shadow-lg p-2.5 text-sm whitespace-nowrap">
              <div className="font-semibold mb-1">{hoveredNode.data.scientific_name}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Annotations: {hoveredNode.data.annotations_count.toLocaleString()}</div>
                <div>Assemblies: {hoveredNode.data.assemblies_count.toLocaleString()}</div>
                <div>Organisms: {hoveredNode.data.organisms_count.toLocaleString()}</div>
                <div>Tax ID: {hoveredNode.data.id}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
