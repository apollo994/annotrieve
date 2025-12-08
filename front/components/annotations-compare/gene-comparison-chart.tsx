"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card } from "@/components/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { getGeneStats as fetchGeneStats, getGeneCategoryMetricValues, type GeneStatsSummary, type GeneCategoryMetricValues } from "@/lib/api/annotations"
import { useAnnotationSubsetsStore } from "@/lib/stores/annotation-subsets"
import { useStatsCacheStore } from "@/lib/stores/stats-cache"
import { Activity, BarChart3 } from "lucide-react"
import { BoxplotChart } from "@/components/annotations-stats/boxplot-chart"
import { buildParamsFromFilters } from "@/lib/utils"

interface GeneComparisonChartProps {
  selectedSubsetIds: string[]
}

export function GeneComparisonChart({ selectedSubsetIds }: GeneComparisonChartProps) {
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)
  const getCachedGeneStats = useStatsCacheStore((state) => state.getGeneStats)
  const setCachedGeneStats = useStatsCacheStore((state) => state.setGeneStats)
  const getCachedGeneMetric = useStatsCacheStore((state) => state.getGeneMetric)
  const setCachedGeneMetric = useStatsCacheStore((state) => state.setGeneMetric)
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [selectedMetric, setSelectedMetric] = useState<string>("")
  const [useLogScale, setUseLogScale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geneStats, setGeneStats] = useState<GeneStatsSummary | null>(null)
  const [metricData, setMetricData] = useState<Record<string, GeneCategoryMetricValues>>({})
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false)
  const [failedSubsets, setFailedSubsets] = useState<Set<string>>(new Set())

  // Get selected subsets with stable reference
  const selectedSubsets = useMemo(() => {
    return subsets.filter(s => selectedSubsetIds.includes(s.id))
  }, [subsets, selectedSubsetIds])

  // Memoize subset IDs string for stable dependency
  const selectedSubsetIdsStr = useMemo(() => selectedSubsetIds.join(','), [selectedSubsetIds])


  // Fetch gene stats for first subset to get categories and metrics
  useEffect(() => {
    if (selectedSubsets.length === 0) {
      setSelectedCategory("")
      setSelectedMetric("")
      setMetricData({})
      setGeneStats(null)
      return
    }

    let cancelled = false

    async function fetchStats() {
      try {
        setError(null)
        const firstSubset = selectedSubsets[0]
        
        // Check cache first
        let result = getCachedGeneStats(firstSubset.id)
        
        if (!result) {
          // Not in cache, fetch it
          const params = buildParamsFromFilters(firstSubset.filters)
          result = await fetchGeneStats(params)
          // Store in cache
          setCachedGeneStats(firstSubset.id, result)
        }
        
        if (!cancelled) {
          setGeneStats(result)
          // Auto-select first category and metric if not already selected
          // Using functional setState to avoid stale closure issues
          if (result.categories && result.categories.length > 0) {
            setSelectedCategory(prev => prev || result.categories[0])
          }
          if (result.metrics && result.metrics.length > 0) {
            setSelectedMetric(prev => prev || result.metrics[0])
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load gene statistics')
        }
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [selectedSubsetIdsStr, getCachedGeneStats, setCachedGeneStats])

  // Fetch metric values for each selected subset
  useEffect(() => {
    // Reset failed subsets when category/metric changes
    setFailedSubsets(new Set())
    
    if (!selectedCategory || !selectedMetric || selectedSubsets.length === 0) {
      setMetricData({})
      setIsFetchingMetrics(false)
      return
    }

    let cancelled = false

    async function fetchAllMetrics() {
      setError(null)
      
      // Load all cached data first
      const cachedData: Record<string, GeneCategoryMetricValues> = {}
      const subsetsToFetch: typeof selectedSubsets = []

      for (const subset of selectedSubsets) {
        const cached = getCachedGeneMetric(subset.id, selectedCategory, selectedMetric)
        if (cached) {
          cachedData[subset.id] = cached
        } else {
          subsetsToFetch.push(subset)
        }
      }

      // Update state with cached data immediately
      if (Object.keys(cachedData).length > 0) {
        setMetricData(cachedData)
      }

      // If everything is cached, we're done
      if (subsetsToFetch.length === 0) {
        setIsFetchingMetrics(false)
        return
      }

      // Show loading state
      setIsFetchingMetrics(true)

      // Fetch missing data sequentially
      for (const subset of subsetsToFetch) {
        if (cancelled) return

        try {
          const params = buildParamsFromFilters(subset.filters)
          const result = await getGeneCategoryMetricValues(selectedCategory, selectedMetric, params)
          if (!cancelled) {
            // Store in cache
            setCachedGeneMetric(subset.id, selectedCategory, selectedMetric, result)
            // Update state with new data
            setMetricData(prev => ({
              ...prev,
              [subset.id]: result
            }))
            // Remove from failed subsets if it was there
            setFailedSubsets(prev => {
              const next = new Set(prev)
              next.delete(subset.id)
              return next
            })
          }
        } catch (err) {
          if (!cancelled) {
            // Check if it's a 404 error (data not available for this subset)
            const is404 = err instanceof Error && err.message.includes('404')
            if (is404) {
              // Silently track this subset as failed (no data available)
              setFailedSubsets(prev => new Set(prev).add(subset.id))
              // Remove from metricData if it was there
              setMetricData(prev => {
                const next = { ...prev }
                delete next[subset.id]
                return next
              })
            } else {
              // For other errors, log but don't show to user
              console.error(`Error fetching metric for ${subset.name}:`, err)
            }
          }
        }
      }

      if (!cancelled) {
        setIsFetchingMetrics(false)
      }
    }

    fetchAllMetrics()
    return () => {
      cancelled = true
    }
  }, [selectedCategory, selectedMetric, selectedSubsetIdsStr, getCachedGeneMetric, setCachedGeneMetric, selectedSubsets])

  // Prepare boxplot data - exclude subsets that failed or have no data
  const boxplotData = useMemo(() => {
    return selectedSubsets
      .filter(subset => !failedSubsets.has(subset.id))
      .map(subset => ({
        label: subset.name,
        values: metricData[subset.id]?.values || [],
        color: subset.color
      }))
      .filter(d => d.values.length > 0)
  }, [selectedSubsets, metricData, failedSubsets])

  // Get available categories and metrics from stats
  const availableCategories = useMemo(() => {
    return geneStats?.categories || []
  }, [geneStats])

  const availableMetrics = useMemo(() => {
    return geneStats?.metrics || []
  }, [geneStats])

  const formatLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  if (selectedSubsets.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Select filter sets from the sidebar to compare gene statistics
        </div>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Gene Comparison</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Compare gene statistics across selected filter sets using boxplots.
        </p>
      </div>
      <div className="space-y-3 flex-1">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-[200px]">
            <label className="text-sm font-medium mb-2 block">Category</label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {availableCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {formatLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px]">
            <label className="text-sm font-medium mb-2 block">Metric</label>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger>
                <SelectValue placeholder="Select a metric" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {availableMetrics.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {formatLabel(metric)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!selectedCategory || !selectedMetric ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/30 h-[400px]">
            Please select a category and metric
          </div>
        ) : isFetchingMetrics && Object.keys(metricData).length === 0 ? (
          <div className="flex items-center justify-center border rounded-lg bg-muted/30 h-[400px]">
            <div className="text-center">
              <Activity className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading comparison data...</p>
            </div>
          </div>
        ) : boxplotData.length === 0 ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/30 h-[400px]">
            No data available for selected metric
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-muted/30">
            <BoxplotChart
              data={boxplotData}
              title={`${formatLabel(selectedCategory)} - ${formatLabel(selectedMetric)}`}
              xAxisLabel="Filter Set"
              yAxisLabel={formatLabel(selectedMetric)}
              height={400}
              useLogScale={useLogScale}
            />
          </div>
        )}
      </div>
    </div>
  )
}

