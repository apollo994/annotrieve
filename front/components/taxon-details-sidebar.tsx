"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Dna, Database, FileText, Loader2, ExternalLink, GitBranch, FileSearch, X } from "lucide-react"
import { getTaxon, getTaxonChildren } from "@/lib/api/taxons"
import { WikiSummary } from "@/components/wiki-summary"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/lib/stores/ui"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { buildEntityDetailsUrl } from "@/lib/utils"
import type { TaxonRecord } from "@/lib/api/types"

interface DistributionStats {
  mean: number
  median: number
  std: number
  min: number
  max: number
  n: number
}

interface TaxonStats {
  genes?: {
    coding?: { count?: DistributionStats }
    non_coding?: { count?: DistributionStats }
    pseudogene?: { count?: DistributionStats }
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding",
  non_coding: "Non-coding",
  pseudogene: "Pseudogene",
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-primary/15 border-primary/30 text-primary",
  non_coding: "bg-secondary/15 border-secondary/30 text-secondary",
  pseudogene: "bg-accent/15 border-accent/30 text-accent",
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  )
}

function DistributionStatsCard({
  category,
  stats,
}: {
  category: string
  stats: DistributionStats
}) {
  return (
    <Card className={`p-2.5 border ${CATEGORY_COLORS[category] || ""}`}>
      <h4 className="text-sm font-semibold mb-1">{CATEGORY_LABELS[category] ?? category}</h4>
      <div className="space-y-0.5">
        <StatRow label="Mean" value={stats.mean.toFixed(2)} />
        <StatRow label="Median" value={stats.median.toFixed(2)} />
        <StatRow label="Std" value={stats.std.toFixed(2)} />
        <StatRow label="Min" value={stats.min.toFixed(0)} />
        <StatRow label="Max" value={stats.max.toFixed(0)} />
        <StatRow label="n" value={stats.n} />
      </div>
    </Card>
  )
}

interface TaxonDetailsSidebarProps {
  taxid: string
  onSetAsRoot?: (taxid: string, taxon: TaxonRecord) => void
  onClose?: () => void
}

export function TaxonDetailsSidebar({ taxid, onSetAsRoot, onClose }: TaxonDetailsSidebarProps) {
  const router = useRouter()
  const closeRightSidebar = useUIStore((state) => state.closeRightSidebar)
  const setRightSidebarView = useUIStore((state) => state.setRightSidebarView)
  const close = onClose ?? closeRightSidebar
  const setSelectedTaxons = useAnnotationsFiltersStore((state) => state.setSelectedTaxons)
  const [taxon, setTaxon] = useState<TaxonRecord | null>(null)
  const [children, setChildren] = useState<TaxonRecord[]>([])
  const [childrenLoading, setChildrenLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (!taxid) return

      try {
        setIsLoading(true)

        const taxonData = await getTaxon(taxid)
        setTaxon(taxonData)
      } catch (error) {
        console.error("Error loading taxon data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [taxid])

  useEffect(() => {
    async function loadChildren() {
      if (!taxid) return

      try {
        setChildrenLoading(true)
        const res = await getTaxonChildren(taxid)
        setChildren(res.results || [])
      } catch (error) {
        console.error("Error loading children:", error)
        setChildren([])
      } finally {
        setChildrenLoading(false)
      }
    }

    loadChildren()
  }, [taxid])

  const sortedChildren = useMemo(() => {
    return [...children].sort(
      (a, b) => (b.organisms_count ?? 0) - (a.organisms_count ?? 0)
    )
  }, [children])

  const distributionByCategory = useMemo(() => {
    if (!taxon) return null
    const stats = taxon.stats as TaxonStats | undefined
    if (!stats?.genes) return null
    const out: Record<string, DistributionStats> = {}
    const categories = ["coding", "non_coding", "pseudogene"] as const
    for (const cat of categories) {
      const s = stats.genes[cat]?.count
      if (s && typeof s.mean === "number") {
        out[cat] = {
          mean: s.mean,
          median: s.median ?? 0,
          std: s.std ?? 0,
          min: s.min ?? 0,
          max: s.max ?? 0,
          n: s.n ?? 0,
        }
      }
    }
    return Object.keys(out).length ? out : null
  }, [taxon])

  const handleViewFullDetails = () => {
    close()
    router.push(buildEntityDetailsUrl("taxon", taxid))
  }

  const handleViewRelatedAnnotations = () => {
    if (!taxon) return
    setSelectedTaxons([taxon])
    close()
    router.push("/annotations")
  }

  const handleSelectChild = (childTaxid: string) => {
    setRightSidebarView("taxon-details", { taxid: childTaxid })
  }

  const handleSetAsRoot = () => {
    if (!taxon) return
    if (onSetAsRoot) {
      onSetAsRoot(taxid, taxon)
      close()
    } else {
      const setTaxonomyInitialRoot = useUIStore.getState().setTaxonomyInitialRoot
      setTaxonomyInitialRoot({ taxid, taxon })
      close()
      router.push("/annotations/taxonomy")
    }
  }

  // Loading state: header with close button
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
          <span className="text-sm text-muted-foreground">Loading…</span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Not found
  if (!taxon) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0 bg-muted/30">
          <span className="text-sm font-medium">Taxon details</span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-3 text-sm text-muted-foreground">
          Taxon not found.
        </div>
      </div>
    )
  }

  const annotationsCount = taxon.annotations_count ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Header - minimal, with counts */}
      <div className="flex flex-col border-b flex-shrink-0 bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{taxon.scientific_name}</h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {taxon.rank && <span>{taxon.rank}</span>}
              <span className="font-mono">TaxID {taxon.taxid}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* Counts in header */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground" title="Organisms">
            <Dna className="h-3.5 w-3.5" />
            Organisms:
            <span className="tabular-nums font-medium text-foreground">{(taxon.organisms_count ?? 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground" title="Assemblies">
            <Database className="h-3.5 w-3.5" />
            Assemblies:
            <span className="tabular-nums font-medium text-foreground">{(taxon.assemblies_count ?? 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground" title="Annotations">
            <FileText className="h-3.5 w-3.5" />
            Annotations:
            <span className="tabular-nums font-medium text-foreground">{annotationsCount.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {/* Set as root - first priority, most visible (hidden when no children) */}
        {(childrenLoading || children.length > 0) && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <Button
              onClick={handleSetAsRoot}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 gap-2 text-sm font-medium"
            >
              <GitBranch className="h-4 w-4" />
              Set as root
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Focus the tree view on this taxon. Updates the explorer to show only this branch and its descendants.
            </p>
          </div>
        )}

        {/* Wikipedia - helps understand the taxon */}
        <WikiSummary searchTerm={taxon.scientific_name || ""} />
        {/* Gene count distribution */}
        {distributionByCategory && Object.keys(distributionByCategory).length > 0 && (
          <Card className="p-3">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Gene count distribution
            </h5>
            <p className="text-xs text-muted-foreground mb-2">
              Across {annotationsCount.toLocaleString()} annotation
              {annotationsCount !== 1 ? "s" : ""} under this taxon.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.entries(distributionByCategory) as [string, DistributionStats][]).map(
                ([category, stats]) => (
                  <DistributionStatsCard key={category} category={category} stats={stats} />
                )
              )}
            </div>
          </Card>
        )}
        {/* Direct children (hidden when no children) */}
        {(childrenLoading || children.length > 0) && (
        <Card className="p-3">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Direct children
          </h5>
            {childrenLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {sortedChildren.map((child) => (
                  <button
                    key={child.taxid}
                    type="button"
                    onClick={() => handleSelectChild(String(child.taxid))}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-muted/60 border border-transparent hover:border-border transition-colors text-left group"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">{child.scientific_name}</span>
                      {child.rank && (
                        <span className="text-xs text-muted-foreground">{child.rank}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                      <span className="flex items-center gap-1" title="Organisms">
                        <Dna className="h-3.5 w-3.5" />
                        <span className="text-xs tabular-nums">{(child.organisms_count ?? 0).toLocaleString()}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Assemblies">
                        <Database className="h-3.5 w-3.5" />
                        <span className="text-xs tabular-nums">{(child.assemblies_count ?? 0).toLocaleString()}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Annotations">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="text-xs tabular-nums">{(child.annotations_count ?? 0).toLocaleString()}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </Card>
        )}
      </div>

      {/* Footer - always visible at bottom */}
      <div className="flex-shrink-0 border-t border-border px-3 py-2">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={handleViewFullDetails}
          >
            <ExternalLink className="h-3 w-3" />
            Full details
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={handleViewRelatedAnnotations}
          >
            <FileSearch className="h-3 w-3" />
            Annotations
          </Button>
        </div>
      </div>
    </div>
  )
}
