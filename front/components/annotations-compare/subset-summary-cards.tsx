"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Activity, Info } from "lucide-react"
import { getGeneStats as fetchGeneStats, getTranscriptStats as fetchTranscriptStats, type GeneStatsSummary, type TranscriptStatsSummary } from "@/lib/api/annotations"
import { useAnnotationSubsetsStore, type AnnotationSubset } from "@/lib/stores/annotation-subsets"
import { useStatsCacheStore } from "@/lib/stores/stats-cache"
import { buildParamsFromFilters } from "@/lib/utils"

interface SubsetSummaryCardsProps {
  selectedSubsetIds: string[]
}

interface SubsetStats {
  subsetId: string
  geneStats: GeneStatsSummary | null
  transcriptStats: TranscriptStatsSummary | null
  loading: boolean
  error: string | null
}

export function SubsetSummaryCards({ selectedSubsetIds }: SubsetSummaryCardsProps) {
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)
  const getCachedGeneStats = useStatsCacheStore((state) => state.getGeneStats)
  const setCachedGeneStats = useStatsCacheStore((state) => state.setGeneStats)
  const getCachedTranscriptStats = useStatsCacheStore((state) => state.getTranscriptStats)
  const setCachedTranscriptStats = useStatsCacheStore((state) => state.setTranscriptStats)
  const [stats, setStats] = useState<Record<string, SubsetStats>>({})
  const [openModalId, setOpenModalId] = useState<string | null>(null)

  // Get selected subsets with stable reference
  const selectedSubsets = useMemo(() => {
    return subsets.filter(s => selectedSubsetIds.includes(s.id))
  }, [subsets, selectedSubsetIds])

  // Memoize subset IDs string for stable dependency
  const selectedSubsetIdsStr = useMemo(() => selectedSubsetIds.join(','), [selectedSubsetIds])

  // Fetch stats for each selected subset
  useEffect(() => {
    if (selectedSubsets.length === 0) {
      setStats({})
      return
    }

    let cancelled = false

    async function fetchAllStats() {
      // Filter out removed subsets from state immediately
      const currentSubsetIds = new Set(selectedSubsets.map(s => s.id))
      setStats(prev => {
        const filtered: Record<string, SubsetStats> = {}
        for (const [id, data] of Object.entries(prev)) {
          if (currentSubsetIds.has(id)) {
            filtered[id] = data
          }
        }
        return filtered
      })

      // First, load all cached data immediately
      const cachedStats: Record<string, SubsetStats> = {}
      const subsetsToFetch: typeof selectedSubsets = []

      for (const subset of selectedSubsets) {
        const cachedGeneStats = getCachedGeneStats(subset.id)
        const cachedTranscriptStats = getCachedTranscriptStats(subset.id)

        if (cachedGeneStats && cachedTranscriptStats) {
          // Use cached data
          cachedStats[subset.id] = {
            subsetId: subset.id,
            geneStats: cachedGeneStats,
            transcriptStats: cachedTranscriptStats,
            loading: false,
            error: null
          }
        } else {
          // Only fetch if not already in state (avoid re-fetching on re-render)
          if (!stats[subset.id]) {
            subsetsToFetch.push(subset)
          }
        }
      }

      // Update state with cached data immediately
      if (Object.keys(cachedStats).length > 0) {
        setStats(prev => ({ ...prev, ...cachedStats }))
      }

      // Initialize loading state only for subsets that need fetching
      if (subsetsToFetch.length > 0) {
        const loadingStats: Record<string, SubsetStats> = {}
        subsetsToFetch.forEach(subset => {
          loadingStats[subset.id] = {
            subsetId: subset.id,
            geneStats: null,
            transcriptStats: null,
            loading: true,
            error: null
          }
        })
        setStats(prev => ({ ...prev, ...loadingStats }))
      }

      // Only fetch for subsets not in cache
      if (subsetsToFetch.length === 0) {
        return
      }

      // Fetch sequentially to avoid overwhelming the API
      for (const subset of subsetsToFetch) {
        if (cancelled) return

        const cachedGeneStats = getCachedGeneStats(subset.id)
        const cachedTranscriptStats = getCachedTranscriptStats(subset.id)

        try {
          const params = buildParamsFromFilters(subset.filters)
          
          // Only fetch what's not in cache
          const promises: Promise<any>[] = []
          if (!cachedGeneStats) {
            promises.push(fetchGeneStats(params).then(result => ({ type: 'gene', data: result })))
          }
          if (!cachedTranscriptStats) {
            promises.push(fetchTranscriptStats(params).then(result => ({ type: 'transcript', data: result })))
          }

          const results = await Promise.all(promises)
          
          let geneStatsResult = cachedGeneStats
          let transcriptStatsResult = cachedTranscriptStats

          for (const result of results) {
            if (result.type === 'gene') {
              geneStatsResult = result.data
              setCachedGeneStats(subset.id, result.data)
            } else if (result.type === 'transcript') {
              transcriptStatsResult = result.data
              setCachedTranscriptStats(subset.id, result.data)
            }
          }

          if (!cancelled) {
            setStats(prev => ({
              ...prev,
              [subset.id]: {
                subsetId: subset.id,
                geneStats: geneStatsResult,
                transcriptStats: transcriptStatsResult,
                loading: false,
                error: null
              }
            }))
          }
        } catch (err) {
          if (!cancelled) {
            setStats(prev => ({
              ...prev,
              [subset.id]: {
                subsetId: subset.id,
                geneStats: cachedGeneStats || null,
                transcriptStats: cachedTranscriptStats || null,
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to load statistics'
              }
            }))
          }
        }
      }
    }

    fetchAllStats()
    return () => {
      cancelled = true
    }
  }, [selectedSubsetIdsStr, getCachedGeneStats, setCachedGeneStats, getCachedTranscriptStats, setCachedTranscriptStats])

  if (selectedSubsets.length === 0) {
    return null
  }

  const formatLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  // Get the subset for the open modal
  const modalSubset = openModalId ? selectedSubsets.find(s => s.id === openModalId) : null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {selectedSubsets.map((subset) => {
        const subsetStats = stats[subset.id]
        const isLoading = !subsetStats || subsetStats.loading
        const hasError = subsetStats?.error

        return (
          <Card
            key={subset.id}
            className="p-3 border-2 transition-all duration-300 ease-in-out"
            style={{ 
              borderColor: subset.color,
            }}
          >
            <div className="space-y-2.5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: subset.color }}
                />
                <h3 className="text-sm font-semibold truncate flex-1">{subset.name}</h3>
                {!isLoading && !hasError && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={() => setOpenModalId(subset.id)}
                    title="View Details"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Activity className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : hasError ? (
                <div className="text-center py-2">
                  <p className="text-xs text-destructive">{hasError}</p>
                </div>
              ) : (
                <>
                  {/* Total Annotations */}
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Annotations</div>
                    <div className="text-xl font-bold">
                      {subsetStats?.geneStats?.total_annotations?.toLocaleString() || 
                       subsetStats?.transcriptStats?.total_annotations?.toLocaleString() || 
                       '0'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        )
      })}

      {/* Filter Details Modal */}
      {modalSubset && (
        <Dialog open={openModalId === modalSubset.id} onOpenChange={(open) => !open && setOpenModalId(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: modalSubset.color }}
                />
                Filter Details: {modalSubset.name}
              </DialogTitle>
              <DialogDescription>
                Complete list of filters applied to this annotation subset
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {modalSubset.filters.selectedTaxons.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Taxons ({modalSubset.filters.selectedTaxons.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.selectedTaxons.map((taxon) => (
                      <div key={String(taxon.taxid || '')} className="text-sm text-muted-foreground pl-2">
                        {String(taxon.scientific_name || taxon.taxid || 'Unknown')} ({String(taxon.taxid || '')})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.selectedBioprojects.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Bioprojects ({modalSubset.filters.selectedBioprojects.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.selectedBioprojects.map((bp) => (
                      <div key={bp.accession} className="text-sm text-muted-foreground pl-2 font-mono">
                        {bp.accession}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.selectedAssemblies.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Assemblies ({modalSubset.filters.selectedAssemblies.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.selectedAssemblies.map((assembly) => (
                      <div key={assembly.assembly_accession} className="text-sm text-muted-foreground pl-2 font-mono">
                        {assembly.assembly_accession}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.selectedAssemblyLevels.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Assembly Levels ({modalSubset.filters.selectedAssemblyLevels.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.selectedAssemblyLevels.map((level) => (
                      <div key={level} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(level)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.selectedAssemblyStatuses.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Assembly Statuses ({modalSubset.filters.selectedAssemblyStatuses.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.selectedAssemblyStatuses.map((status) => (
                      <div key={status} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.onlyRefGenomes && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Reference Genomes</div>
                  <div className="text-sm text-muted-foreground pl-2">RefSeq only</div>
                </div>
              )}

              {modalSubset.filters.biotypes.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Biotypes ({modalSubset.filters.biotypes.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.biotypes.map((biotype) => (
                      <div key={biotype} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(biotype)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.featureTypes.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Feature Types ({modalSubset.filters.featureTypes.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.featureTypes.map((type) => (
                      <div key={type} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(type)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.featureSources.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Feature Sources ({modalSubset.filters.featureSources.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.featureSources.map((source) => (
                      <div key={source} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(source)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.pipelines.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Pipelines ({modalSubset.filters.pipelines.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.pipelines.map((pipeline) => (
                      <div key={pipeline} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(pipeline)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.providers.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Providers ({modalSubset.filters.providers.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.providers.map((provider) => (
                      <div key={provider} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(provider)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.databaseSources.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1.5">Database Sources ({modalSubset.filters.databaseSources.length})</div>
                  <div className="space-y-1">
                    {modalSubset.filters.databaseSources.map((source) => (
                      <div key={source} className="text-sm text-muted-foreground pl-2">
                        {formatLabel(source)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalSubset.filters.selectedTaxons.length === 0 &&
               modalSubset.filters.selectedBioprojects.length === 0 &&
               modalSubset.filters.selectedAssemblies.length === 0 &&
               modalSubset.filters.selectedAssemblyLevels.length === 0 &&
               modalSubset.filters.selectedAssemblyStatuses.length === 0 &&
               !modalSubset.filters.onlyRefGenomes &&
               modalSubset.filters.biotypes.length === 0 &&
               modalSubset.filters.featureTypes.length === 0 &&
               modalSubset.filters.featureSources.length === 0 &&
               modalSubset.filters.pipelines.length === 0 &&
               modalSubset.filters.providers.length === 0 &&
               modalSubset.filters.databaseSources.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No filters applied
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

