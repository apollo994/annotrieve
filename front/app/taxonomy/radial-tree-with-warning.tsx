"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TaxonomyConstantBranchTree } from "@/components/taxonomy-constant-branch-tree"
import type { FlatTreeNode } from "@/lib/api/taxons"

const LARGE_TAXON_THRESHOLD = 4000

interface RadialTreeWithWarningProps {
  rootTaxid: string | null
  organismsCount: number
  viewKey: string
  acknowledgedKeys: Set<string>
  onAcknowledge: (key: string) => void
  onTaxonSelect: (taxid: string, node: FlatTreeNode) => void
  scopeHint?: string
}

export function RadialTreeWithWarning({
  rootTaxid,
  organismsCount,
  viewKey,
  acknowledgedKeys,
  onAcknowledge,
  onTaxonSelect,
  scopeHint,
}: RadialTreeWithWarningProps) {
  const isRootTree = rootTaxid === null
  const showWarning =
    organismsCount > LARGE_TAXON_THRESHOLD && !acknowledgedKeys.has(viewKey) && !isRootTree

  if (showWarning) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="max-w-md w-full rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Large taxonomy — performance warning</h3>
              {scopeHint && (
                <p className="text-xs text-muted-foreground">
                  Viewing subtree under <span className="font-medium text-foreground">{scopeHint}</span>.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                This taxon has{" "}
                <span className="font-semibold text-foreground">{organismsCount.toLocaleString()} organisms</span>{" "}
                (leaves). Rendering the radial tree may freeze or crash the browser.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/50 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800"
                onClick={() => onAcknowledge(viewKey)}
              >
                Show tree anyway
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TaxonomyConstantBranchTree
      rootTaxid={rootTaxid}
      onTaxonSelect={onTaxonSelect}
      description={
        scopeHint
          ? `Radial tree under ${scopeHint}. Constant-length branches; bars show gene counts per taxon. Click to explore.`
          : undefined
      }
    />
  )
}
