import type { TaxonRecord } from '@/lib/api/types'

// Constants - same as taxonomy-tree-2d.tsx
export const RANK_COLORS: Record<string, string> = {
  kingdom: '#3b82f6',
  phylum: '#8b5cf6',
  class: '#ec4899',
  order: '#f59e0b',
  family: '#10b981',
  genus: '#06b6d4',
  species: '#14b8a6',
  default: '#64748b',
}

// Utilities
export function getRankColor(rank?: string): string {
  if (!rank) return RANK_COLORS.default
  return RANK_COLORS[rank.toLowerCase()] || RANK_COLORS.default
}

export function normalizeCount(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseInt(value, 10) || 0
  return 0
}

export function extractCounts(data: TaxonRecord) {
  return {
    organisms: normalizeCount(data.organisms_count),
    assemblies: normalizeCount(data.assemblies_count),
    annotations: normalizeCount(data.annotations_count),
  }
}

/** Gene counts from stats.genes or top-level fallbacks (coding, non_coding, pseudogene) */
export function extractGeneCounts(data: TaxonRecord) {
  const stats = data.stats as { genes?: { coding?: { count?: { mean?: number } }; non_coding?: { count?: { mean?: number } }; pseudogene?: { count?: { mean?: number } } } } | undefined
  const coding = normalizeCount(
    (data as { coding_count?: number }).coding_count ??
    stats?.genes?.coding?.count?.mean
  )
  const nonCoding = normalizeCount(
    (data as { non_coding_count?: number }).non_coding_count ??
    stats?.genes?.non_coding?.count?.mean
  )
  const pseudogene = normalizeCount(
    (data as { pseudogene_count?: number }).pseudogene_count ??
    stats?.genes?.pseudogene?.count?.mean
  )
  return { coding, nonCoding, pseudogene }
}

export const GENE_STACK_COLORS = {
  coding: 'bg-emerald-500',
  nonCoding: 'bg-amber-500',
  pseudogene: 'bg-indigo-500',
} as const