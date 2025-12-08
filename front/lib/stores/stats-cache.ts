import { create } from 'zustand'
import type { GeneStatsSummary, TranscriptStatsSummary, GeneCategoryMetricValues, TranscriptTypeMetricValues, TranscriptTypeDetails } from '@/lib/api/annotations'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface StatsCacheStore {
  // Gene stats cache: subsetId -> GeneStatsSummary
  geneStatsCache: Map<string, CacheEntry<GeneStatsSummary>>
  
  // Transcript stats cache: subsetId -> TranscriptStatsSummary
  transcriptStatsCache: Map<string, CacheEntry<TranscriptStatsSummary>>
  
  // Gene metric values cache: `${subsetId}-${category}-${metric}` -> GeneCategoryMetricValues
  geneMetricCache: Map<string, CacheEntry<GeneCategoryMetricValues>>
  
  // Transcript type details cache: `${subsetId}-${type}` -> TranscriptTypeDetails
  transcriptTypeDetailsCache: Map<string, CacheEntry<TranscriptTypeDetails>>
  
  // Transcript metric values cache: `${subsetId}-${type}-${metric}` -> TranscriptTypeMetricValues
  transcriptMetricCache: Map<string, CacheEntry<TranscriptTypeMetricValues>>
  
  // Cache TTL in milliseconds (default: 5 minutes)
  cacheTTL: number
  
  // Actions
  getGeneStats: (subsetId: string) => GeneStatsSummary | null
  setGeneStats: (subsetId: string, data: GeneStatsSummary) => void
  getTranscriptStats: (subsetId: string) => TranscriptStatsSummary | null
  setTranscriptStats: (subsetId: string, data: TranscriptStatsSummary) => void
  getGeneMetric: (subsetId: string, category: string, metric: string) => GeneCategoryMetricValues | null
  setGeneMetric: (subsetId: string, category: string, metric: string, data: GeneCategoryMetricValues) => void
  getTranscriptTypeDetails: (subsetId: string, type: string) => TranscriptTypeDetails | null
  setTranscriptTypeDetails: (subsetId: string, type: string, data: TranscriptTypeDetails) => void
  getTranscriptMetric: (subsetId: string, type: string, metric: string) => TranscriptTypeMetricValues | null
  setTranscriptMetric: (subsetId: string, type: string, metric: string, data: TranscriptTypeMetricValues) => void
  clearCache: () => void
  clearSubsetCache: (subsetId: string) => void
}

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

export const useStatsCacheStore = create<StatsCacheStore>((set, get) => ({
  geneStatsCache: new Map(),
  transcriptStatsCache: new Map(),
  geneMetricCache: new Map(),
  transcriptTypeDetailsCache: new Map(),
  transcriptMetricCache: new Map(),
  cacheTTL: DEFAULT_TTL,

  getGeneStats: (subsetId) => {
    const entry = get().geneStatsCache.get(subsetId)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > get().cacheTTL) {
      get().geneStatsCache.delete(subsetId)
      return null
    }
    
    return entry.data
  },

  setGeneStats: (subsetId, data) => {
    set((state) => {
      const newCache = new Map(state.geneStatsCache)
      newCache.set(subsetId, {
        data,
        timestamp: Date.now()
      })
      return { geneStatsCache: newCache }
    })
  },

  getTranscriptStats: (subsetId) => {
    const entry = get().transcriptStatsCache.get(subsetId)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > get().cacheTTL) {
      get().transcriptStatsCache.delete(subsetId)
      return null
    }
    
    return entry.data
  },

  setTranscriptStats: (subsetId, data) => {
    set((state) => {
      const newCache = new Map(state.transcriptStatsCache)
      newCache.set(subsetId, {
        data,
        timestamp: Date.now()
      })
      return { transcriptStatsCache: newCache }
    })
  },

  getGeneMetric: (subsetId, category, metric) => {
    const key = `${subsetId}-${category}-${metric}`
    const entry = get().geneMetricCache.get(key)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > get().cacheTTL) {
      get().geneMetricCache.delete(key)
      return null
    }
    
    return entry.data
  },

  setGeneMetric: (subsetId, category, metric, data) => {
    const key = `${subsetId}-${category}-${metric}`
    set((state) => {
      const newCache = new Map(state.geneMetricCache)
      newCache.set(key, {
        data,
        timestamp: Date.now()
      })
      return { geneMetricCache: newCache }
    })
  },

  getTranscriptTypeDetails: (subsetId, type) => {
    const key = `${subsetId}-${type}`
    const entry = get().transcriptTypeDetailsCache.get(key)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > get().cacheTTL) {
      get().transcriptTypeDetailsCache.delete(key)
      return null
    }
    
    return entry.data
  },

  setTranscriptTypeDetails: (subsetId, type, data) => {
    const key = `${subsetId}-${type}`
    set((state) => {
      const newCache = new Map(state.transcriptTypeDetailsCache)
      newCache.set(key, {
        data,
        timestamp: Date.now()
      })
      return { transcriptTypeDetailsCache: newCache }
    })
  },

  getTranscriptMetric: (subsetId, type, metric) => {
    const key = `${subsetId}-${type}-${metric}`
    const entry = get().transcriptMetricCache.get(key)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > get().cacheTTL) {
      get().transcriptMetricCache.delete(key)
      return null
    }
    
    return entry.data
  },

  setTranscriptMetric: (subsetId, type, metric, data) => {
    const key = `${subsetId}-${type}-${metric}`
    set((state) => {
      const newCache = new Map(state.transcriptMetricCache)
      newCache.set(key, {
        data,
        timestamp: Date.now()
      })
      return { transcriptMetricCache: newCache }
    })
  },

  clearCache: () => {
    set({
      geneStatsCache: new Map(),
      transcriptStatsCache: new Map(),
      geneMetricCache: new Map(),
      transcriptTypeDetailsCache: new Map(),
      transcriptMetricCache: new Map()
    })
  },

  clearSubsetCache: (subsetId) => {
    set((state) => {
      const newGeneCache = new Map(state.geneStatsCache)
      newGeneCache.delete(subsetId)
      
      const newTranscriptCache = new Map(state.transcriptStatsCache)
      newTranscriptCache.delete(subsetId)
      
      // Clear all metric caches for this subset
      const newGeneMetricCache = new Map(state.geneMetricCache)
      const newTranscriptTypeDetailsCache = new Map(state.transcriptTypeDetailsCache)
      const newTranscriptMetricCache = new Map(state.transcriptMetricCache)
      
      for (const key of newGeneMetricCache.keys()) {
        if (key.startsWith(`${subsetId}-`)) {
          newGeneMetricCache.delete(key)
        }
      }
      
      for (const key of newTranscriptTypeDetailsCache.keys()) {
        if (key.startsWith(`${subsetId}-`)) {
          newTranscriptTypeDetailsCache.delete(key)
        }
      }
      
      for (const key of newTranscriptMetricCache.keys()) {
        if (key.startsWith(`${subsetId}-`)) {
          newTranscriptMetricCache.delete(key)
        }
      }
      
      return {
        geneStatsCache: newGeneCache,
        transcriptStatsCache: newTranscriptCache,
        geneMetricCache: newGeneMetricCache,
        transcriptTypeDetailsCache: newTranscriptTypeDetailsCache,
        transcriptMetricCache: newTranscriptMetricCache
      }
    })
  }
}))

