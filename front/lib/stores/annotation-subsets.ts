import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FiltersState } from './annotations-filters'
import { getFiltersHash } from '@/lib/utils'

export interface AnnotationSubset {
  id: string
  name: string
  filters: FiltersState
  color?: string
  createdAt: string
  updatedAt: string
  filtersHash?: string // Cached hash for efficient comparison
}

interface AnnotationSubsetsStore {
  subsets: AnnotationSubset[]
  lastLoadedSubsetId: string | null
  
  // Actions
  addSubset: (name: string, filters: FiltersState, color?: string) => string
  updateSubset: (id: string, updates: Partial<Pick<AnnotationSubset, 'name' | 'filters' | 'color'>>) => void
  deleteSubset: (id: string) => void
  getSubset: (id: string) => AnnotationSubset | undefined
  clearAllSubsets: () => void
  setLastLoadedSubsetId: (id: string | null) => void
  
  // Helpers
  getSubsetCount: () => number
  hasSubsets: () => boolean
  findSubsetByFiltersHash: (hash: string) => AnnotationSubset | undefined
}

const generateId = () => {
  return `subset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

const generateColor = (index: number): string => {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ]
  return colors[index % colors.length]
}

export const useAnnotationSubsetsStore = create<AnnotationSubsetsStore>()(
  persist(
    (set, get) => ({
      subsets: [],
      lastLoadedSubsetId: null,

      addSubset: (name, filters, color) => {
        const id = generateId()
        const now = new Date().toISOString()
        const subset: AnnotationSubset = {
          id,
          name,
          filters: { ...filters }, // Deep copy to avoid reference issues
          color: color || generateColor(get().subsets.length),
          createdAt: now,
          updatedAt: now,
          filtersHash: getFiltersHash(filters), // Cache hash for efficient comparison
        }
        
        set((state) => ({
          subsets: [...state.subsets, subset],
        }))
        
        return id
      },

      updateSubset: (id, updates) => {
        set((state) => ({
          subsets: state.subsets.map((subset) =>
            subset.id === id
              ? {
                  ...subset,
                  ...updates,
                  filters: updates.filters ? { ...updates.filters } : subset.filters,
                  filtersHash: updates.filters ? getFiltersHash(updates.filters) : subset.filtersHash,
                  updatedAt: new Date().toISOString(),
                }
              : subset
          ),
        }))
      },

      deleteSubset: (id) => {
        set((state) => ({
          subsets: state.subsets.filter((subset) => subset.id !== id),
        }))
      },

      getSubset: (id) => {
        return get().subsets.find((subset) => subset.id === id)
      },

      clearAllSubsets: () => {
        set({ subsets: [], lastLoadedSubsetId: null })
      },

      setLastLoadedSubsetId: (id) => {
        set({ lastLoadedSubsetId: id })
      },

      getSubsetCount: () => {
        return get().subsets.length
      },

      hasSubsets: () => {
        return get().subsets.length > 0
      },

      findSubsetByFiltersHash: (hash) => {
        // For subsets without a cached hash, compute it on the fly
        // This handles legacy subsets that were created before hash was added
        return get().subsets.find(subset => {
          const subsetHash = subset.filtersHash || getFiltersHash(subset.filters)
          return subsetHash === hash
        })
      },
    }),
    {
      name: 'annotation-subsets-storage',
      version: 1,
      partialize: (state) => ({
        subsets: state.subsets,
        // Don't persist lastLoadedSubsetId
      }),
    }
  )
)

