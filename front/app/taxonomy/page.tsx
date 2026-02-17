"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Network,
  GitBranch,
  LayoutList,
  Layers,
  Search,
  Info,
  Home,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TreeOfLifeD3New } from "@/components/tree-of-life-d3-new"
import { TaxonomyTreeCanvas } from "@/components/taxonomy-tree-canvas"
import { GeneStackRadialChart } from "@/components/gene-stack-radial-chart"
import { TaxonomyDetailsPanel } from "@/components/taxonomy-details-panel"
import { RadialTreeWithWarning } from "./radial-tree-with-warning"
import { useTaxonomyUrlSync } from "./use-taxonomy-url-sync"
import { useFlattenedTreeStore } from "@/lib/stores/flattened-tree"
import type { TaxonRecord } from "@/lib/api/types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const EUKARYOTA_TAXID = "2759"

type ViewTab = "overview" | "tree" | "constant-branch" | "gene-stack"

function flatNodeToTaxonRecord(node: FlatTreeNode): TaxonRecord {
  return {
    taxid: node.id,
    scientific_name: node.scientific_name,
    rank: node.rank ?? undefined,
    organisms_count: node.organisms_count,
    assemblies_count: node.assemblies_count,
    annotations_count: node.annotations_count,
  }
}

export default function TaxonomyNewPage() {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const { fetchFlattenedTree, searchNodes } = useFlattenedTreeStore()

  const [rootTaxon, setRootTaxon] = useState<{ taxid: string; taxon: TaxonRecord } | null>(null)
  const [selectedTaxon, setSelectedTaxon] = useState<{ taxid: string; taxon: TaxonRecord } | null>(null)
  const [activeView, setActiveView] = useState<ViewTab>("overview")

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<FlatTreeNode[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const [radialWarningAcknowledged, setRadialWarningAcknowledged] = useState<Set<string>>(new Set())

  useTaxonomyUrlSync({
    rootTaxon,
    setRootTaxon,
    setSelectedTaxon,
    setActiveView,
  })

  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (!query.trim()) {
        setSearchResults([])
        setShowSearchResults(false)
        return
      }
      const results = searchNodes(query.trim(), 10)
      setSearchResults(results)
      setShowSearchResults(results.length > 0)
    },
    [searchNodes]
  )

  const handleSelectTaxonFromSearch = useCallback((node: FlatTreeNode) => {
    const taxon = flatNodeToTaxonRecord(node)
    setSelectedTaxon({ taxid: node.id, taxon })
    setShowSearchResults(false)
    setSearchQuery("")
  }, [])

  const handleTaxonSelectFromComponent = useCallback((taxid: string, node: FlatTreeNode) => {
    setSelectedTaxon({ taxid, taxon: flatNodeToTaxonRecord(node) })
  }, [])

  const handleExploreFrom = useCallback(() => {
    if (!selectedTaxon) return
    setRootTaxon(selectedTaxon)
    setSelectedTaxon(null)
  }, [selectedTaxon])

  const handleSelectAncestor = useCallback((ancestor: TaxonRecord) => {
    setSelectedTaxon({ taxid: ancestor.taxid, taxon: ancestor })
  }, [])

  const handleGeneStackTaxonSelect = useCallback(
    (taxid: string) => {
      if (selectedTaxon?.taxid === taxid) {
        setSelectedTaxon(null)
        return
      }
      const node = flatNodes.find((n) => n.id === taxid)
      const taxon = node
        ? flatNodeToTaxonRecord(node)
        : ({ taxid, scientific_name: `Taxon ${taxid}` } as TaxonRecord)
      setSelectedTaxon({ taxid, taxon })
    },
    [flatNodes, selectedTaxon?.taxid]
  )

  const handleAckRadialWarning = useCallback((key: string) => {
    setRadialWarningAcknowledged((prev) => new Set(prev).add(key))
  }, [])

  const currentDisplayTaxon = useMemo(() => {
    if (rootTaxon) return rootTaxon
    const eukaryota = flatNodes.find((n) => n.id === EUKARYOTA_TAXID)
    return {
      taxid: EUKARYOTA_TAXID,
      taxon: eukaryota
        ? flatNodeToTaxonRecord(eukaryota)
        : ({ taxid: EUKARYOTA_TAXID, scientific_name: "Eukaryota" } as TaxonRecord),
    }
  }, [rootTaxon, flatNodes])

  const handleTogglePanelForCurrentTaxon = useCallback(() => {
    const { taxid, taxon } = currentDisplayTaxon
    setSelectedTaxon((prev) => (prev?.taxid === taxid ? null : { taxid, taxon }))
  }, [currentDisplayTaxon])

  const currentRootTaxid = rootTaxon?.taxid ?? null
  const isPanelTaxonCurrentRoot =
    selectedTaxon != null &&
    selectedTaxon.taxid === (rootTaxon?.taxid ?? EUKARYOTA_TAXID)

  const viewKey = currentRootTaxid ?? EUKARYOTA_TAXID
  const organismsCount = currentDisplayTaxon.taxon.organisms_count ?? 0

  return (
    <div className="relative flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <header className="flex-shrink-0 border-b border-border bg-card/50">
        <div className="flex items-center justify-between gap-4 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Network className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold text-foreground truncate">Taxonomy Explorer</h1>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 shrink-0">
              Beta
            </Badge>
            <span className="text-xs text-muted-foreground">This is still a beta feature. The UI and functionality may change in the future.</span>
          </div>
          <div ref={searchContainerRef} className="relative w-[200px] sm:w-[260px] shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search taxon by name or ID..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              className="pl-9 pr-4 h-9 bg-background"
            />
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-50 right-0 w-full min-w-[240px] mt-1 bg-card border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleSelectTaxonFromSearch(node)}
                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                  >
                    <div className="font-mediumassembly reports text-sm">{node.scientific_name}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {node.id} · {node.annotations_count.toLocaleString()} annotations
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border" role="separator" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1" aria-label="View root">
            {rootTaxon ? (
              <button
                type="button"
                onClick={() => setRootTaxon(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded px-1.5 py-0.5 transition-colors shrink-0"
                title="Back to Eukaryota (root)"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Root</span>
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Home className="h-3.5 w-3.5" />
                <span>Root</span>
              </span>
            )}
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="font-semibold text-primary truncate text-sm" title="Current view root">
              {currentDisplayTaxon.taxon.scientific_name}
            </span>
            {currentDisplayTaxon.taxon.rank && (
              <span className="text-[10px] text-muted-foreground px-1 py-0.5 rounded bg-muted/50 capitalize shrink-0">
                {currentDisplayTaxon.taxon.rank}
              </span>
            )}
            <button
              type="button"
              onClick={handleTogglePanelForCurrentTaxon}
              className={cn(
                "p-0.5 rounded hover:bg-muted transition-colors shrink-0",
                selectedTaxon?.taxid === currentDisplayTaxon.taxid && "text-primary bg-primary/10"
              )}
              title={selectedTaxon?.taxid === currentDisplayTaxon.taxid ? "Close details panel" : "View taxon details"}
              aria-label={selectedTaxon?.taxid === currentDisplayTaxon.taxid ? "Close details panel" : "View taxon details"}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as ViewTab)} className="shrink-0">
            <TabsList className="w-auto inline-flex flex-wrap h-auto gap-1 p-1 bg-muted/50 justify-start">
              <TabsTrigger value="overview" className="gap-1.5 text-xs">
                <Network className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="tree" className="gap-1.5 text-xs">
                <LayoutList className="h-3.5 w-3.5" />
                Tree
              </TabsTrigger>
              <TabsTrigger value="constant-branch" className="gap-1.5 text-xs">
                <GitBranch className="h-3.5 w-3.5" />
                Radial
              </TabsTrigger>
              <TabsTrigger value="gene-stack" className="gap-1.5 text-xs">
                <Layers className="h-3.5 w-3.5" />
                Gene Stack
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 min-h-0 overflow-auto pt-2">
          {activeView === "overview" && (
            <div className="w-full px-4">
              <TreeOfLifeD3New
                rootTaxid={currentRootTaxid}
                onTaxonSelect={handleTaxonSelectFromComponent}
                description={
                  rootTaxon
                    ? `Circle-packing view of the taxonomy under ${currentDisplayTaxon.taxon.scientific_name}. Nested circles represent parent–child relationships; size reflects annotation count.`
                    : undefined
                }
              />
            </div>
          )}
          {activeView === "tree" && (
            <div className="w-full px-4">
              <TaxonomyTreeCanvas
                rootTaxid={currentRootTaxid}
                onTaxonSelect={handleTaxonSelectFromComponent}
                scopeHint={rootTaxon ? currentDisplayTaxon.taxon.scientific_name : undefined}
              />
            </div>
          )}
          {activeView === "constant-branch" && (
            <div className="w-full px-4">
              <RadialTreeWithWarning
                rootTaxid={currentRootTaxid}
                organismsCount={organismsCount}
                viewKey={viewKey}
                acknowledgedKeys={radialWarningAcknowledged}
                onAcknowledge={handleAckRadialWarning}
                onTaxonSelect={handleTaxonSelectFromComponent}
                scopeHint={rootTaxon ? currentDisplayTaxon.taxon.scientific_name : undefined}
              />
            </div>
          )}
          {activeView === "gene-stack" && (
            <div className="w-full px-4">
              <GeneStackRadialChart
                rootTaxid={currentRootTaxid}
                onTaxonSelect={handleGeneStackTaxonSelect}
                description={
                  rootTaxon
                    ? `Gene counts by leaf taxon under ${currentDisplayTaxon.taxon.scientific_name}. Each wedge shows coding, non-coding, and pseudogene counts. Click on a wedge to explore.`
                    : undefined
                }
              />
            </div>
          )}
        </main>

        <aside
          className={cn(
            "flex-shrink-0 flex flex-col border-l border-border bg-card transition-all duration-300 ease-out",
            selectedTaxon ? "w-80 lg:w-96" : "w-0 overflow-hidden border-0",
            selectedTaxon && isPanelTaxonCurrentRoot && "border-l-2 border-l-primary"
          )}
        >
          {selectedTaxon && (
            <div className="flex flex-col h-full w-80 lg:w-96 animate-in slide-in-from-right-5 duration-300">
              <TaxonomyDetailsPanel
                selectedTaxon={selectedTaxon}
                isPanelTaxonCurrentRoot={isPanelTaxonCurrentRoot}
                onClose={() => setSelectedTaxon(null)}
                onExploreFrom={handleExploreFrom}
                onSelectAncestor={handleSelectAncestor}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
