import { apiGet } from './base'

export interface CountryFrequencies {
  [country: string]: number
}

export function getCountryFrequencies() {
  return apiGet<CountryFrequencies>('/analytics/frequencies/country')
}
