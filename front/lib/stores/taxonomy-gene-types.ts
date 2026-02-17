import { create } from "zustand"

export type GeneType = "coding" | "non_coding" | "pseudogene"

const ALL_GENE_TYPES: GeneType[] = ["coding", "non_coding", "pseudogene"]

interface TaxonomyGeneTypesState {
  selectedGeneTypes: Set<GeneType>
  setSelectedGeneTypes: (set: Set<GeneType>) => void
  toggleGeneType: (type: GeneType) => void
  hasGeneType: (type: GeneType) => boolean
}

function createInitialSet() {
  return new Set<GeneType>(ALL_GENE_TYPES)
}

export const useTaxonomyGeneTypesStore = create<TaxonomyGeneTypesState>()((set, get) => ({
  selectedGeneTypes: createInitialSet(),

  setSelectedGeneTypes: (nextSet) => {
    if (nextSet.size < 1) return
    set({ selectedGeneTypes: new Set(nextSet) })
  },

  toggleGeneType: (type) => {
    const { selectedGeneTypes } = get()
    const next = new Set(selectedGeneTypes)
    if (next.has(type)) {
      if (next.size <= 1) return
      next.delete(type)
    } else {
      next.add(type)
    }
    set({ selectedGeneTypes: next })
  },

  hasGeneType: (type) => get().selectedGeneTypes.has(type),
}))
