import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';

interface CountryData {
  country: string;
  clicks: number;
  percentage: number;
}

interface GeoMapProps {
  data: CountryData[];
}

export default function GeoMap({ data }: GeoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!mapRef.current || !data.length) return;
    
    const width = mapRef.current.clientWidth;
    const height = 400;
    
    // Clear previous SVG
    d3.select(mapRef.current).select('svg').remove();
    
    // Create SVG
    const svg = d3.select(mapRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    // Create a group for the map
    const g = svg.append('g');
    
    // Create projection
    const projection = d3.geoMercator()
      .scale(width / 2 / Math.PI)
      .center([0, 20])
      .translate([width / 2, height / 2]);
    
    // Create path generator
    const path = d3.geoPath().projection(projection);
    
    // Create color scale
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, d3.max(data, d => d.clicks) || 1]);
    
    // Load world map data
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((worldData: any) => {
        // Convert TopoJSON to GeoJSON
        const countries = feature(worldData, worldData.objects.countries);
        
        // Create a map of country names to ISO codes
        const countryMap = new Map();
        worldData.objects.countries.geometries.forEach((d: any) => {
          countryMap.set(d.properties.name, d.id);
        });
        
        // Draw countries
        g.selectAll('path')
          .data(countries.features)
          .enter()
          .append('path')
          .attr('d', path)
          .attr('fill', (d: any) => {
            const countryData = data.find(item => 
              item.country.toLowerCase() === d.properties.name.toLowerCase()
            );
            return countryData ? colorScale(countryData.clicks) : '#eee';
          })
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5)
          .append('title')
          .text((d: any) => {
            const countryData = data.find(item => 
              item.country.toLowerCase() === d.properties.name.toLowerCase()
            );
            return countryData 
              ? `${d.properties.name}: ${countryData.clicks} clicks (${countryData.percentage.toFixed(1)}%)`
              : `${d.properties.name}: No data`;
          });
        
        // Add zoom functionality
        const zoom = d3.zoom()
          .scaleExtent([1, 8])
          .on('zoom', (event) => {
            g.attr('transform', event.transform);
          });
        
        svg.call(zoom as any);
      })
      .catch(error => {
        console.error('Error loading world map data:', error);
      });
    
  }, [data, mapRef.current?.clientWidth]);
  
  if (!data.length) {
    return (
      <div className="flex justify-center items-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No geographic data available</p>
      </div>
    );
  }
  
  return (
    <div ref={mapRef} className="h-96 w-full"></div>
  );
}