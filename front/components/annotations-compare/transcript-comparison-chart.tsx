"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card } from "@/components/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { getTranscriptStats as fetchTranscriptStats, getTranscriptTypeDetails, getTranscriptTypeMetricValues, type TranscriptStatsSummary, type TranscriptTypeDetails, type TranscriptTypeMetricValues } from "@/lib/api/annotations"
import { useAnnotationSubsetsStore } from "@/lib/stores/annotation-subsets"
import { useStatsCacheStore } from "@/lib/stores/stats-cache"
import { Activity, BarChart3 } from "lucide-react"
import { BoxplotChart } from "@/components/annotations-stats/boxplot-chart"
import { buildParamsFromFilters } from "@/lib/utils"

interface TranscriptComparisonChartProps {
  selectedSubsetIds: string[]
}

export function TranscriptComparisonChart({ selectedSubsetIds }: TranscriptComparisonChartProps) {
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)
  const getCachedTranscriptStats = useStatsCacheStore((state) => state.getTranscriptStats)
  const setCachedTranscriptStats = useStatsCacheStore((state) => state.setTranscriptStats)
  const getCachedTranscriptTypeDetails = useStatsCacheStore((state) => state.getTranscriptTypeDetails)
  const setCachedTranscriptTypeDetails = useStatsCacheStore((state) => state.setTranscriptTypeDetails)
  const getCachedTranscriptMetric = useStatsCacheStore((state) => state.getTranscriptMetric)
  const setCachedTranscriptMetric = useStatsCacheStore((state) => state.setTranscriptMetric)
  const [selectedType, setSelectedType] = useState<string>("")
  const [selectedMetric, setSelectedMetric] = useState<string>("")
  const [useLogScale, setUseLogScale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcriptStats, setTranscriptStats] = useState<TranscriptStatsSummary | null>(null)
  const [typeDetails, setTypeDetails] = useState<Record<string, TranscriptTypeDetails>>({})
  const [metricData, setMetricData] = useState<Record<string, TranscriptTypeMetricValues>>({})
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false)
  const [failedSubsetsForType, setFailedSubsetsForType] = useState<Set<string>>(new Set())
  const [failedSubsetsForMetric, setFailedSubsetsForMetric] = useState<Set<string>>(new Set())

  // Get selected subsets with stable reference
  const selectedSubsets = useMemo(() => {
    return subsets.filter(s => selectedSubsetIds.includes(s.id))
  }, [subsets, selectedSubsetIds])

  // Memoize subset IDs string for stable dependency
  const selectedSubsetIdsStr = useMemo(() => selectedSubsetIds.join(','), [selectedSubsetIds])

  // Fetch transcript stats for first subset to get types
  useEffect(() => {
    if (selectedSubsets.length === 0) {
      setSelectedType("")
      setSelectedMetric("")
      setTypeDetails({})
      setMetricData({})
      setTranscriptStats(null)
      return
    }

    let cancelled = false

    async function fetchStats() {
      try {
        setError(null)
        const firstSubset = selectedSubsets[0]
        
        // Check cache first
        let result = getCachedTranscriptStats(firstSubset.id)
        
        if (!result) {
          // Not in cache, fetch it
          const params = buildParamsFromFilters(firstSubset.filters)
          result = await fetchTranscriptStats(params)
          // Store in cache
          setCachedTranscriptStats(firstSubset.id, result)
        }
        
        if (!cancelled) {
          setTranscriptStats(result)
          // Auto-select type with most counts if not already selected
          // Using functional setState to avoid stale closure issues
          if (result.types && result.types.length > 0) {
            setSelectedType(prev => {
              if (prev) return prev
              const summary = result.summary?.types || {}
              const sortedTypes = [...result.types].sort((a, b) => {
                const countA = summary[a]?.annotations_count || 0
                const countB = summary[b]?.annotations_count || 0
                return countB - countA
              })
              return sortedTypes[0]
            })
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transcript statistics')
        }
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [selectedSubsetIdsStr, getCachedTranscriptStats, setCachedTranscriptStats])

  // Fetch type details for each subset to get available metrics
  useEffect(() => {
    // Reset failed subsets when type changes
    setFailedSubsetsForType(new Set())
    setFailedSubsetsForMetric(new Set())
    
    if (!selectedType || selectedSubsets.length === 0) {
      setTypeDetails({})
      setMetricData({})
      return
    }

    let cancelled = false

    async function fetchAllTypeDetails() {
      setError(null)

      // Load all cached data first
      const cachedData: Record<string, TranscriptTypeDetails> = {}
      const subsetsToFetch: typeof selectedSubsets = []

      for (const subset of selectedSubsets) {
        const cached = getCachedTranscriptTypeDetails(subset.id, selectedType)
        if (cached) {
          cachedData[subset.id] = cached
        } else {
          subsetsToFetch.push(subset)
        }
      }

      // Update state with cached data immediately
      if (Object.keys(cachedData).length > 0) {
        setTypeDetails(cachedData)
        
        // Auto-select first metric if available and not already selected
        const firstDetails = Object.values(cachedData)[0]
        if (firstDetails?.metrics && firstDetails.metrics.length > 0 && !selectedMetric) {
          setSelectedMetric(firstDetails.metrics[0])
        }
      }

      // Fetch missing data sequentially
      for (const subset of subsetsToFetch) {
        if (cancelled) return

        try {
          const params = buildParamsFromFilters(subset.filters)
          const result = await getTranscriptTypeDetails(selectedType, params)
          if (!cancelled) {
            // Store in cache
            setCachedTranscriptTypeDetails(subset.id, selectedType, result)
            setTypeDetails(prev => ({ ...prev, [subset.id]: result }))
            
            // Remove from failed subsets if it was there
            setFailedSubsetsForType(prev => {
              const next = new Set(prev)
              next.delete(subset.id)
              return next
            })
            
            // Auto-select first metric if available and not already selected
            if (result.metrics && result.metrics.length > 0 && !selectedMetric) {
              setSelectedMetric(result.metrics[0])
            }
          }
        } catch (err) {
          if (!cancelled) {
            // Check if it's a 404 error (type not available for this subset)
            const is404 = err instanceof Error && err.message.includes('404')
            if (is404) {
              // Silently track this subset as failed for this type
              setFailedSubsetsForType(prev => new Set(prev).add(subset.id))
              // Remove from typeDetails if it was there
              setTypeDetails(prev => {
                const next = { ...prev }
                delete next[subset.id]
                return next
              })
            } else {
              // For other errors, log but don't show to user
              console.error(`Error fetching type details for ${subset.name}:`, err)
            }
          }
        }
      }
    }

    fetchAllTypeDetails()
    return () => {
      cancelled = true
    }
  }, [selectedType, selectedSubsetIdsStr, getCachedTranscriptTypeDetails, setCachedTranscriptTypeDetails, selectedSubsets, selectedMetric])

  // Fetch metric values for each selected subset
  useEffect(() => {
    // Reset failed subsets for metric when type/metric changes
    setFailedSubsetsForMetric(new Set())
    
    if (!selectedType || !selectedMetric || selectedSubsets.length === 0) {
      setMetricData({})
      setIsFetchingMetrics(false)
      return
    }

    let cancelled = false

    async function fetchAllMetrics() {
      setError(null)
      
      // Load all cached data first
      const cachedData: Record<string, TranscriptTypeMetricValues> = {}
      const subsetsToFetch: typeof selectedSubsets = []

      for (const subset of selectedSubsets) {
        const cached = getCachedTranscriptMetric(subset.id, selectedType, selectedMetric)
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
          const result = await getTranscriptTypeMetricValues(selectedType, selectedMetric, params)
          if (!cancelled) {
            // Store in cache
            setCachedTranscriptMetric(subset.id, selectedType, selectedMetric, result)
            // Update state with new data
            setMetricData(prev => ({
              ...prev,
              [subset.id]: result
            }))
            // Remove from failed subsets if it was there
            setFailedSubsetsForMetric(prev => {
              const next = new Set(prev)
              next.delete(subset.id)
              return next
            })
          }
        } catch (err) {
          if (!cancelled) {
            // Check if it's a 404 error (metric not available for this subset)
            const is404 = err instanceof Error && err.message.includes('404')
            if (is404) {
              // Silently track this subset as failed (no data available)
              setFailedSubsetsForMetric(prev => new Set(prev).add(subset.id))
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
  }, [selectedType, selectedMetric, selectedSubsetIdsStr, getCachedTranscriptMetric, setCachedTranscriptMetric, selectedSubsets])

  // Get available metrics from first subset's type details (excluding failed subsets)
  const availableMetrics = useMemo(() => {
    if (selectedSubsets.length === 0 || !selectedType) return []
    // Find first subset that has type details (not failed)
    const validSubset = selectedSubsets.find(s => !failedSubsetsForType.has(s.id))
    if (!validSubset) return []
    const firstDetails = typeDetails[validSubset.id]
    return firstDetails?.metrics || []
  }, [selectedSubsets, selectedType, typeDetails, failedSubsetsForType])

  // Prepare boxplot data - exclude subsets that failed or have no data
  const boxplotData = useMemo(() => {
    return selectedSubsets
      .filter(subset => 
        !failedSubsetsForType.has(subset.id) && 
        !failedSubsetsForMetric.has(subset.id)
      )
      .map(subset => ({
        label: subset.name,
        values: metricData[subset.id]?.values || [],
        color: subset.color
      }))
      .filter(d => d.values.length > 0)
  }, [selectedSubsets, metricData, failedSubsetsForType, failedSubsetsForMetric])

  // Get available types from stats
  const availableTypes = useMemo(() => {
    if (!transcriptStats) return []
    const typeList = transcriptStats.types || []
    const summary = transcriptStats.summary?.types || {}
    
    // Sort by annotation count (descending)
    return [...typeList].sort((a, b) => {
      const countA = summary[a]?.annotations_count || 0
      const countB = summary[b]?.annotations_count || 0
      return countB - countA
    })
  }, [transcriptStats])

  const formatLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  if (selectedSubsets.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Select filter sets from the sidebar to compare transcript statistics
        </div>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Transcript Comparison</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Compare transcript statistics across selected filter sets using boxplots.
        </p>
      </div>
      <div className="space-y-3 flex-1">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-[200px]">
            <label className="text-sm font-medium mb-2 block">Type</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px]">
            <label className="text-sm font-medium mb-2 block">Metric</label>
            <Select value={selectedMetric} onValueChange={setSelectedMetric} disabled={availableMetrics.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={availableMetrics.length === 0 ? "Select type first" : "Select a metric"} />
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

        {!selectedType || !selectedMetric ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/30 h-[400px]">
            Please select a type and metric
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
              title={`${formatLabel(selectedType)} - ${formatLabel(selectedMetric)}`}
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

