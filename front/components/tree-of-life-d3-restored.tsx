"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import * as d3 from "d3"
import { SectionHeader } from "@/components/ui/section-header"
import { Network, Search, X } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getFlattenedTree, type FlattenedTreeResponse } from "@/lib/api/taxons"

interface FlatTreeNode {
  id: string
  parentId: string | null
  scientific_name: string
  annotations_count: number
  assemblies_count: number
  organisms_count: number
}

interface TreeOfLifeD3Props {
  title?: string
  description?: React.ReactNode
}

export function TreeOfLifeD3({ title, description }: TreeOfLifeD3Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flatData, setFlatData] = useState<FlatTreeNode[]>([])
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<FlatTreeNode[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const hoveredNodeRef = useRef<any>(null)
  const selectedNodeRef = useRef<any>(null)
  const zoomBehaviorRef = useRef<any>(null)
  const nodesArrayRef = useRef<any[]>([])
  const drawFunctionRef = useRef<((transform: d3.ZoomTransform) => void) | null>(null)
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === 'dark'
  
  // Sync hoveredNode state with ref
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])

  // Sync selectedNode state with ref and trigger redraw
  useEffect(() => {
    selectedNodeRef.current = selectedNode
    // Trigger a redraw when selection changes
    if (drawFunctionRef.current && currentTransformRef.current) {
      drawFunctionRef.current(currentTransformRef.current)
    }
  }, [selectedNode])

  // Click outside handler for search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Fetch flattened tree data
  useEffect(() => {
    async function fetchTreeData() {
      try {
        setLoading(true)
        setError(null)
        
        const data = await getFlattenedTree("json") as FlattenedTreeResponse

        // Convert to flat array format for d3.stratify()
        const flatNodes: FlatTreeNode[] = data.rows.map((row: (string | number | null)[]) => ({
          id: String(row[0] ?? ""),
          parentId: row[1] != null && row[1] !== "" ? String(row[1]) : null,
          scientific_name: String(row[2] ?? "") || `Taxon ${row[0]}`,
          annotations_count: Number(row[3]) || 0,
          assemblies_count: Number(row[4]) || 0,
          organisms_count: Number(row[5]) || 0,
        }))
        
        // Find nodes without parents in the dataset
        const idsSet = new Set(flatNodes.map(n => n.id))
        const rootCandidates = flatNodes.filter(n => 
          !n.parentId || !idsSet.has(n.parentId)
        )
        
        // If multiple roots, create synthetic root
        if (rootCandidates.length > 1) {
          // Set all root candidates to have synthetic root as parent
          flatNodes.forEach(node => {
            if (!node.parentId || !idsSet.has(node.parentId)) {
              node.parentId = 'root'
            }
          })
          
          // Add synthetic root
          flatNodes.push({
            id: 'root',
            parentId: null,
            scientific_name: 'Tree of Life',
            annotations_count: rootCandidates.reduce((sum, n) => sum + n.annotations_count, 0),
            assemblies_count: rootCandidates.reduce((sum, n) => sum + n.assemblies_count, 0),
            organisms_count: rootCandidates.reduce((sum, n) => sum + n.organisms_count, 0),
          })
        }
        
        setFlatData(flatNodes)
      } catch (err) {
        console.error('Error fetching tree data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load tree data')
      } finally {
        setLoading(false)
      }
    }

    fetchTreeData()
  }, [])

  // Memoize tree structure to avoid recalculating
  const treeStructure = useMemo(() => {
    if (flatData.length === 0) return null

    // Use d3.stratify to convert flat data to hierarchy
    const stratify = d3.stratify<FlatTreeNode>()
      .id((d) => d.id)
      .parentId((d) => d.parentId)

    let root: d3.HierarchyNode<FlatTreeNode>
    try {
      root = stratify(flatData)
    } catch (err) {
      console.error('Error creating hierarchy:', err)
      return null
    }

    return root
  }, [flatData])

  // Create D3 tree and render with Canvas
  useEffect(() => {
    if (!treeStructure || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const root = treeStructure

    const width = container.clientWidth
    const height = 1000
    
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
    const hoverColor = isDark ? '#fbbf24' : '#f59e0b'       // Amber in both (for interaction feedback)
    const selectedColor = isDark ? '#f87171' : '#dc2626'    // Red in both (for selection feedback)
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
        const isSelected = selectedNodeRef.current && selectedNodeRef.current.data.id === d.data.id
        const hasChildren = d.children && d.children.length > 0

        // Draw circle
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        
        // Fill with color based on hierarchy level and leaf status
        if (isSelected) {
          // Selected node - bright highlight
          ctx.fillStyle = selectedColor
          ctx.globalAlpha = isDark ? 0.85 : 0.9
        } else if (isHovered) {
          ctx.fillStyle = hoverColor
          ctx.globalAlpha = isDark ? 0.8 : 0.85
        } else if (hasChildren) {
          // Parent nodes - gradient opacity based on depth for better nesting visualization
          // Higher opacity in light mode for better visibility
          ctx.fillStyle = parentColor
          const baseOpacity = isDark ? 0.12 : 0.18
          const depthMultiplier = isDark ? 0.08 : 0.12
          const depthOpacity = baseOpacity + (depthMultiplier * Math.min(d.depth, 5))
          ctx.globalAlpha = depthOpacity
        } else {
          // Leaf nodes - more vibrant in light mode
          ctx.fillStyle = leafColor
          ctx.globalAlpha = isDark ? 0.7 : 0.8
        }
        ctx.fill()
        
        // Stroke for definition - more prominent for better visibility
        if (isSelected) {
          ctx.strokeStyle = selectedColor
          ctx.lineWidth = 3 / transform.k
          ctx.globalAlpha = isDark ? 0.95 : 1
        } else if (isHovered) {
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

      // Draw labels only when zoomed in enough + frustum culling + collision detection
      if (zoomLevel > 0.5) {
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'

        // Sort by radius (largest first) to prioritize important labels
        const labelCandidates = [...nodesArray]
          .sort((a, b) => b.radius - a.radius)
          .filter(item => {
            const screenRadius = item.radius * transform.k
            // More aggressive filtering: only show if large enough on screen
            return screenRadius >= 20
          })

        // Track rendered label positions for collision detection
        const renderedLabels: Array<{x: number, y: number, width: number, height: number}> = []

        for (const item of labelCandidates) {
          const x = item.x
          const y = item.y
          const radius = item.radius
          
          // Frustum culling for labels
          if (!isInView(x, y, radius, transform)) continue
          
          const d = item.node
          const screenRadius = radius * transform.k
          
          const name = d.data.scientific_name
          const maxChars = Math.max(8, Math.floor(screenRadius / 3.5))
          const displayName = name.length > maxChars ? name.substring(0, maxChars) + '...' : name
          
          // Font size based on circle size
          const fontSize = Math.max(8, Math.min(14, screenRadius / 4.5))
          ctx.font = `600 ${fontSize / transform.k}px system-ui, -apple-system, sans-serif`
          
          // Measure text for collision detection
          const metrics = ctx.measureText(displayName)
          const textWidth = metrics.width
          const textHeight = fontSize / transform.k
          
          // Check for collision with existing labels
          const hasCollision = renderedLabels.some(label => {
            const dx = Math.abs(x - label.x)
            const dy = Math.abs(y - label.y)
            return dx < (textWidth + label.width) / 2 + 5 && 
                   dy < (textHeight + label.height) / 2 + 5
          })
          
          if (hasCollision) continue
          
          // Draw label
          ctx.fillStyle = d.children ? textColor : textColor
          ctx.fillText(displayName, x, y)
          
          // Record label position
          renderedLabels.push({ x, y, width: textWidth, height: textHeight })
          
          // Limit total labels to prevent overcrowding
          if (renderedLabels.length > 100) break
        }
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

    // Setup zoom behavior with debounced rendering and very extended zoom range
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 50])  // Massive zoom range for detailed exploration
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
      if (currentHovered) {
        window.open(`/annotrieve/annotations/details?taxon=${currentHovered.data.id}`, '_blank')
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
  }, [treeStructure, isDark])

  // Search functionality
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    const lowerQuery = query.toLowerCase().trim()
    const results = flatData.filter(node => {
      const nameMatch = node.scientific_name.toLowerCase().includes(lowerQuery)
      const idMatch = node.id.toLowerCase().includes(lowerQuery)
      return nameMatch || idMatch
    }).slice(0, 10) // Limit to 10 results

    setSearchResults(results)
    setShowSearchResults(results.length > 0)
  }, [flatData])

  const zoomToNode = useCallback((nodeData: FlatTreeNode) => {
    if (!canvasRef.current || !zoomBehaviorRef.current) return

    // Find the node in the nodesArray
    const nodeItem = nodesArrayRef.current.find(item => item.node.data.id === nodeData.id)
    if (!nodeItem) return

    // Set the selected node to highlight it
    setSelectedNode(nodeItem.node)

    const canvas = canvasRef.current
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    // Calculate the transform to center and zoom to this node
    const scale = Math.min(8, Math.max(2, 500 / nodeItem.radius))
    const x = width / 2 - nodeItem.x * scale
    const y = height / 2 - nodeItem.y * scale

    // Animate to the new transform
    d3.select(canvas)
      .transition()
      .duration(750)
      .call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity.translate(x, y).scale(scale))

    setShowSearchResults(false)
    setSearchQuery("")
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedNode(null)
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Tree of Life"}
          description={description ?? "Explore the hierarchical tree of life with circle packing visualization showing all taxonomic nodes and their annotation counts."}
          icon={Network}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading tree data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Tree of Life"}
          description={description ?? "Explore the hierarchical tree of life with circle packing visualization showing all taxonomic nodes and their annotation counts."}
          icon={Network}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-4">
            <div className="rounded-full bg-destructive/10 p-4 w-fit mx-auto">
              <Network className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <p className="text-foreground font-medium mb-1">Unable to load tree data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "Tree of Life"}
        description={description ?? (
          <>
            Explore the hierarchical tree of life with circle packing visualization. 
            <strong> Zoom</strong> with scroll, <strong>pan</strong> by dragging, and <strong>click circles</strong> to view their annotations.
          </>
        )}
        icon={Network}
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-500/10"
        align="center"
      />

      <div className="max-w-7xl mx-auto">
        <div className="relative bg-card/80 backdrop-blur-sm border border-border/60 rounded-lg p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
            {/* Search Bar and Selected Chip - Left */}
            <div className="flex items-center gap-3 flex-1 min-w-[250px]">
              <div ref={searchContainerRef} className="relative min-w-[250px] max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by taxon name or ID..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                    className="pl-9 pr-4"
                  />
                </div>
                
                {/* Search Results Dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => zoomToNode(node)}
                        className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                      >
                        <div className="font-medium text-sm">{node.scientific_name}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {node.id} • {node.annotations_count.toLocaleString()} annotations
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Selected Taxon Chip - Right of Search */}
              {selectedNode && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge 
                    variant="secondary" 
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20"
                  >
                    <span className="text-sm font-medium truncate max-w-[200px]">
                      {selectedNode.data.scientific_name}
                    </span>
                    <button
                      onClick={clearSelection}
                      className="ml-1 hover:bg-red-500/30 rounded-full p-0.5 transition-colors"
                      aria-label="Clear selection"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    ID: {selectedNode.data.id}
                  </span>
                </div>
              )}
            </div>
            
            {/* Legend - Right */}
            <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-700 dark:bg-indigo-400"></span>
                Parent groups
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-900 dark:bg-emerald-400"></span>
                Leaf taxa
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 dark:bg-amber-400"></span>
                Hover
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-600 dark:bg-red-400"></span>
                Selected
              </span>
            </div>
          </div>
          
          <div 
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-md border border-border/40 bg-background/50"
            style={{ height: '1000px' }}
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
                <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm whitespace-nowrap">
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

          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
              <span>Scroll to zoom • Drag to pan • Click circles to explore • Nested circles show hierarchy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
