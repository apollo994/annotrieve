'use client'

import { useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ChevronRight, ChevronDown, Check, Dna, Database, FileText, ExternalLink, Search } from 'lucide-react'
import { useTaxonomicTreeStore } from '@/lib/stores/taxonomic-tree'
import { useUIStore } from '@/lib/stores/ui'
import { getRankColor, extractCounts, extractGeneCounts, GENE_STACK_COLORS } from './utils'
import { buildTree, buildSearchTreeStructure, buildAncestorTree, flattenTrees } from './tree-builder'
import type { TreeNode } from '@/lib/stores/taxonomic-tree'
import { buildEntityDetailsUrl } from '@/lib/utils'

interface TreeTableProps {
  rootTaxid: string
  rootNode: any
  selectedTaxid?: string | null
  onNodeClick?: (taxid: string) => void
}

export function TreeTable({ rootTaxid, rootNode, selectedTaxid, onNodeClick }: TreeTableProps) {
  const router = useRouter()
  const openInsdcSearchModal = useUIStore((state) => state.openInsdcSearchModal)
  const rankRootsObserverTargetRef = useRef<HTMLDivElement>(null)
  
  const {
    expandedNodes,
    selectedNodes,
    childrenData,
    fetchingNodes,
    fetchedNodes,
    searchResults,
    isSearchMode,
    isSearchingFromBar,
    hasNoSearchResults,
    matchedTaxids,
    selectedRank,
    rankRoots,
    loadingRankRoots,
    hasMoreRankRoots,
    loadMoreRankRoots,
    selectedTaxonData,
    selectedTaxonAncestors,
    toggleExpand,
    toggleSelect,
    fetchChildren
  } = useTaxonomicTreeStore()

  // Build trees based on current state
  const trees = useMemo(() => {
    // Priority 1: If in search mode, handle search results
    if (isSearchMode) {
      if (searchResults.length === 0) {
        return []
      }
      return buildSearchTreeStructure(searchResults, childrenData, expandedNodes)
    }
    
    // Priority 2: If a taxon is selected from search, build tree from ancestors
    if (selectedTaxid && selectedTaxonData && selectedTaxonAncestors.length > 0) {
      return buildAncestorTree(
        selectedTaxid,
        selectedTaxonData,
        selectedTaxonAncestors,
        childrenData,
        expandedNodes,
      )
    }
    
    // Priority 3: Multiple roots from rank selection
    if (selectedRank && rankRoots.length > 0) {
      return rankRoots.map(root => buildTree(root.taxid, root, childrenData, expandedNodes, 0, undefined, true))
    }
    
    // Priority 4: Single root node (default)
    if (rootNode) {
      return [buildTree(rootTaxid, rootNode, childrenData, expandedNodes, 0, undefined, true)]
    }
    
    return []
  }, [
    isSearchMode,
    searchResults,
    childrenData,
    expandedNodes,
    selectedTaxid,
    selectedTaxonData,
    selectedTaxonAncestors,
    selectedRank,
    rankRoots,
    rootNode,
    rootTaxid
  ])

  const flattenedNodes = useMemo(() => flattenTrees(trees), [trees])

  const maxGeneSum = useMemo(() => {
    let max = 0
    for (const node of flattenedNodes) {
      const g = extractGeneCounts(node.data)
      const sum = g.coding + g.nonCoding + g.pseudogene
      if (sum > max) max = sum
    }
    return max || 1
  }, [flattenedNodes])

  // Fetch children for expanded nodes
  useEffect(() => {
    if (isSearchMode && searchResults.length === 0) {
      return
    }

    const expandedTaxids = Array.from(expandedNodes)
    for (const taxid of expandedTaxids) {
      if (!fetchedNodes.has(taxid)) {
        fetchChildren(taxid)
      }
    }
  }, [expandedNodes, fetchedNodes, isSearchMode, searchResults.length, fetchChildren])

  // Get searchQuery from store
  const searchQuery = useTaxonomicTreeStore((state) => state.searchQuery)

  // Intersection Observer for infinite scroll (rank roots)
  useEffect(() => {
    if (!hasMoreRankRoots || !selectedRank) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRankRoots && !loadingRankRoots) {
          loadMoreRankRoots()
        }
      },
      { 
        rootMargin: '100px',
        threshold: 0.1
      }
    )

    const currentTarget = rankRootsObserverTargetRef.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMoreRankRoots, loadingRankRoots, loadMoreRankRoots, selectedRank])

  const handleExpand = useCallback((taxid: string) => {
    toggleExpand(taxid)
    if (!expandedNodes.has(taxid)) {
      fetchChildren(taxid)
    }
  }, [toggleExpand, expandedNodes, fetchChildren])

  const handleSelect = useCallback(
    (taxid: string, nodeData: any) => {
      toggleSelect(taxid, nodeData)
      onNodeClick?.(taxid)
    },
    [toggleSelect, onNodeClick]
  )

  // No results card
  if (isSearchMode && !isSearchingFromBar && flattenedNodes.length === 0 && hasNoSearchResults) {
    return (
      <>
        <Card className="border-border">
          <div className="p-8 text-center">
            <div className="space-y-4 max-w-md mx-auto">
              <p className="text-lg font-medium text-foreground">No taxons found matching your search.</p>
              <p className="text-sm text-muted-foreground">
                Try searching in INSDC databases to find taxons that might not be in our database yet.
              </p>
              <div className="pt-4">
                <Button
                  variant="outline"
                  onClick={() => openInsdcSearchModal(searchQuery)}
                  className="gap-2"
                >
                  <Search className="h-4 w-4" />
                  Search INSDC Databases
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[80vh] overflow-y-auto">
          <table className="w-full border-collapse">
            {/* Legend Header */}
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="w-10 px-1 py-2"></th>
                <th className="p-3 text-left"></th>
                <th className="p-3 text-left"></th>
                <th className="p-3 w-48 text-right">
                  <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className="text-muted-foreground">Mean counts:</span>
                    </div>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-sm ${GENE_STACK_COLORS.coding}`} />
                      <span>Coding</span>
                    </div>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-sm ${GENE_STACK_COLORS.nonCoding}`} />
                      <span>Non-coding</span>
                    </div>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-sm ${GENE_STACK_COLORS.pseudogene}`} />
                      <span>Pseudogene</span>
                    </div>
                  </div>
                </th>
                <th className="p-3 text-right">
                  <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Dna className="h-3 w-3 text-green-500" />
                      <span>Organisms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3 text-purple-500" />
                      <span>Assemblies</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-blue-500" />
                      <span>Annotations</span>
                    </div>
                  </div>
                </th>
                <th className="w-10 px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="">
              {loadingRankRoots && rankRoots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    <p className="text-sm text-muted-foreground">Loading taxons...</p>
                  </td>
                </tr>
              ) : flattenedNodes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    {isSearchMode && hasNoSearchResults ? (
                      <div className="space-y-4">
                        <p className="text-muted-foreground">No taxons found matching your search.</p>
                        <Button
                          variant="outline"
                          onClick={() => openInsdcSearchModal(searchQuery)}
                          className="gap-2"
                        >
                          <Search className="h-4 w-4" />
                          Search INSDC Databases
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {isSearchingFromBar ? 'Searching...' : 'No taxons to display.'}
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                <>
                  {flattenedNodes.map((node) => {
                    const rankColor = getRankColor(node.data.rank)
                    const counts = extractCounts(node.data)
                    const geneCounts = extractGeneCounts(node.data)
                    const geneSum = geneCounts.coding + geneCounts.nonCoding + geneCounts.pseudogene
                    
                    // Check if node has children from the original API data
                    // The 'children' field can be an array of taxid strings or TaxonRecord objects
                    const childrenFromData = node.data.children
                    const hasChildrenInData = Array.isArray(childrenFromData) && childrenFromData.length > 0
                    const hasNoChildrenInData = Array.isArray(childrenFromData) && childrenFromData.length === 0
                    
                    // Check if children have been fetched
                    const hasFetchedChildren = childrenData.has(node.taxid) && childrenData.get(node.taxid)!.length > 0
                    const hasChildrenInTree = node.children && node.children.length > 0
                    const hasBeenChecked = childrenData.has(node.taxid) || fetchedNodes.has(node.taxid)
                    
                    // Node has no children if:
                    // 1. Original data explicitly shows empty children array, OR
                    // 2. Children have been fetched and result is empty
                    
                    // Node has children if:
                    // 1. Original data shows children exist, OR
                    // 2. Children have been fetched and exist, OR
                    // 3. Children exist in tree structure, OR
                    // 4. Not yet checked AND original data doesn't explicitly show no children (assume might have children)
                    const hasChildren = hasChildrenInData || hasFetchedChildren || hasChildrenInTree || (!hasBeenChecked && !hasNoChildrenInData)
                    const isExpanded = expandedNodes.has(node.taxid)
                    const isSelected = selectedNodes.has(node.taxid)
                    const isFetching = fetchingNodes.has(node.taxid)
                    const isHighlighted = selectedTaxid === node.taxid
                    const isMatched = isSearchMode && matchedTaxids.has(node.taxid)
                    const indent = node.level * 20

                    return (
                      <tr
                        key={node.taxid}
                        className={`border-b border-border transition-colors ${
                          hasChildren ? 'cursor-pointer' : ''
                        } ${
                          isHighlighted
                            ? 'bg-primary/20 hover:bg-primary/25 border-l-4 border-l-primary'
                            : isMatched
                            ? 'bg-yellow-500/10 hover:bg-yellow-500/15 border-l-4 border-l-yellow-500'
                            : isSelected
                            ? 'bg-primary/5 hover:bg-primary/10'
                            : hasChildren ? 'hover:bg-muted/30' : ''
                        }`}
                        onClick={() => {
                          if (hasChildren) {
                            handleExpand(node.taxid)
                          } else {
                            // Open sidebar for leaf nodes
                            const openRightSidebar = useUIStore.getState().openRightSidebar
                            openRightSidebar("taxon-details", { taxid: String(node.taxid) })
                          }
                        }}
                      >
                        {/* Select button */}
                        <td className="w-10 px-1 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 ${isSelected ? 'bg-primary/10' : ''}`}
                              onClick={() => handleSelect(node.taxid, node.data)}
                            >
                              {isSelected ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <div className="h-3 w-3 border border-border rounded" />
                              )}
                            </Button>
                          </div>
                        </td>

                        {/* Taxon name with expand icon */}
                        <td className="p-3">
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
                            {hasChildren ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 -ml-1"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleExpand(node.taxid)
                                }}
                                disabled={isFetching}
                              >
                                {isFetching ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </Button>
                            ) : null}
                            <span className="font-medium text-sm text-foreground">
                              {node.data.scientific_name || node.taxid}
                            </span>
                          </div>
                        </td>

                        {/* Rank */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                            style={{ borderColor: rankColor, color: rankColor }}
                          >
                            {node.data.rank || 'Unknown'}
                          </Badge>
                        </td>

                        {/* Gene counts stacked bar */}
                        <td className="p-3 w-48 text-right" onClick={(e) => e.stopPropagation()}>
                          {geneSum > 0 ? (
                            <div
                              className="flex h-6 w-full min-w-[120px] max-w-[200px] ml-auto rounded overflow-hidden border border-border/50"
                              title={`Coding: ${geneCounts.coding.toLocaleString()} · Non-coding: ${geneCounts.nonCoding.toLocaleString()} · Pseudogene: ${geneCounts.pseudogene.toLocaleString()}`}
                            >
                              {geneCounts.coding > 0 && (
                                <div
                                  className={`${GENE_STACK_COLORS.coding} flex-shrink-0 min-w-[2px] transition-all`}
                                  style={{ width: `${(geneCounts.coding / maxGeneSum) * 100}%` }}
                                />
                              )}
                              {geneCounts.nonCoding > 0 && (
                                <div
                                  className={`${GENE_STACK_COLORS.nonCoding} flex-shrink-0 min-w-[2px] transition-all`}
                                  style={{ width: `${(geneCounts.nonCoding / maxGeneSum) * 100}%` }}
                                />
                              )}
                              {geneCounts.pseudogene > 0 && (
                                <div
                                  className={`${GENE_STACK_COLORS.pseudogene} flex-shrink-0 min-w-[2px] transition-all`}
                                  style={{ width: `${(geneCounts.pseudogene / maxGeneSum) * 100}%` }}
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Combined Counts */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {counts.organisms > 0 && (
                              <div className="flex items-center gap-1" title={`Organisms: ${counts.organisms.toLocaleString()}`}>
                                <Dna className="h-3 w-3 text-green-500" />
                                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                                  {counts.organisms.toLocaleString()}
                                </span>
                              </div>
                            )}
                            {counts.assemblies > 0 && (
                              <div className="flex items-center gap-1" title={`Assemblies: ${counts.assemblies.toLocaleString()}`}>
                                <Database className="h-3 w-3 text-purple-500" />
                                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                                  {counts.assemblies.toLocaleString()}
                                </span>
                              </div>
                            )}
                            {counts.annotations > 0 && (
                              <div className="flex items-center gap-1" title={`Annotations: ${counts.annotations.toLocaleString()}`}>
                                <FileText className="h-3 w-3 text-blue-500" />
                                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                                  {counts.annotations.toLocaleString()}
                                </span>
                              </div>
                            )}
                            {counts.organisms === 0 && counts.assemblies === 0 && counts.annotations === 0 && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="w-10 px-1 py-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 mx-auto"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const openRightSidebar = useUIStore.getState().openRightSidebar
                              openRightSidebar("taxon-details", { taxid: String(node.taxid) })
                            }}
                            title="View taxon details"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Infinite scroll target for rank roots */}
                  {selectedRank && hasMoreRankRoots && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center">
                        <div ref={rankRootsObserverTargetRef}>
                          {loadingRankRoots ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-primary mx-auto mb-2" />
                              <span className="text-xs text-muted-foreground">Loading more taxons...</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Scroll for more</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

