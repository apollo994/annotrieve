"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getTaxon } from "@/lib/api/taxons"
import type { TaxonRecord } from "@/lib/api/types"

const EUKARYOTA_TAXID = "2759"

export type TaxonomyPayload = { taxid: string; taxon: TaxonRecord }

interface UseTaxonomyUrlSyncOptions {
  rootTaxon: TaxonomyPayload | null
  setRootTaxon: (payload: TaxonomyPayload | null) => void
  setSelectedTaxon: (payload: TaxonomyPayload | null) => void
  setActiveView: (view: "overview" | "tree" | "constant-branch" | "gene-stack") => void
}

/**
 * Handles URL <-> state sync for taxonomy explorer:
 * - On mount with ?taxon=X: loads that taxon, sets as root, opens panel
 * - When root changes: updates URL so reload preserves view
 */
export function useTaxonomyUrlSync({
  rootTaxon,
  setRootTaxon,
  setSelectedTaxon,
  setActiveView,
}: UseTaxonomyUrlSyncOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasHydratedRef = useRef(false)

  useEffect(() => {
    const taxidFromUrl = searchParams?.get("taxon")
    if (!taxidFromUrl) {
      hasHydratedRef.current = true
      return
    }
    if (rootTaxon?.taxid === taxidFromUrl) {
      hasHydratedRef.current = true
      return
    }

    let cancelled = false
    getTaxon(taxidFromUrl)
      .then((taxonData) => {
        if (cancelled) return
        if (taxidFromUrl === EUKARYOTA_TAXID) {
          setRootTaxon(null)
          setSelectedTaxon(null)
          router.replace("/taxonomy", { scroll: false })
        } else {
          const payload: TaxonomyPayload = {
            taxid: taxonData.taxid,
            taxon: {
              taxid: taxonData.taxid,
              scientific_name: taxonData.scientific_name,
              rank: taxonData.rank,
              organisms_count: taxonData.organisms_count,
              assemblies_count: taxonData.assemblies_count,
              annotations_count: taxonData.annotations_count,
            },
          }
          setRootTaxon(payload)
          setSelectedTaxon(payload)
        }
        setActiveView("overview")
      })
      .catch(() => {
        if (!cancelled) router.replace("/taxonomy", { scroll: false })
      })
      .finally(() => {
        if (!cancelled) hasHydratedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [searchParams, router, rootTaxon?.taxid, setRootTaxon, setSelectedTaxon, setActiveView])

  useEffect(() => {
    if (!hasHydratedRef.current) return
    const urlTaxid = searchParams?.get("taxon")
    const desiredUrl = rootTaxon ? `/taxonomy?taxon=${rootTaxon.taxid}` : "/taxonomy"
    const currentMatches = rootTaxon ? urlTaxid === rootTaxon.taxid : !urlTaxid
    if (currentMatches) return
    router.replace(desiredUrl, { scroll: false })
  }, [rootTaxon?.taxid, searchParams, router])
}
