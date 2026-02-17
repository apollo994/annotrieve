"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { X, Compass, Loader2, Dna, Database, FileText, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { WikiSummary } from "@/components/wiki-summary"
import { getTaxon, getTaxonAncestors } from "@/lib/api/taxons"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { buildEntityDetailsUrl } from "@/lib/utils"
import type { TaxonRecord } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const CELLULAR_ORGANISMS_TAXID = "131567"

type GeneCountStats = { mean: number; median: number; std: number; min: number; max: number; n: number }

interface TaxonomyDetailsPanelProps {
  selectedTaxon: { taxid: string; taxon: TaxonRecord }
  isPanelTaxonCurrentRoot: boolean
  onClose: () => void
  onExploreFrom: () => void
  onSelectAncestor: (ancestor: TaxonRecord) => void
}

export function TaxonomyDetailsPanel({
  selectedTaxon,
  isPanelTaxonCurrentRoot,
  onClose,
  onExploreFrom,
  onSelectAncestor,
}: TaxonomyDetailsPanelProps) {
  const router = useRouter()
  const setSelectedTaxons = useAnnotationsFiltersStore((state) => state.setSelectedTaxons)

  const [taxonDetails, setTaxonDetails] = useState<TaxonRecord | null>(null)
  const [ancestors, setAncestors] = useState<TaxonRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedTaxon) return
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [taxonData, ancestorsRes] = await Promise.all([
          getTaxon(selectedTaxon.taxid),
          getTaxonAncestors(selectedTaxon.taxid),
        ])
        if (cancelled) return
        setTaxonDetails(taxonData)
        setAncestors(
          (ancestorsRes.results || []).filter(
            (a) =>
              a.taxid !== selectedTaxon.taxid &&
              a.scientific_name?.toLowerCase() !== "cellular organisms" &&
              a.taxid !== CELLULAR_ORGANISMS_TAXID
          )
        )
      } catch {
        if (!cancelled) setTaxonDetails(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedTaxon.taxid])

  const distributionByCategory = useMemo((): Record<string, GeneCountStats> | null => {
    if (!taxonDetails?.stats) return null
    const stats = (taxonDetails.stats as { genes?: Record<string, { count?: GeneCountStats }> })
      ?.genes
    if (!stats) return null
    const out: Record<string, GeneCountStats> = {}
    for (const cat of ["coding", "non_coding", "pseudogene"] as const) {
      const s = stats[cat]?.count
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
  }, [taxonDetails])

  const handleViewFullDetails = useCallback(() => {
    router.push(buildEntityDetailsUrl("taxon", selectedTaxon.taxid))
  }, [selectedTaxon.taxid, router])

  const handleViewRelatedAnnotations = useCallback(() => {
    if (!taxonDetails) return
    setSelectedTaxons([taxonDetails])
    router.push("/annotations")
  }, [taxonDetails, setSelectedTaxons, router])

  const hasChildren = taxonDetails?.children && taxonDetails.children.length > 0
  const isLeaf = !loading && taxonDetails && !hasChildren

  return (
    <div
      className={cn(
        "flex flex-col h-full w-80 lg:w-96",
        isPanelTaxonCurrentRoot && "bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-sm font-semibold truncate">Taxon details</span>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose} aria-label="Close panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : taxonDetails ? (
          <>
            <div>
              <h3 className="text-base font-semibold">{taxonDetails.scientific_name}</h3>
              <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-muted-foreground">
                {taxonDetails.rank && (
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 capitalize">{taxonDetails.rank}</span>
                )}
                <span className="font-mono">TaxID {taxonDetails.taxid}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Card className="p-2 text-center">
                <Dna className="h-4 w-4 mx-auto text-primary mb-0.5" />
                <div className="text-xs text-muted-foreground">Organisms</div>
                <div className="text-sm font-semibold tabular-nums">
                  {(taxonDetails.organisms_count ?? 0).toLocaleString()}
                </div>
              </Card>
              <Card className="p-2 text-center">
                <Database className="h-4 w-4 mx-auto text-primary mb-0.5" />
                <div className="text-xs text-muted-foreground">Assemblies</div>
                <div className="text-sm font-semibold tabular-nums">
                  {(taxonDetails.assemblies_count ?? 0).toLocaleString()}
                </div>
              </Card>
              <Card className="p-2 text-center">
                <FileText className="h-4 w-4 mx-auto text-primary mb-0.5" />
                <div className="text-xs text-muted-foreground">Annotations</div>
                <div className="text-sm font-semibold tabular-nums">
                  {(taxonDetails.annotations_count ?? 0).toLocaleString()}
                </div>
              </Card>
            </div>

            {ancestors.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Lineage
                </h4>
                <div className="flex flex-wrap gap-1">
                  {ancestors.map((a) => (
                    <button
                      key={a.taxid}
                      type="button"
                      onClick={() => onSelectAncestor(a)}
                      className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors truncate max-w-[140px]"
                    >
                      {a.scientific_name}
                    </button>
                  ))}
                  <span className="text-xs font-semibold px-2 py-1 truncate max-w-[140px]">
                    {taxonDetails.scientific_name}
                  </span>
                </div>
              </div>
            )}

            {distributionByCategory && Object.keys(distributionByCategory).length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Gene count distribution
                </h4>
                <p className="text-xs text-muted-foreground">
                  Across {(taxonDetails.annotations_count ?? 0).toLocaleString()} annotation
                  {(taxonDetails.annotations_count ?? 0) !== 1 ? "s" : ""}.
                </p>
                <div className="space-y-1.5">
                  {Object.entries(distributionByCategory).map(([category, s]) => (
                    <div
                      key={category}
                      className={cn(
                        "rounded-md border p-2",
                        category === "coding" && "border-primary/30 bg-primary/5",
                        category === "non_coding" && "border-secondary/30 bg-secondary/5",
                        category === "pseudogene" && "border-accent/30 bg-accent/5"
                      )}
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium capitalize">
                          {category === "non_coding" ? "Non-coding" : category}
                        </span>
                        <span className="tabular-nums">mean {s.mean.toFixed(1)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                        <span>med {s.median.toFixed(0)}</span>
                        <span>std {s.std.toFixed(1)}</span>
                        <span>min {s.min}</span>
                        <span>max {s.max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <WikiSummary searchTerm={taxonDetails.scientific_name || ""} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load details.</p>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-border p-3 bg-muted/20 space-y-3">
        {isLeaf && (
          <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              This taxon is a leaf (no children). You can explore its full details or related annotations below.
            </p>
          </div>
        )}
        {isPanelTaxonCurrentRoot ? (
          <Button
            variant="secondary"
            disabled
            className="w-full h-11 font-semibold gap-2 bg-muted text-muted-foreground cursor-not-allowed"
          >
            <Compass className="h-4 w-4" />
            Already selected as root
          </Button>
        ) : hasChildren ? (
          <Button onClick={onExploreFrom} className="w-full h-11 font-semibold gap-2">
            <Compass className="h-4 w-4" />
            Explore from {selectedTaxon.taxon.scientific_name}
          </Button>
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={handleViewFullDetails}>
            Full details
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={handleViewRelatedAnnotations}>
            Annotations
          </Button>
        </div>
      </div>
    </div>
  )
}
