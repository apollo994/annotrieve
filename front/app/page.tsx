"use client"

import { Hero } from "@/components/hero"
import { LatestReleases } from "@/components/latest-releases"
import { TopAnnotations } from "@/components/top-annotated-records"
import { DatabaseFrequencies } from "@/components/database-frequencies"
import { ReleaseDateChart } from "@/components/release-date-chart"
import { FeaturesSection } from "@/components/features-section"
import { TreeOfLifeD3 } from "@/components/tree-of-life-d3"
import { UserAnalyticsMap } from "@/components/user-analytics-map"
import { SectionWrapper } from "@/components/ui/section-wrapper"


export default function Home() {
  const handleFilterSelect = () => {
    // This now does nothing as SearchBar handles navigation directly
  }

  return (
    <>
      <Hero />

      <SectionWrapper id="features" backgroundVariant="muted">
        <FeaturesSection
          title="Features overview"
          description={
            <>
              Explore annotations with our comprehensive suite of tools. From browsing genomes to comparing statistics, Annotrieve provides everything you need for eukaryotic annotation analysis.
            </>
          }
        />
      </SectionWrapper>
      <SectionWrapper id="database-frequencies" backgroundVariant="default">
        <DatabaseFrequencies
          title="A central hub for annotations"
          description={
            <>
              Annotrieve aggregates annotations weekly from{" "}
              <span className="font-medium">Ensembl</span>,{" "}
              <span className="font-medium">NCBI RefSeq</span>, and{" "}
              <span className="font-medium">NCBI GenBank</span>. Explore the current distribution and download the raw TSVs.
            </>
          }
        />
      </SectionWrapper>
      <SectionWrapper id="release-timeline" backgroundVariant="muted">
        <ReleaseDateChart
          title="Annotation release timeline"
          description={
            <>
              Explore how annotation releases have evolved over time across{" "}
              <span className="font-medium">Ensembl</span>,{" "}
              <span className="font-medium">NCBI RefSeq</span>, and{" "}
              <span className="font-medium">NCBI GenBank</span>. The chart shows yearly annotation counts grouped by database source.
            </>
          }
        />
      </SectionWrapper>
      
      <SectionWrapper id="tree-of-life" backgroundVariant="default">
        <TreeOfLifeD3
          title="Interactive taxonomy tree"
          description={
            <>
              Explore the complete hierarchical tree of life of the annotated organisms with an interactive circle packing visualization. 
              Nested circles represent taxonomic relationships, with <strong> each circle size </strong> reflecting the number of annotations. 
              <strong> Zoom with scroll</strong>, <strong>pan by dragging</strong>, 
              and <strong>click nodes</strong> to explore their annotations in detail.
            </>
          }
        />
      </SectionWrapper>

      <SectionWrapper id="latest-releases" backgroundVariant="muted">
        <LatestReleases
          title="Explore recent releases"
          description="Browse newly released assemblies and jump straight into their annotations."
        />
      </SectionWrapper>

      <SectionWrapper id="top-annotations" backgroundVariant="default">
        <TopAnnotations
          onFilterSelect={handleFilterSelect}
          title="Top annotated records"
          description="See organisms, classes, and assemblies with the most annotations and start exploring from there."
        />
      </SectionWrapper>
{/* 
      <SectionWrapper id="user-analytics" backgroundVariant="muted">
        <UserAnalyticsMap
          title="Global User Analytics"
          description={
            <>
              Interactive map showing the geographic distribution of unique users accessing Annotrieve. 
              Each user is identified by a unique fingerprint. <strong>Hover over countries</strong> to see 
              detailed statistics, and <strong>zoom and pan</strong> to explore the map.
            </>
          }
        />
      </SectionWrapper> */}

    </>
  )
}
