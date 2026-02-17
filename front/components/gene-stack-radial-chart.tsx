"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import type { ReactNode } from "react"
import * as d3 from "d3"
import { Loader2 } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useFilteredTreeByRootTaxon } from "@/lib/stores/flattened-tree"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import {
  TaxonomyTreeControls,
  TREE_RANK_OPTIONS,
  getTreeGeneColors,
  type TreeRankOption,
} from "@/components/taxonomy-tree-controls"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

const LIMIT_OPTIONS = [50, 100, 150] as const
type LimitOption = (typeof LIMIT_OPTIONS)[number]

type SortDirection = "most" | "least"

const PADDING = 56
const INNER_RADIUS = 60
const MIN_PAD_ANGLE = 0.002
const MAX_PAD_ANGLE = 0.04
const HOVER_EXPAND = 1.06
const MAX_LABELS_ON_CANVAS = 24

type ChartLayout = {
  w: number
  h: number
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  bandWidth: number
  padAngle: number
  n: number
}

const CHART_HEIGHT = 900

function getChartLayout(width: number, height: number, n: number): ChartLayout {
  const w = width
  const h = height
  const cx = w / 2
  const cy = h / 2
  const outerRadius = Math.min(w, h) / 2 - PADDING
  const bandWidth = n > 0 ? (2 * Math.PI) / n : 0
  const innerRadius = Math.min(INNER_RADIUS, outerRadius * 0.15)
  const padAngle = n > 0
    ? Math.max(MIN_PAD_ANGLE, Math.min(MAX_PAD_ANGLE, bandWidth * 0.08))
    : 0
  return { w, h, cx, cy, innerRadius, outerRadius, bandWidth, padAngle, n }
}

function toCanvasAngle(angle: number): number {
  return angle - Math.PI / 2
}

/** Hit-test: return bar index [0..n-1] if (localX, localY) is over a bar, else null. */
function hitTestBar(layout: ChartLayout, localX: number, localY: number): number | null {
  const { cx, cy, innerRadius: ir, outerRadius, bandWidth, padAngle, n } = layout
  if (n === 0) return null
  const dx = localX - cx
  const dy = localY - cy
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance < ir || distance > outerRadius) return null
  const mouseAngle = Math.atan2(dy, dx)
  const dataAngle = (mouseAngle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
  const effectiveBand = bandWidth - padAngle
  if (effectiveBand <= 0) return 0
  let index = Math.floor((dataAngle - padAngle / 2) / bandWidth)
  if (index < 0) index = 0
  if (index >= n) index = n - 1
  return index
}

function formatCount(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2)
}

/** Compact format for y-axis labels (e.g. 15000 -> "15k") */
function formatAxisValue(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  if (value === 0) return "0"
  if (value < 1 && value > 0) return value.toFixed(1)
  return value.toFixed(0)
}


export type GeneStackRow = {
  taxid: number
  taxon_name: string
  coding: number
  non_coding: number
  pseudogene: number
  total: number
  annotationCount: number
  organismsCount: number
  assembliesCount: number
}

interface GeneStackRadialChartProps {
  title?: string
  description?: ReactNode
  rootTaxid?: string | null
  onTaxonSelect?: (taxid: string) => void
}

function collectIdsFromTree(root: d3.HierarchyNode<FlatTreeNode> | null): Set<string> {
  const ids = new Set<string>()
  if (!root) return ids
  root.each((n) => {
    if (n.data?.id) ids.add(n.data.id)
  })
  return ids
}

export function GeneStackRadialChart({ title, description, rootTaxid = null, onTaxonSelect }: GeneStackRadialChartProps) {
  const { flatNodes, isLoading: loading, error, fetchFlattenedTree } = useFlattenedTreeStore()
  const rootFilteredTree = useFilteredTreeByRootTaxon(rootTaxid)
  const idsUnderRoot = useMemo(() => collectIdsFromTree(rootFilteredTree), [rootFilteredTree])
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"
  const geneColors = useMemo(() => getTreeGeneColors(isDark), [isDark])
  const { selectedGeneTypes } = useTaxonomyGeneTypesStore()

  const [rank, setRank] = useState<TreeRankOption>("class")
  const [limit, setLimit] = useState<LimitOption>(150)
  const [sortDirection, setSortDirection] = useState<SortDirection>("most")
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawFunctionRef = useRef<(() => void) | null>(null)
  const hoveredIndexRef = useRef<number | null>(null)
  const sizeRef = useRef({ width: 0, height: CHART_HEIGHT })
  const sortedIndicesRef = useRef<number[]>([])
  const prevTogglesRef = useRef(new Set(["coding", "non_coding", "pseudogene"] as const))
  const transitionProgressRef = useRef(1)

  const TRANSITION_MS = 300

  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  const data = useMemo((): GeneStackRow[] => {
    const hasRootFilter = rootTaxid && idsUnderRoot.size > 0
    const rankLower = rank === "all" ? "" : rank.toLowerCase()
    let source = hasRootFilter
      ? flatNodes.filter((n) => idsUnderRoot.has(n.id))
      : flatNodes
    if (hasRootFilter) {
      const parentIds = new Set(
        source.filter((n) => n.parentId).map((n) => n.parentId!)
      )
      source = source.filter((n) => !parentIds.has(n.id))
    }
    const rows = source
      .filter(
        (n) =>
          n.id !== "root" &&
          (hasRootFilter || rankLower === "" || (n.rank?.toLowerCase() ?? "") === rankLower)
      )
      .map((n) => {
        const coding = n.coding_count ?? 0
        const non_coding = n.non_coding_count ?? 0
        const pseudogene = n.pseudogene_count ?? 0
        return {
          taxid: parseInt(n.id, 10) || 0,
          taxon_name: n.scientific_name ?? "",
          coding,
          non_coding,
          pseudogene,
          total: coding + non_coding + pseudogene,
          annotationCount: n.annotations_count ?? 0,
          organismsCount: n.organisms_count ?? 0,
          assembliesCount: n.assemblies_count ?? 0,
        }
      })
    const filtered = sortDirection === "least" ? rows.filter((r) => r.total > 0) : rows
    const sorted =
      sortDirection === "most"
        ? [...filtered].sort((a, b) => b.total - a.total)
        : [...filtered].sort((a, b) => a.total - b.total)
    return sorted.slice(0, limit)
  }, [flatNodes, rank, rootTaxid, idsUnderRoot, limit, sortDirection])

  useEffect(() => {
    const typesChanged =
      selectedGeneTypes.size !== prevTogglesRef.current.size ||
      [...selectedGeneTypes].some((t) => !prevTogglesRef.current.has(t)) ||
      [...prevTogglesRef.current].some((t) => !selectedGeneTypes.has(t))
    if (typesChanged) {
      transitionProgressRef.current = 0
    }
  }, [selectedGeneTypes])

  useEffect(() => {
    hoveredIndexRef.current = hoveredIndex
  }, [hoveredIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    sizeRef.current = { width: container.clientWidth, height: CHART_HEIGHT }
    const dpr = window.devicePixelRatio || 1

    const useCoding = selectedGeneTypes.has("coding")
    const useNonCoding = selectedGeneTypes.has("non_coding")
    const usePseudogene = selectedGeneTypes.has("pseudogene")
    const anyShown = useCoding || useNonCoding || usePseudogene
    const useCodingSafe = anyShown ? useCoding : true
    const useNonCodingSafe = anyShown ? useNonCoding : true
    const usePseudogeneSafe = anyShown ? usePseudogene : true
    const visibleTotal = (d: { coding: number; non_coding: number; pseudogene: number }) =>
      (useCodingSafe ? d.coding : 0) + (useNonCodingSafe ? d.non_coding : 0) + (usePseudogeneSafe ? d.pseudogene : 0)
    const sortedIndices = data.map((_, i) => i).sort((a, b) => visibleTotal(data[b]) - visibleTotal(data[a]))
    sortedIndicesRef.current = sortedIndices

    const toggles = {
      showCoding: useCodingSafe,
      showNonCoding: useNonCodingSafe,
      showPseudogene: usePseudogeneSafe,
    }
    const prevHasCoding = prevTogglesRef.current.has("coding")
    const prevHasNonCoding = prevTogglesRef.current.has("non_coding")
    const prevHasPseudogene = prevTogglesRef.current.has("pseudogene")
    const prevAnyShown = prevHasCoding || prevHasNonCoding || prevHasPseudogene
    const prev = {
      showCoding: prevAnyShown ? prevHasCoding : true,
      showNonCoding: prevAnyShown ? prevHasNonCoding : true,
      showPseudogene: prevAnyShown ? prevHasPseudogene : true,
    }

    const draw = () => {
      const { width, height } = sizeRef.current
      if (width <= 0) return
      const layout = getChartLayout(width, height, data.length)
      const { cx, cy, innerRadius, outerRadius, bandWidth, padAngle, n } = layout
      const sorted = sortedIndicesRef.current

      const transT = Math.min(1, transitionProgressRef.current)

      let currMaxVal = 0
      let prevMaxVal = 0
      data.forEach((d) => {
        const ct = (useCodingSafe ? d.coding : 0) + (useNonCodingSafe ? d.non_coding : 0) + (usePseudogeneSafe ? d.pseudogene : 0)
        const pt = (prev.showCoding ? d.coding : 0) + (prev.showNonCoding ? d.non_coding : 0) + (prev.showPseudogene ? d.pseudogene : 0)
        if (ct > currMaxVal) currMaxVal = ct
        if (pt > prevMaxVal) prevMaxVal = pt
      })
      if (currMaxVal <= 0) currMaxVal = 1
      if (prevMaxVal <= 0) prevMaxVal = 1
      const maxVal = prevMaxVal + transT * (currMaxVal - prevMaxVal)
      const y = (value: number) =>
        innerRadius + (value / maxVal) * (outerRadius - innerRadius)

      /** Cumulative start/end in visible-value space for a segment */
      const cum = (
        d: { coding: number; non_coding: number; pseudogene: number },
        key: "coding" | "non_coding" | "pseudogene",
        toggles: { showCoding: boolean; showNonCoding: boolean; showPseudogene: boolean }
      ): { start: number; end: number } => {
        const c = toggles.showCoding ? d.coding : 0
        const nc = toggles.showNonCoding ? d.non_coding : 0
        const p = toggles.showPseudogene ? d.pseudogene : 0
        if (key === "coding") return { start: 0, end: c }
        if (key === "non_coding") return { start: c, end: c + nc }
        return { start: c + nc, end: c + nc + p }
      }

      ctx.save()
      ctx.clearRect(0, 0, width, height)

      const keys: ("coding" | "non_coding" | "pseudogene")[] = ["coding", "non_coding", "pseudogene"]

      for (const key of keys) {
        ctx.beginPath()
        for (let pos = 0; pos < n; pos++) {
          const d = data[sorted[pos]]
          const prevCum = cum(d, key, prev)
          const currCum = cum(d, key, toggles)
          const interpStart = prevCum.start + transT * (currCum.start - prevCum.start)
          const interpEnd = prevCum.end + transT * (currCum.end - prevCum.end)
          const r0 = y(interpStart)
          const r1 = y(interpEnd)
          if (r1 <= r0) continue
          const bandStart = pos * bandWidth + padAngle / 2
          const bandEnd = (pos + 1) * bandWidth - padAngle / 2
          const startAngle = toCanvasAngle(bandStart)
          const endAngle = toCanvasAngle(bandEnd)
          appendTrapezoidToPath(ctx, cx, cy, r0, r1, startAngle, endAngle)
        }
        ctx.fillStyle = geneColors[key]
        ctx.fill()
      }

      const hi = hoveredIndexRef.current
      const hoverPos = hi !== null ? sorted.indexOf(hi) : -1
      if (hoverPos >= 0 && hoverPos < n) {
        const bandStart = hoverPos * bandWidth + padAngle / 2
        const bandEnd = (hoverPos + 1) * bandWidth - padAngle / 2
        const startAngle = toCanvasAngle(bandStart)
        const endAngle = toCanvasAngle(bandEnd)
        const midR = (innerRadius + outerRadius) / 2
        const halfThick = (outerRadius - innerRadius) / 2
        const r0Exp = midR - halfThick * HOVER_EXPAND
        const r1Exp = midR + halfThick * HOVER_EXPAND
        const mapR = (r: number) => r0Exp + ((r - innerRadius) / (outerRadius - innerRadius)) * (r1Exp - r0Exp)

        for (const key of keys) {
          const d = data[sorted[hoverPos]]
          const prevCum = cum(d, key, prev)
          const currCum = cum(d, key, toggles)
          const interpStart = prevCum.start + transT * (currCum.start - prevCum.start)
          const interpEnd = prevCum.end + transT * (currCum.end - prevCum.end)
          const r0 = y(interpStart)
          const r1 = y(interpEnd)
          if (r1 <= r0) continue
          ctx.beginPath()
          appendTrapezoidToPath(ctx, cx, cy, mapR(r0), mapR(r1), startAngle, endAngle)
          ctx.fillStyle = geneColors[key]
          ctx.fill()
        }

        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(startAngle) * r0Exp, cy + Math.sin(startAngle) * r0Exp)
        ctx.lineTo(cx + Math.cos(startAngle) * r1Exp, cy + Math.sin(startAngle) * r1Exp)
        ctx.lineTo(cx + Math.cos(endAngle) * r1Exp, cy + Math.sin(endAngle) * r1Exp)
        ctx.lineTo(cx + Math.cos(endAngle) * r0Exp, cy + Math.sin(endAngle) * r0Exp)
        ctx.closePath()
        ctx.fillStyle = "rgba(255,255,255,0.12)"
        ctx.fill()
        ctx.strokeStyle = "rgba(0,0,0,0.4)"
        ctx.lineWidth = 2
        ctx.stroke()
      }

      const yTicks = n > 0 ? Math.min(5, Math.max(2, n)) : 5
      for (let tk = 1; tk < yTicks; tk++) {
        const r = y((maxVal * tk) / yTicks)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, 2 * Math.PI)
        ctx.strokeStyle = "rgba(128,128,128,0.35)"
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.save()
      ctx.fillStyle = "currentColor"
      ctx.font = "10px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      for (let tk = 0; tk <= yTicks; tk++) {
        const value = (maxVal * tk) / yTicks
        const r = y(value)
        const labelY = cy - r - 2
        if (labelY >= 0) {
          ctx.globalAlpha = tk === 0 ? 0.5 : 1
          ctx.fillText(formatAxisValue(value), cx, labelY)
          ctx.globalAlpha = 1
        }
      }
      ctx.restore()

      if (n > 0 && n <= MAX_LABELS_ON_CANVAS) {
        const labelR = innerRadius * 0.6
        const maxLen = n <= 5 ? 20 : n <= 12 ? 14 : 10
        ctx.save()
        ctx.fillStyle = isDark ? "rgba(226,232,240,0.9)" : "rgba(30,41,59,0.9)"
        ctx.font = `${n <= 8 ? 11 : 10}px system-ui, sans-serif`
        for (let pos = 0; pos < n; pos++) {
          const midAngle = pos * bandWidth + bandWidth / 2
          const labelAngle = toCanvasAngle(midAngle)
          const tx = cx + Math.cos(labelAngle) * labelR
          const ty = cy + Math.sin(labelAngle) * labelR
          const name = data[sorted[pos]].taxon_name || `Taxon ${pos + 1}`
          const short = name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name

          ctx.save()
          ctx.translate(tx, ty)
          ctx.rotate(labelAngle)
          const textAngle = (midAngle + Math.PI / 2) % (2 * Math.PI)
          const flip = textAngle > Math.PI / 2 && textAngle < (3 * Math.PI) / 2
          ctx.rotate(flip ? Math.PI / 2 : -Math.PI / 2)
          ctx.textAlign = flip ? "start" : "end"
          ctx.textBaseline = "middle"
          ctx.fillText(short, flip ? 6 : -6, 0)
          ctx.restore()
        }
        ctx.restore()
      }

      ctx.restore()
    }

    drawFunctionRef.current = draw

    const applySize = () => {
      const w = sizeRef.current.width
      const h = sizeRef.current.height
      if (w <= 0) return
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    applySize()
    draw()

    const ro = new ResizeObserver(() => {
      sizeRef.current = { width: container.clientWidth, height: CHART_HEIGHT }
      applySize()
      drawFunctionRef.current?.()
    })
    ro.observe(container)

    let transitionFrameId: number | null = null
    if (transitionProgressRef.current < 1) {
      const start = performance.now()
      const run = () => {
        const elapsed = performance.now() - start
        const t = Math.min(1, elapsed / TRANSITION_MS)
        transitionProgressRef.current = t
        drawFunctionRef.current?.()
        if (t < 1) {
          transitionFrameId = requestAnimationFrame(run)
        } else {
          transitionProgressRef.current = 1
          prevTogglesRef.current = new Set(selectedGeneTypes)
        }
      }
      transitionFrameId = requestAnimationFrame(run)
    }

    return () => {
      if (transitionFrameId) cancelAnimationFrame(transitionFrameId)
      ro.disconnect()
    }
  }, [data, selectedGeneTypes, geneColors, isDark])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container || data.length === 0) return
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const layout = getChartLayout(rect.width, rect.height, data.length)
      const position = hitTestBar(layout, mouseX, mouseY)
      const dataIndex = position !== null ? sortedIndicesRef.current[position] ?? null : null
      const prev = hoveredIndexRef.current
      hoveredIndexRef.current = dataIndex
      setHoveredIndex(dataIndex)
      if (dataIndex !== null && position !== null && container) {
        const containerRect = container.getBoundingClientRect()
        const relX = e.clientX - containerRect.left
        const relY = e.clientY - containerRect.top
        const padding = 12
        setTooltipPos({ x: relX + padding, y: relY - padding })
      } else {
        setTooltipPos(null)
      }
      if (dataIndex !== prev && drawFunctionRef.current) {
        drawFunctionRef.current()
      }
    },
    [data.length]
  )

  const handleMouseLeave = useCallback(() => {
    hoveredIndexRef.current = null
    setHoveredIndex(null)
    setTooltipPos(null)
    if (drawFunctionRef.current) {
      drawFunctionRef.current()
    }
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onTaxonSelect || data.length === 0) return
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const layout = getChartLayout(rect.width, rect.height, data.length)
      const position = hitTestBar(layout, mouseX, mouseY)
      if (position === null) return
      const dataIndex = sortedIndicesRef.current[position]
      const row = data[dataIndex]
      if (row) onTaxonSelect(String(row.taxid))
    },
    [onTaxonSelect, data.length]
  )

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          <p className="text-sm text-muted-foreground">Loading gene stack data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load gene stack data</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchFlattenedTree()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      <p className="text-xs text-muted-foreground">
        {description ?? "Radial chart of gene counts by taxon at the selected rank. Each wedge segment shows counts for one taxon."}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <TaxonomyTreeControls
          rootTaxid={rootTaxid}
          selectedRank={rank}
          onRankChange={setRank}
          geneColors={geneColors}
          showAllRanksOption={false}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="limit-select" className="text-sm font-medium whitespace-nowrap">
            Show:
          </Label>
          <Select
            value={String(limit)}
            onValueChange={(v) => setLimit(Number(v) as LimitOption)}
          >
            <SelectTrigger id="limit-select" className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} taxa
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="direction-select" className="text-sm font-medium whitespace-nowrap">
            Order:
          </Label>
          <Select
            value={sortDirection}
            onValueChange={(v) => setSortDirection(v as SortDirection)}
          >
            <SelectTrigger id="direction-select" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most">Most genes</SelectItem>
              <SelectItem value="least">Least genes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative w-full">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden"
          style={{ height: CHART_HEIGHT }}
        >
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No data for this rank.
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-pointer"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                role="img"
                aria-label="Radial stacked bar chart of gene counts by taxonomy"
              />
              {hoveredIndex !== null && tooltipPos && data[hoveredIndex] != null && (
                  <div
                    className="absolute z-50 pointer-events-none max-w-[min(280px,90vw)]"
                    style={{
                      left: tooltipPos.x,
                      top: tooltipPos.y,
                    }}
                  >
                    <div className="bg-card border border-border rounded-lg shadow-lg p-2.5 text-sm whitespace-nowrap">
                      <div className="font-semibold mb-1">
                        {data[hoveredIndex].taxon_name || `Taxon ${hoveredIndex + 1}`}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Tax ID: {data[hoveredIndex].taxid}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="w-3 h-3 rounded inline-block shrink-0"
                            style={{ backgroundColor: geneColors.coding }}
                          />
                          Coding: {formatCount(data[hoveredIndex].coding)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded inline-block shrink-0"
                            style={{ backgroundColor: geneColors.non_coding }}
                          />
                          Non-coding: {formatCount(data[hoveredIndex].non_coding)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded inline-block shrink-0"
                            style={{ backgroundColor: geneColors.pseudogene }}
                          />
                          Pseudogene: {formatCount(data[hoveredIndex].pseudogene)}
                        </div>
                        <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                          <div>Total: {formatCount(data[hoveredIndex].total)} · Annotations: {data[hoveredIndex].annotationCount.toLocaleString()}</div>
                          <div className="text-muted-foreground">
                            Organisms: {data[hoveredIndex].organismsCount.toLocaleString()} · Assemblies: {data[hoveredIndex].assembliesCount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Append one trapezoid to the current path (for batched fill by color). */
function appendTrapezoidToPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  startAngle: number,
  endAngle: number
) {
  const x0 = (r: number, a: number) => cx + Math.cos(a) * r
  const y0 = (r: number, a: number) => cy + Math.sin(a) * r
  ctx.moveTo(x0(r0, startAngle), y0(r0, startAngle))
  ctx.lineTo(x0(r1, startAngle), y0(r1, startAngle))
  ctx.lineTo(x0(r1, endAngle), y0(r1, endAngle))
  ctx.lineTo(x0(r0, endAngle), y0(r0, endAngle))
  ctx.closePath()
}
