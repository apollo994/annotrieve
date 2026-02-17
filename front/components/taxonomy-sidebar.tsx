"use client"

import { useRef, useEffect } from "react"
import { Network, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useUIStore } from "@/lib/stores/ui"
import { useTaxonomyGeneTypesStore, type GeneType } from "@/lib/stores/taxonomy-gene-types"
import type { FlatTreeNode } from "@/lib/api/taxons"

function getGeneColors(isDark: boolean) {
  return {
    coding: isDark ? "#34d399" : "#10b981",
    non_coding: isDark ? "#fbbf24" : "#f59e0b",
    pseudogene: isDark ? "#818cf8" : "#6366f1",
  }
}

interface TaxonomySidebarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  searchResults: FlatTreeNode[]
  showSearchResults: boolean
  onShowSearchResults: (show: boolean) => void
  onSelectTaxonFromSearch: (node: FlatTreeNode) => void
}

export function TaxonomySidebar({
  searchQuery,
  onSearchChange,
  searchResults,
  showSearchResults,
  onShowSearchResults,
  onSelectTaxonFromSearch,
}: TaxonomySidebarProps) {
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === "dark"
  const { selectedGeneTypes, toggleGeneType } = useTaxonomyGeneTypesStore()
  const geneColors = getGeneColors(isDark)

  const handleGeneTypeChange = (type: GeneType, checked: boolean) => {
    if (!checked && selectedGeneTypes.size <= 1) return
    toggleGeneType(type)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        onShowSearchResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onShowSearchResults])

  return (
    <div className="w-full border-r bg-background h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Header */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Network className="h-4 w-4 text-accent shrink-0" />
              Taxonomy Explorer
            </h2>
            <p className="text-sm text-muted-foreground">
              Explore the tree of annotated organisms; search or click a taxon to focus the view.
            </p>
          </div>

          {/* Search */}
          <div className="space-y-1.5">
            <label htmlFor="taxon-search" className="text-sm font-medium text-foreground">
              Search taxon
            </label>
            <div ref={searchContainerRef} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="taxon-search"
                type="text"
                placeholder="By name or ID..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => searchResults.length > 0 && onShowSearchResults(true)}
                className="pl-9 pr-4 bg-background h-9"
              />
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectTaxonFromSearch(node)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="font-medium text-sm">{node.scientific_name}</div>
                      <div className="text-xs text-muted-foreground">
                        ID: {node.id} · {node.annotations_count.toLocaleString()} annotations
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Gene category filters – shared by all taxonomy views */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Gene categories
            </label>
            <p className="text-xs text-muted-foreground">
              Toggle to show or hide gene types in the tree and charts.
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sidebar-gene-coding"
                  checked={selectedGeneTypes.has("coding")}
                  disabled={selectedGeneTypes.has("coding") && selectedGeneTypes.size === 1}
                  onCheckedChange={(checked) => handleGeneTypeChange("coding", checked === true)}
                  className="border-primary data-[state=checked]:bg-primary"
                  style={{
                    borderColor: geneColors.coding,
                    ...(selectedGeneTypes.has("coding") && {
                      backgroundColor: geneColors.coding,
                      color: "#ffffff",
                    }),
                  }}
                />
                <Label htmlFor="sidebar-gene-coding" className="text-sm cursor-pointer">
                  Coding
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sidebar-gene-non-coding"
                  checked={selectedGeneTypes.has("non_coding")}
                  disabled={selectedGeneTypes.has("non_coding") && selectedGeneTypes.size === 1}
                  onCheckedChange={(checked) => handleGeneTypeChange("non_coding", checked === true)}
                  className="border-primary data-[state=checked]:bg-primary"
                  style={{
                    borderColor: geneColors.non_coding,
                    ...(selectedGeneTypes.has("non_coding") && {
                      backgroundColor: geneColors.non_coding,
                      color: "#ffffff",
                    }),
                  }}
                />
                <Label htmlFor="sidebar-gene-non-coding" className="text-sm cursor-pointer">
                  Non-coding
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sidebar-gene-pseudogene"
                  checked={selectedGeneTypes.has("pseudogene")}
                  disabled={selectedGeneTypes.has("pseudogene") && selectedGeneTypes.size === 1}
                  onCheckedChange={(checked) => handleGeneTypeChange("pseudogene", checked === true)}
                  className="border-primary data-[state=checked]:bg-primary"
                  style={{
                    borderColor: geneColors.pseudogene,
                    ...(selectedGeneTypes.has("pseudogene") && {
                      backgroundColor: geneColors.pseudogene,
                      color: "#ffffff",
                    }),
                  }}
                />
                <Label htmlFor="sidebar-gene-pseudogene" className="text-sm cursor-pointer">
                  Pseudogene
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
