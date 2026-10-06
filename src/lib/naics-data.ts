/**
 * NAICS Data Loader
 * This module loads and processes the NAICS JSON data
 */

import rawData from '@/data/government/codes/codes.json'
import type { NAICSData, NAICSCode } from '@/types/naics'

// Load NAICS data efficiently
let naicsData: NAICSData

// Simple direct import - let Next.js handle the optimization
try {
  naicsData = rawData as NAICSData
  
  // Validate the data loaded correctly
  if (naicsData && naicsData['2022'] && Array.isArray(naicsData['2022'])) {
    console.log('[NAICS Data Import] ✅ Successfully loaded JSON data')
    console.log('[NAICS Data Import] ✅ 2022 sectors loaded:', naicsData['2022'].length)
  } else {
    console.error('[NAICS Data Import] ❌ Invalid data structure loaded')
    naicsData = { '2022': [] } as NAICSData
  }
} catch (error) {
  console.error('[NAICS Data Import] ❌ Failed to load JSON data:', error)
  naicsData = { '2022': [] } as NAICSData
}

/**
 * Flattens the NAICS data into a searchable array
 */
function flattenNAICSData(year: keyof NAICSData = '2022'): NAICSCode[] {
  const yearData = naicsData[year]
  const flattened: NAICSCode[] = []

  if (!yearData || !Array.isArray(yearData) || yearData.length === 0) {
    console.warn(`No NAICS data found for year: ${year}`)
    return flattened
  }

  yearData.forEach((sector) => {
    // Add sector level
    flattened.push({
      code: sector.sector.toString(),
      title: sector.definition.replace(/T$/, ''),
      description: sector.description,
      level: 'sector',
      sectorNumber: sector.sector,
      hierarchy: {
        sector: sector.definition.replace(/T$/, '')
      }
    })

    if (sector.subsectors && Array.isArray(sector.subsectors)) {
      sector.subsectors.forEach((subsector) => {
        // Add subsector level
        flattened.push({
          code: subsector.code,
          title: subsector.definition.replace(/T$/, ''),
          description: subsector.description,
          level: 'subsector',
          parentCode: sector.sector.toString(),
          sectorNumber: sector.sector,
          hierarchy: {
            sector: sector.definition.replace(/T$/, ''),
            subsector: subsector.definition.replace(/T$/, '')
          }
        })

        if (subsector.industryGroups && Array.isArray(subsector.industryGroups)) {
          subsector.industryGroups.forEach((industryGroup) => {
            // Add industry group level
            flattened.push({
              code: industryGroup.code,
              title: industryGroup.definition.replace(/T$/, ''),
              description: industryGroup.description || '',
              level: 'industryGroup',
              parentCode: subsector.code,
              sectorNumber: sector.sector,
              hierarchy: {
                sector: sector.definition.replace(/T$/, ''),
                subsector: subsector.definition.replace(/T$/, ''),
                industryGroup: industryGroup.definition.replace(/T$/, '')
              }
            })

            if (industryGroup.industries && Array.isArray(industryGroup.industries)) {
              industryGroup.industries.forEach((industry) => {
                // Add industry level
                flattened.push({
                  code: industry.code,
                  title: industry.definition.replace(/T$/, ''),
                  description: industry.description || '',
                  level: 'industry',
                  parentCode: industryGroup.code,
                  sectorNumber: sector.sector,
                  hierarchy: {
                    sector: sector.definition.replace(/T$/, ''),
                    subsector: subsector.definition.replace(/T$/, ''),
                    industryGroup: industryGroup.definition.replace(/T$/, ''),
                    industry: industry.definition.replace(/T$/, '')
                  }
                })

                if (industry.nationalIndustries && Array.isArray(industry.nationalIndustries)) {
                  industry.nationalIndustries.forEach((nationalIndustry) => {
                    // Add national industry level (most specific)
                    flattened.push({
                      code: nationalIndustry.code,
                      title: nationalIndustry.definition,
                      description: nationalIndustry.description,
                      level: 'nationalIndustry',
                      parentCode: industry.code,
                      sectorNumber: sector.sector,
                      hierarchy: {
                        sector: sector.definition.replace(/T$/, ''),
                        subsector: subsector.definition.replace(/T$/, ''),
                        industryGroup: industryGroup.definition.replace(/T$/, ''),
                        industry: industry.definition.replace(/T$/, '')
                      }
                    })
                  })
                }
              })
            }
          })
        }
      })
    }
  })

  return flattened
}

// Pre-process and cache the data
const processedData = flattenNAICSData('2022')

// Log data loading status
if (typeof window !== 'undefined') {
  console.log(`[NAICS Data Loader] Loaded ${processedData.length} NAICS codes from JSON`)
  if (processedData.length > 0) {
    console.log('[NAICS Data Loader] Sample codes:', processedData.slice(0, 3).map(c => `${c.code} - ${c.title}`))
  } else {
    console.error('[NAICS Data Loader] No data was loaded! Check JSON import.')
  }
}

// Export the processed data
export const naicsCodesData = processedData
export const naicsRawData = naicsData