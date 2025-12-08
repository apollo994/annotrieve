"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useAnnotationSubsetsStore, type AnnotationSubset } from "@/lib/stores/annotation-subsets"
import { GitCompare } from "lucide-react"
import { cn } from "@/lib/utils"

interface CompareSubsetSelectorProps {
  selectedSubsetIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function CompareSubsetSelector({ selectedSubsetIds, onSelectionChange }: CompareSubsetSelectorProps) {
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)

  const handleToggle = (subsetId: string) => {
    if (selectedSubsetIds.includes(subsetId)) {
      onSelectionChange(selectedSubsetIds.filter(id => id !== subsetId))
    } else {
      if (selectedSubsetIds.length < 5) {
        onSelectionChange([...selectedSubsetIds, subsetId])
      }
    }
  }

  const handleClearAll = () => {
    onSelectionChange([])
  }

  if (subsets.length === 0) {
    return (
      <div className="h-full overflow-y-auto border-r border-border bg-background">
        <div className="p-4">
          <div className="text-center text-sm text-muted-foreground py-8">
            <GitCompare className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="mb-1 font-medium">No filter sets saved</p>
            <p className="text-xs">Save filter sets from the annotations page to compare them here.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto border-r border-border bg-background">
      <div className="p-4 space-y-6">
        {/* Filter Sets Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Filter Sets</h3>
            </div>
            {selectedSubsetIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            )}
          </div>
          
          {selectedSubsetIds.length >= 5 && (
            <div className="px-2 py-1.5 bg-muted/30 rounded-md">
              <p className="text-xs text-muted-foreground text-center">
                Maximum 5 filter sets can be compared
              </p>
            </div>
          )}

          {/* Subset List */}
          <div className="space-y-1">
            {subsets.map((subset) => {
              const isSelected = selectedSubsetIds.includes(subset.id)
              const isDisabled = !isSelected && selectedSubsetIds.length >= 5

              return (
                <div
                  key={subset.id}
                  onClick={() => !isDisabled && handleToggle(subset.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-start gap-2.5 group cursor-pointer",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium border border-primary/20"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent",
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isDisabled) handleToggle(subset.id)
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(subset.id)}
                      disabled={isDisabled}
                      className="mt-0.5 flex-shrink-0"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: subset.color }}
                      />
                      <div className="font-medium truncate">{subset.name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {getFilterSummary(subset)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function getFilterSummary(subset: AnnotationSubset): string {
  const parts: string[] = []
  const filters = subset.filters
  
  // Taxons
  if (filters.selectedTaxons.length > 0) {
    parts.push(`${filters.selectedTaxons.length} taxon${filters.selectedTaxons.length > 1 ? 's' : ''}`)
  }
  
  // Bioprojects
  if (filters.selectedBioprojects.length > 0) {
    parts.push(`${filters.selectedBioprojects.length} bioproject${filters.selectedBioprojects.length > 1 ? 's' : ''}`)
  }
  
  // Assemblies
  if (filters.selectedAssemblies.length > 0) {
    parts.push(`${filters.selectedAssemblies.length} assembl${filters.selectedAssemblies.length > 1 ? 'ies' : 'y'}`)
  }
  
  // Assembly levels
  if (filters.selectedAssemblyLevels.length > 0) {
    parts.push(`${filters.selectedAssemblyLevels.length} level${filters.selectedAssemblyLevels.length > 1 ? 's' : ''}`)
  }
  
  // Assembly statuses
  if (filters.selectedAssemblyStatuses.length > 0) {
    parts.push(`${filters.selectedAssemblyStatuses.length} status${filters.selectedAssemblyStatuses.length > 1 ? 'es' : ''}`)
  }
  
  // Reference genomes
  if (filters.onlyRefGenomes) {
    parts.push('RefSeq')
  }
  
  // Biotypes
  if (filters.biotypes.length > 0) {
    parts.push(`${filters.biotypes.length} biotype${filters.biotypes.length > 1 ? 's' : ''}`)
  }
  
  // Feature types
  if (filters.featureTypes.length > 0) {
    parts.push(`${filters.featureTypes.length} feature type${filters.featureTypes.length > 1 ? 's' : ''}`)
  }
  
  // Feature sources
  if (filters.featureSources.length > 0) {
    parts.push(`${filters.featureSources.length} feature source${filters.featureSources.length > 1 ? 's' : ''}`)
  }
  
  // Pipelines
  if (filters.pipelines.length > 0) {
    parts.push(`${filters.pipelines.length} pipeline${filters.pipelines.length > 1 ? 's' : ''}`)
  }
  
  // Providers
  if (filters.providers.length > 0) {
    parts.push(`${filters.providers.length} provider${filters.providers.length > 1 ? 's' : ''}`)
  }
  
  // Database sources
  if (filters.databaseSources.length > 0) {
    parts.push(`${filters.databaseSources.length} database${filters.databaseSources.length > 1 ? 's' : ''}`)
  }
  
  return parts.length > 0 ? parts.join(' • ') : 'No filters'
}

