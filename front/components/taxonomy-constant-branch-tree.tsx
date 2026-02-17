"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import * as d3 from "d3"
import { Network } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useFilteredTreeByRank, useFilteredTreeByRootTaxon } from "@/lib/stores/flattened-tree"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import {
  TaxonomyTreeControls,
  getTreeGeneColors,
  type TreeRankOption,
} from "@/components/taxonomy-tree-controls"
import type { FlatTreeNode } from "@/lib/api/taxons"

interface TaxonomyConstantBranchTreeProps {
  title?: string
  description?: React.ReactNode
  rootTaxid?: string | null
  onTaxonSelect?: (taxid: string, taxon: FlatTreeNode) => void
  hideControls?: boolean
  controlledRank?: TreeRankOption | null
  controlledShowLabels?: boolean
}

export function TaxonomyConstantBranchTree({ title, description, rootTaxid = null, onTaxonSelect, hideControls, controlledRank, controlledShowLabels }: TaxonomyConstantBranchTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<d3.HierarchyNode<FlatTreeNode> | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [internalRank, setInternalRank] = useState<TreeRankOption>("class")
  const [internalShowLabels, setInternalShowLabels] = useState(false)

  const selectedRank: TreeRankOption =
    controlledRank !== undefined
      ? (controlledRank === null ? "all" : controlledRank)
      : internalRank
  const showLabels =
    controlledShowLabels !== undefined ? controlledShowLabels : internalShowLabels
  const selectedGeneTypes = useTaxonomyGeneTypesStore((s) => s.selectedGeneTypes)
  const [animationProgress, setAnimationProgress] = useState(1) // 0 to 1 for smooth transitions
  const previousGeneTypesRef = useRef<Set<'coding' | 'non_coding' | 'pseudogene'>>(new Set(['coding', 'non_coding', 'pseudogene']))
  const animationFrameRef = useRef<number | null>(null)
  const hoveredNodeRef = useRef<d3.HierarchyNode<FlatTreeNode> | null>(null)
  const nodesArrayRef = useRef<Array<{ node: d3.HierarchyNode<FlatTreeNode>, barBounds: { innerRadius: number, outerRadius: number, startAngle: number, endAngle: number } }>>([])
  const labelsArrayRef = useRef<Array<{ node: d3.HierarchyNode<FlatTreeNode>, x: number, y: number, text: string }>>([])
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"
  const geneColors = getTreeGeneColors(isDark)

  // Track container size for responsive canvas
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
    })
    ro.observe(el)
    setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Use store for data management
  const {
    isLoading: loading,
    error,
    fetchFlattenedTree,
  } = useFlattenedTreeStore()

  // Get tree structure filtered by root taxon first (if provided), then by rank
  const rootFilteredTree = useFilteredTreeByRootTaxon(rootTaxid)
  const rankForFilter: string | null =
    rootTaxid
      ? null
      : selectedRank === "all"
        ? null
        : selectedRank
  const rankFilteredTree = useFilteredTreeByRank(rankForFilter)
  const filteredTree = rootTaxid ? rootFilteredTree : rankFilteredTree

  // Sync hoveredNode with ref
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])

  // Handle smooth transitions when gene types change
  useEffect(() => {
    // Check if gene types actually changed
    const typesChanged =
      selectedGeneTypes.size !== previousGeneTypesRef.current.size ||
      Array.from(selectedGeneTypes).some(type => !previousGeneTypesRef.current.has(type)) ||
      Array.from(previousGeneTypesRef.current).some(type => !selectedGeneTypes.has(type))

    if (typesChanged) {
      // Start animation from 0 to 1
      // previousGeneTypesRef.current still has the old state (used for animation)
      setAnimationProgress(0)

      // Animate transition
      const startTime = performance.now()
      const duration = 300 // 300ms animation

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Easing function for smooth transition (ease-in-out)
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2

        setAnimationProgress(eased)

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          animationFrameRef.current = null
          setAnimationProgress(1) // Ensure we end at 1
          // Update previous state AFTER animation completes
          previousGeneTypesRef.current = new Set(selectedGeneTypes)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
      // Keep previousGeneTypesRef.current as the old state during animation
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [selectedGeneTypes])

  // Fetch data on mount
  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  // Create D3 tree and render with Canvas
  useEffect(() => {
    if (!filteredTree || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const root = filteredTree
    const width = containerSize.width || container.clientWidth || 600
    const availHeight = containerSize.height || container.clientHeight || 600
    const height = Math.min(width, Math.max(availHeight, 800), 1400) // Min 800px for resolution, cap 1400
    const outerRadius = height / 2
    const innerRadius = outerRadius - 200 // Space for labels and bars

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Domains = direct children of the current root (keyed by taxid)
    const domainChildren = root.children ?? []
    const domainTaxids = domainChildren.map((c) => c.data.id)

    // Palette for domain colors (distinct, many so ordinal scale can cycle)
    const domainPalette = isDark
      ? ["#f87171", "#38bdf8", "#a3e635", "#fb923c", "#c084fc", "#22d3ee", "#facc15", "#f472b6", "#4ade80", "#a8a29e"]
      : ["#ef4444", "#0ea5e9", "#84cc16", "#f97316", "#a855f7", "#06b6d4", "#eab308", "#ec4899", "#22c55e", "#78716c"]

    const color = d3.scaleOrdinal<string>()
      .domain(domainTaxids)
      .range(domainPalette)

    // Create cluster layout - positions all leaves at the same depth
    const cluster = d3.cluster<FlatTreeNode>()
      .size([360, innerRadius]) // 360 degrees, innerRadius depth
      .separation((a, b) => 1) // Constant separation

    // Compute layout
    cluster(root)

    // Return the taxid of the direct child of root that contains this node (domain by taxid)
    const getDomainTaxidForNode = (d: d3.HierarchyNode<FlatTreeNode>): string | null => {
      if (d === root) return null
      let current: d3.HierarchyNode<FlatTreeNode> | undefined = d
      while (current?.parent && current.parent !== root) {
        current = current.parent
      }
      return current?.parent === root ? current.data.id : null
    }

    // Set colors based on domain (direct child of root, by taxid)
    const setColor = (d: d3.HierarchyNode<FlatTreeNode>) => {
      const domainTaxid = getDomainTaxidForNode(d)
      ;(d as any).color = domainTaxid ? color(domainTaxid) : (d.parent ? (d.parent as any).color : null)
      if (d.children) {
        d.children.forEach(setColor)
      }
    }
    setColor(root)

    // Convert angle from degrees to radians for calculations
    const toRadians = (deg: number) => (deg - 90) / 180 * Math.PI

    // Get all links
    const links = root.links()
    const leafLinks = links.filter(d => !d.target.children)
    const leafNodes = root.leaves()

    // Calculate max gene count for scaling bars based on selected gene types only
    const getTotalForSelectedTypes = (node: d3.HierarchyNode<FlatTreeNode>) => {
      let total = 0
      if (selectedGeneTypes.has('coding')) total += node.data.coding_count || 0
      if (selectedGeneTypes.has('non_coding')) total += node.data.non_coding_count || 0
      if (selectedGeneTypes.has('pseudogene')) total += node.data.pseudogene_count || 0
      return total
    }

    const getPreviousTotalForSelectedTypes = (node: d3.HierarchyNode<FlatTreeNode>) => {
      let total = 0
      if (previousGeneTypesRef.current.has('coding')) total += node.data.coding_count || 0
      if (previousGeneTypesRef.current.has('non_coding')) total += node.data.non_coding_count || 0
      if (previousGeneTypesRef.current.has('pseudogene')) total += node.data.pseudogene_count || 0
      return total
    }

    // Calculate max for current selection
    const maxTotalGenes = Math.max(
      1,
      d3.max(leafNodes, d => getTotalForSelectedTypes(d)) || 1
    )

    // Calculate max for previous selection (for smooth animation)
    const maxPreviousGenes = Math.max(
      1,
      d3.max(leafNodes, d => getPreviousTotalForSelectedTypes(d)) || 1
    )

    // Interpolate max during animation for smoother scaling
    const animatedMaxGenes = maxPreviousGenes + (maxTotalGenes - maxPreviousGenes) * animationProgress

    const BAR_MAX_RADIUS = 180 // Maximum radial length of bars
    const BAR_GAP = 4 // Spacing between branch end and bar start
    const LABEL_SPACING = 5 // Spacing between bar end and label start
    const nodeGeneColors = getTreeGeneColors(isDark)

    // Store nodes and labels for hit testing
    const nodesArray: Array<{ node: d3.HierarchyNode<FlatTreeNode>, barBounds: { innerRadius: number, outerRadius: number, startAngle: number, endAngle: number } }> = []
    const labelsArray: Array<{ node: d3.HierarchyNode<FlatTreeNode>, x: number, y: number, text: string, angle: number, radius: number }> = []

    // Prepare bar and label data
    leafNodes.forEach((node) => {
      // Check if node has any genes for selected types
      const totalForSelectedTypes = getTotalForSelectedTypes(node)
      if (totalForSelectedTypes === 0) return

      const text = node.data.scientific_name.replace(/_/g, " ")
      const estimatedLabelWidth = text.length * 6

      // Calculate bar length scaled to animatedMaxGenes
      const scale = totalForSelectedTypes / animatedMaxGenes
      const barRadialLength = scale * BAR_MAX_RADIUS

      // Get the branch end radius (where the leaf node is positioned)
      const branchEndRadius = node.y ?? innerRadius

      // Bars start after a small gap from the branch end
      const barInnerRadius = branchEndRadius + BAR_GAP
      const barOuterRadius = barInnerRadius + barRadialLength

      // Convert node.x (degrees 0-360) to radians, matching toRadians function
      const angleDegrees = node.x ?? 0
      const nodeAngle = toRadians(angleDegrees)

      const minAngularWidth = Math.PI / 360
      const maxAngularWidth = Math.PI / 180
      const labelAngularWidth = estimatedLabelWidth / barInnerRadius
      const angularWidth = Math.max(minAngularWidth, Math.min(maxAngularWidth, labelAngularWidth * 0.05))
      const halfAngularWidth = angularWidth / 2
      const startAngle = nodeAngle - halfAngularWidth
      const endAngle = nodeAngle + halfAngularWidth

      nodesArray.push({
        node,
        barBounds: { innerRadius: barInnerRadius, outerRadius: barOuterRadius, startAngle, endAngle }
      })

      // Calculate label position
      const labelRadius = barOuterRadius + LABEL_SPACING
      labelsArray.push({
        node,
        x: labelRadius * Math.cos(nodeAngle),
        y: labelRadius * Math.sin(nodeAngle),
        text,
        angle: nodeAngle,
        radius: labelRadius
      })
    })

    nodesArrayRef.current = nodesArray
    labelsArrayRef.current = labelsArray

    // Draw function
    const draw = () => {
      ctx.save()
      ctx.clearRect(0, 0, width, height)

      // Center the drawing
      ctx.translate(width / 2, height / 2)

      // Get highlighted path if hovering
      const hovered = hoveredNodeRef.current
      const highlightedPath: d3.HierarchyNode<FlatTreeNode>[] = []
      if (hovered) {
        let current: any = hovered
        while (current) {
          highlightedPath.push(current)
          current = current.parent
        }
      }
      const highlightedIds = new Set(highlightedPath.map(n => n.data.id))

      // Draw link extensions (faded lines from branch end to label area)
      leafLinks.forEach((link) => {
        const target = link.target
        const angle = toRadians(target.x ?? 0)
        const startRadius = target.y ?? 0 // Branch end

        // Find the bar outer radius for this node to extend to label
        const nodeBarData = nodesArray.find(n => n.node.data.id === target.data.id)
        const endRadius = nodeBarData ? nodeBarData.barBounds.outerRadius + LABEL_SPACING : innerRadius

        const sx = startRadius * Math.cos(angle)
        const sy = startRadius * Math.sin(angle)
        const ex = endRadius * Math.cos(angle)
        const ey = endRadius * Math.sin(angle)

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = isDark ? "#64748b" : "#cbd5e1"
        ctx.globalAlpha = highlightedIds.has(target.data.id) ? 0.6 : 0.25
        ctx.lineWidth = 1
        ctx.stroke()
      })

      ctx.globalAlpha = 1

      // Draw main links (constant branch length)
      links.forEach((link) => {
        const source = link.source
        const target = link.target
        const startAngle = toRadians(source.x ?? 0)
        const endAngle = toRadians(target.x ?? 0)
        const startRadius = source.y ?? 0
        const endRadius = target.y ?? 0

        const sx = startRadius * Math.cos(startAngle)
        const sy = startRadius * Math.sin(startAngle)
        const ex = endRadius * Math.cos(endAngle)
        const ey = endRadius * Math.sin(endAngle)

        const isHighlighted = highlightedIds.has(source.data.id) && highlightedIds.has(target.data.id)

        ctx.beginPath()
        ctx.moveTo(sx, sy)

        // Draw arc along startRadius if angles differ (like SVG path)
        if (endAngle !== startAngle) {
          const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0
          const sweep = endAngle > startAngle ? 0 : 1
          // Use arcTo or manual arc calculation
          const midAngle = startAngle + (endAngle - startAngle) / 2
          const midX = startRadius * Math.cos(endAngle)
          const midY = startRadius * Math.sin(endAngle)
          ctx.arc(0, 0, startRadius, startAngle, endAngle, endAngle < startAngle)
        }

        ctx.lineTo(ex, ey)
        ctx.strokeStyle = isHighlighted
          ? (isDark ? "#fbbf24" : "#f59e0b")
          : ((target as any).color || (isDark ? "#64748b" : "#475569"))
        ctx.lineWidth = isHighlighted ? 2 : 1.5
        ctx.stroke()
      })

      // Draw bars with gene type filtering and smooth transitions
      nodesArray.forEach(({ node, barBounds }) => {
        const { innerRadius: barInnerRadius, outerRadius: barOuterRadius, startAngle, endAngle } = barBounds

        // Calculate total genes for selected types
        const allSegments = [
          { type: 'coding' as const, value: node.data.coding_count || 0, color: nodeGeneColors.coding },
          { type: 'non_coding' as const, value: node.data.non_coding_count || 0, color: nodeGeneColors.non_coding },
          { type: 'pseudogene' as const, value: node.data.pseudogene_count || 0, color: nodeGeneColors.pseudogene },
        ]

        // Filter segments based on selected gene types
        const visibleSegments = allSegments.filter(s =>
          s.value > 0 && selectedGeneTypes.has(s.type)
        )

        if (visibleSegments.length === 0) return

        // Calculate total for visible segments
        const totalVisibleGenes = visibleSegments.reduce((sum, s) => sum + s.value, 0)

        // Calculate bar length based on visible genes scaled to animatedMaxGenes
        const maxBarLength = BAR_MAX_RADIUS
        const targetBarLength = animatedMaxGenes > 0
          ? (totalVisibleGenes / animatedMaxGenes) * maxBarLength
          : 0

        const animatedBarOuterRadius = barInnerRadius + targetBarLength

        const isHovered = hovered?.data.id === node.data.id
        let currentInnerRadius = barInnerRadius

        visibleSegments.forEach((segment) => {
          // Calculate segment proportions
          const segmentProportion = totalVisibleGenes > 0 ? segment.value / totalVisibleGenes : 0
          const barLength = animatedBarOuterRadius - barInnerRadius
          const segmentRadialLength = segmentProportion * barLength
          const segmentOuterRadius = currentInnerRadius + segmentRadialLength

          ctx.beginPath()
          ctx.arc(0, 0, currentInnerRadius, startAngle, endAngle)
          ctx.arc(0, 0, segmentOuterRadius, endAngle, startAngle, true)
          ctx.closePath()

          ctx.fillStyle = segment.color
          ctx.globalAlpha = isHovered ? 0.9 : 0.7
          ctx.fill()

          ctx.strokeStyle = isHovered
            ? (isDark ? "#fbbf24" : "#f59e0b")
            : (isDark ? '#1e293b' : '#f1f5f9')
          ctx.lineWidth = isHovered ? 2 : 0.5
          ctx.globalAlpha = 1
          ctx.stroke()

          currentInnerRadius = segmentOuterRadius
        })
      })

      // Draw labels
      if (showLabels) {
        ctx.font = '10px system-ui, -apple-system, sans-serif'
        ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b"

        labelsArray.forEach(({ node, text, angle, radius }) => {
          const isHovered = hovered?.data.id === node.data.id
          // Convert angle back to degrees for comparison (angle is already in radians from toRadians)
          const angleDegrees = ((angle + Math.PI / 2) * 180) / Math.PI
          const normalizedAngleDegrees = ((angleDegrees % 360) + 360) % 360

          ctx.save()
          // Rotate to label angle (matching SVG transform: rotate(angle - 90))
          ctx.rotate(angle)
          // Translate to label radius
          ctx.translate(radius, 0)

          // Flip text if on left side (angle > 180 degrees)
          if (normalizedAngleDegrees > 180) {
            ctx.rotate(Math.PI)
            ctx.textAlign = 'end'
          } else {
            ctx.textAlign = 'start'
          }

          ctx.textBaseline = 'middle'
          ctx.fillStyle = isHovered
            ? (isDark ? "#fbbf24" : "#f59e0b")
            : (isDark ? "#e2e8f0" : "#1e293b")
          ctx.font = isHovered ? 'bold 10px system-ui, -apple-system, sans-serif' : '10px system-ui, -apple-system, sans-serif'
          ctx.fillText(text, 0, 0)
          ctx.restore()
        })
      }

      // Draw domain legend in top left corner (domains = direct children of root, by taxid)
      if (domainTaxids.length > 0) {
        ctx.save()
        ctx.translate(-width / 2 + 20, -height / 2 + 20)

        const legendItems = domainChildren.map((child) => ({
          taxid: child.data.id,
          name: child.data.scientific_name,
          color: color(child.data.id),
        }))

        // Draw title
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b"
        ctx.fillText("Domains", 0, 0)

        // Draw legend items (name)
        ctx.font = '12px system-ui, -apple-system, sans-serif'
        ctx.textBaseline = 'middle'

        legendItems.forEach((item, i) => {
          const y = 28 + i * 20

          ctx.beginPath()
          ctx.arc(8, y, 6, 0, 2 * Math.PI)
          ctx.fillStyle = item.color
          ctx.fill()

          ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b"
          ctx.fillText(item.name, 20, y)
        })

        ctx.restore()
      }

      ctx.restore()
    }

    // Draw (will be called again when animationProgress changes)
    draw()

    // Mouse interaction handlers
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      // Convert to canvas coordinates (centered)
      const canvasX = mouseX - width / 2
      const canvasY = mouseY - height / 2

      // Calculate angle and distance from center
      // atan2 gives angle from positive x-axis, toRadians converts (deg - 90) to radians
      // So atan2 already matches toRadians coordinate system (0 = right, -PI/2 = top)
      const angle = Math.atan2(canvasY, canvasX)
      const distance = Math.sqrt(canvasX * canvasX + canvasY * canvasY)

      // Normalize angle to -π to π range, then convert to 0-2π for comparison
      const normalizedAngle = (angle + 2 * Math.PI) % (2 * Math.PI)

      // Check if hovering over a bar
      let foundNode: d3.HierarchyNode<FlatTreeNode> | null = null
      for (const { node, barBounds } of nodesArray) {
        const { innerRadius: barInnerRadius, outerRadius: barOuterRadius, startAngle, endAngle } = barBounds

        // Normalize angles to 0-2π (startAngle and endAngle are already from toRadians)
        let normStart = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        let normEnd = ((endAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

        // Check if angle is within bar range
        let angleInRange = false
        if (normEnd > normStart) {
          angleInRange = normalizedAngle >= normStart && normalizedAngle <= normEnd
        } else {
          // Handle wrap-around (when bar crosses 0/2π boundary)
          angleInRange = normalizedAngle >= normStart || normalizedAngle <= normEnd
        }

        // Check if distance is within bar radius range
        if (angleInRange && distance >= barInnerRadius && distance <= barOuterRadius) {
          foundNode = node
          break
        }
      }

      // Check labels if no bar found
      if (!foundNode && showLabels) {
        for (const { node, angle, radius, text } of labelsArray) {
          // Calculate label position (using the same coordinate system)
          const labelX = radius * Math.cos(angle)
          const labelY = radius * Math.sin(angle)

          // Check if mouse is near label (approximate hit box)
          const dx = canvasX - labelX
          const dy = canvasY - labelY
          const dist = Math.sqrt(dx * dx + dy * dy)
          // Approximate label hit box based on text length
          if (dist < Math.max(20, text.length * 4)) {
            foundNode = node
            break
          }
        }
      }

      if (foundNode !== hoveredNodeRef.current) {
        hoveredNodeRef.current = foundNode
        setHoveredNode(foundNode)
        if (foundNode) {
          setTooltipPos({ x: mouseX, y: mouseY })
        } else {
          setTooltipPos(null)
        }
        draw()
      } else if (foundNode) {
        setTooltipPos({ x: mouseX, y: mouseY })
      }
    }

    const handleClick = () => {
      if (hoveredNodeRef.current) {
        if (onTaxonSelect) {
          onTaxonSelect(hoveredNodeRef.current.data.id, hoveredNodeRef.current.data)
        } else {
          const openRightSidebar = useUIStore.getState().openRightSidebar
          openRightSidebar("taxon-details", { taxid: hoveredNodeRef.current.data.id })
        }
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)
    canvas.style.cursor = 'pointer'

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
    }
  }, [filteredTree, isDark, showLabels, selectedGeneTypes, animationProgress, onTaxonSelect, containerSize])

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
          <div className="rounded-full bg-destructive/10 p-4 w-fit mx-auto">
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
      {!hideControls && (
        <>
          <p className="text-xs text-muted-foreground">
            {description ?? "Radial tree with constant-length branches. Bars show gene counts (coding, non-coding, pseudogene) per taxon. Click to explore."}
          </p>
          <TaxonomyTreeControls
            rootTaxid={rootTaxid}
            selectedRank={selectedRank}
            onRankChange={setInternalRank}
            geneColors={geneColors}
            showLabels={showLabels}
            onShowLabelsChange={setInternalShowLabels}
          />
        </>
      )}

      <div
        ref={containerRef}
        className="relative w-full overflow-auto flex items-center justify-center"
        style={{ minHeight: "1200px" }}
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
              <div className="font-semibold">{hoveredNode.data.scientific_name}</div>
              <div className="text-xs text-muted-foreground">
                <div>{hoveredNode.data.rank || 'N/A'}</div>
                <div className="pt-1 border-t border-border/50 mt-1">
                  <span className="text-muted-foreground">Record counts:</span>
                  <div>Organisms: {(hoveredNode.data.organisms_count ?? 0).toLocaleString()} · Assemblies: {(hoveredNode.data.assemblies_count ?? 0).toLocaleString()} · Annotations: {(hoveredNode.data.annotations_count ?? 0).toLocaleString()}</div>
                </div>
                <div className="pt-1 border-t border-border/50 mt-1">
                  <span className="text-muted-foreground">Mean counts:</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: geneColors.coding }}></span>
                    Coding: {(hoveredNode.data.coding_count || 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: geneColors.non_coding }}></span>
                    Non-coding: {(hoveredNode.data.non_coding_count || 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: geneColors.pseudogene }}></span>
                    Pseudogene: {(hoveredNode.data.pseudogene_count || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
