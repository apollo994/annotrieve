"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import { getTaxonChildren, getTaxon } from "@/lib/api/taxons"
import type { TaxonRecord } from "@/lib/api/types"
import { SectionHeader } from "@/components/ui/section-header"
import { Button } from "@/components/ui/button"
import { ChevronRight, Network, ArrowUp, ExternalLink} from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import Link from "next/link"
// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend)

// Color palette matching the app's design system
const COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#a855f7", // purple
  "#eab308", // yellow
  "#64748b", // slate
  "#f43f5e"  // rose
]

interface NavigationItem {
  taxid: string
  scientific_name: string
}

interface TreeOfLifeChartProps {
  title?: string
  description?: React.ReactNode
}

export function TreeOfLifeChart({ title, description }: TreeOfLifeChartProps) {
  // Core state - clean and simple
  const [currentTaxid, setCurrentTaxid] = useState<string>("2759")
  const [currentTaxon, setCurrentTaxon] = useState<TaxonRecord | null>(null)
  const [children, setChildren] = useState<TaxonRecord[]>([])
  const [history, setHistory] = useState<NavigationItem[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === 'dark'

  // Track window size for responsive behavior
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch taxon and its children - clean with cancellation
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Show full loading on first load, subtle update on navigation
        if (initialLoading) {
          setInitialLoading(true)
        } else {
          setIsUpdating(true)
        }
        setError(null)

        const [taxon, childrenRes] = await Promise.all([
          getTaxon(currentTaxid),
          getTaxonChildren(currentTaxid)
        ])

        if (cancelled) return

        setCurrentTaxon(taxon)
        setChildren(
          (childrenRes.results ?? [])
            .filter(child => String(child.taxid) !== String(currentTaxid))
            .filter(child => (child.annotations_count ?? 0) > 0) // Only show taxa with annotations
            .sort((a, b) => (b.annotations_count ?? 0) - (a.annotations_count ?? 0))
        )
      } catch (err) {
        if (cancelled) return
        console.error('Error fetching taxon data:', err)
        setError('Failed to load taxon data')
      } finally {
        if (!cancelled) {
          setInitialLoading(false)
          setIsUpdating(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [currentTaxid, retryCount])

  // Drill-down handler (pure state)
  const handleSliceClick = useCallback((index: number) => {
    const child = children[index]
    if (!child || !currentTaxon || child.children?.length === 0) return

    // Don't add Eukaryota to history
    if (String(currentTaxon.taxid) !== "2759") {
      setHistory(prev => [...prev, {
        taxid: currentTaxon.taxid,
        scientific_name: currentTaxon.scientific_name || 'Unknown'
      }])
    }

    setCurrentTaxid(child.taxid)
  }, [children, currentTaxon])

  // Go up handler
  const handleGoUp = useCallback(() => {
    if (history.length === 0) {
      setCurrentTaxid("2759")
      return
    }

    const parent = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))
    setCurrentTaxid(String(parent.taxid))
  }, [history])

  // Breadcrumb click handler
  const handleBreadcrumbClick = useCallback((taxid: string, targetIndex: number) => {
    if (targetIndex === 0) {
      setHistory([])
      setCurrentTaxid("2759")
      return
    }
    const itemsToKeep = targetIndex - 1
    setHistory(prev => prev.slice(0, itemsToKeep))
    setCurrentTaxid(taxid)
  }, [])


  // Build breadcrumbs
  const breadcrumbs: NavigationItem[] = useMemo(() => {
    const crumbs: NavigationItem[] = [{ taxid: "2759", scientific_name: "Eukaryota" }]
    crumbs.push(...history)

    // Add current if not root and not in history
    if (currentTaxon &&
      String(currentTaxon.taxid) !== "2759" &&
      !history.some(h => String(h.taxid) === String(currentTaxon.taxid))) {
      crumbs.push({
        taxid: currentTaxon.taxid,
        scientific_name: currentTaxon.scientific_name || 'Unknown'
      })
    }

    return crumbs
  }, [history, currentTaxon])

  const totalAnnotations = children.reduce((sum, child) => sum + (child.annotations_count ?? 0), 0)

  // Animated chart data - this is the key to smooth transitions
  const chartData = useMemo(() => ({
    labels: children.map(c => c.scientific_name ?? `Taxon ${c.taxid}`),
    datasets: [
      {
        data: children.map(c => c.annotations_count ?? 0),
        backgroundColor: COLORS.slice(0, children.length),
        borderColor: isDark ? '#1e293b' : '#ffffff',
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverBorderColor: isDark ? '#334155' : '#e2e8f0',
        hoverOffset: 8,
      },
    ],
  }), [children, isDark])

  // Chart options with clean click handling
  const chartOptions: ChartOptions<"doughnut"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    animation: {
      duration: 600,
      easing: 'easeInOutQuart',
      animateRotate: true,
      animateScale: true,
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: isDark ? '#e5e7eb' : '#0f172a',
          font: {
            size: 12,
          },
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        titleColor: isDark ? '#e5e7eb' : '#0f172a',
        bodyColor: isDark ? '#cbd5e1' : '#475569',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function (context) {
            const label = context.label || ''
            const value = context.parsed || 0
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return `${label}: ${value.toLocaleString()} annotations (${percentage}%)`
          },
        },
      },
    },
    onClick: (_event, elements) => {
      if (elements.length > 0) {
        handleSliceClick(elements[0].index)
      }
    },
    onHover: (event, elements) => {
      const canvas = event.native?.target as HTMLCanvasElement
      if (canvas) {
        canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      }
    },
  }), [isDark, handleSliceClick])

  if (initialLoading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Tree of Life Distribution"}
          description={description ?? (
            <>
              Explore the distribution of annotations across the tree of life. Click on a slice to drill down into its children, or click the center to go back up.
            </>
          )}
          icon={Network}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading taxon data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Tree of Life Distribution"}
          description={description ?? (
            <>
              Explore the distribution of annotations across the tree of life. Click on a slice to drill down into its children, or click the center to go back up.
            </>
          )}
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
              <p className="text-foreground font-medium mb-1">Unable to load taxon data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button
              onClick={() => {
                setError(null)
                setRetryCount(prev => prev + 1)
              }}
              variant="outline"
              className="gap-2"
            >
              <ArrowUp className="h-4 w-4 rotate-45" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "Tree of Life Distribution"}
        description={description ?? (
          <>
            Explore the distribution of annotations across the tree of life. Click on a slice to drill down into its children, or click the center to go back up.
          </>
        )}
        icon={Network}
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-500/10"
        align="center"
      />


      {/* Chart Container */}
      <div className="max-w-6xl mx-auto">
        <div className="relative bg-card/80 backdrop-blur-sm border border-border/60 rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm hover:shadow-md transition-shadow duration-300">
          {/* Subtle loading overlay while updating */}
          {isUpdating && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] rounded-lg z-20 flex items-center justify-center transition-opacity duration-200">
              <div className="flex flex-col items-center gap-3 bg-card/90 px-6 py-4 rounded-lg border border-border shadow-lg">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground font-medium">Updating...</p>
              </div>
            </div>
          )}

          {!isUpdating && children.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Network className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg mb-2 text-center font-medium">
                {currentTaxon?.scientific_name || 'This taxon'} has no children
              </p>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Total annotations: {currentTaxon?.annotations_count?.toLocaleString() || 0}
              </p>
              {(history.length > 0 || currentTaxid !== "2759") && (
                <Button
                  onClick={handleGoUp}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowUp className="h-4 w-4" />
                  Go Back
                </Button>
              )}
            </div>
          ) : currentTaxon && children.length > 0 ? (
            <>
              <nav className="mb-6 flex items-center flex-wrap min-h-[40px]">                
                {breadcrumbs.map((crumb, index) => (
                  <div key={`${crumb.taxid}-${index}`} className="flex items-center">
                    {index > 0 && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                    )}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="inline-flex items-center rounded-md text-primary text-sm font-medium">
                        {crumb.scientific_name}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleBreadcrumbClick(crumb.taxid, index)}
                        className="inline-flex items-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        {crumb.scientific_name}
                      </button>
                    )}
                  </div>
                ))}
              </nav>
              {/* Chart - Only render when we have children data */}
              <div
                className="relative mx-auto w-full"
                style={{
                  height: isMobile ? '500px' : '600px',
                  maxWidth: '100%'
                }}
              >
                <Doughnut
                  data={chartData}
                  options={chartOptions}
                />
                <div className="text-center absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  {(history.length > 0 || currentTaxid !== "2759") && (

                    <button
                      onClick={handleGoUp}
                      className=" text-center rounded-full p-4 transition-all hover:bg-muted/50 hover:scale-105 group max-w-[180px] z-10"
                      aria-label="Go back to parent taxon"
                    >

                      <div className="flex flex-col items-center gap-2">
                        <ArrowUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <div className="text-xs text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                          Go up
                        </div>
                      </div>
                    </button>
                  )}
                  <div className="flex items-center justify-center gap-2">
                    <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">{currentTaxon?.scientific_name || 'Eukaryota'}</h3>
                    <Link href={`/annotations/details?taxon=${currentTaxon?.taxid}`} target="_blank">
                      <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      {children.length} {children.length === 1 ? 'child' : 'children'}
                    </span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="font-medium">
                      {totalAnnotations.toLocaleString()} annotations
                    </span>
                  </div>

                </div>

              </div>

              {/* Instructions */}
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
                  <span>Click any slice to explore deeper</span>
                  {(history.length > 0 || currentTaxid !== "2759") && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span>Click center to go back</span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Show loading while fetching children data */
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Loading children...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
