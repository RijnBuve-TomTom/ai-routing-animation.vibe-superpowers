import pako from 'pako'
import { xml2js } from 'xml-js'
import { RoadSegment, Coordinate, RoutingMode } from '../types/types'

export async function parseOsmData(arrayBuffer: ArrayBuffer, routingMode: RoutingMode): Promise<RoadSegment[]> {
  try {
    // Decompress the gzipped data
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer))
    
    // Convert to string
    const xmlString = new TextDecoder().decode(decompressed)
    
    // Parse XML to JSON
    const result = xml2js(xmlString, { compact: true })
    
    // Extract OSM data
    const resultObj = result as any
    const osmData = resultObj.osm
    if (!osmData) {
      throw new Error('Invalid OSM data structure')
    }
    
    // Parse nodes and ways
    const nodes: Record<string, Coordinate> = {}
    const ways: any[] = []
    
    // Extract nodes
    if (osmData.node) {
      const nodeArray = Array.isArray(osmData.node) ? osmData.node : [osmData.node]
      nodeArray.forEach((node: any) => {
        nodes[node._attributes.id] = {
          lat: parseFloat(node._attributes.lat),
          lng: parseFloat(node._attributes.lon)
        }
      })
    }
    
    // Extract ways (roads)
    if (osmData.way) {
      const wayArray = Array.isArray(osmData.way) ? osmData.way : [osmData.way]
      ways.push(...wayArray)
    }
    
    // Filter and process road segments based on routing mode
    const roadSegments: RoadSegment[] = []
    
    ways.forEach((way: any) => {
      const tags = way.tag ? parseTags(way.tag) : {}
      
      // Check if this way is a road and accessible by the current routing mode
      if (isRoadWay(tags, routingMode)) {
        const nodeRefs = way.nd ? (Array.isArray(way.nd) ? way.nd : [way.nd]) : []
        
        // Create road segment
        const segmentNodes: Coordinate[] = []
        nodeRefs.forEach((nd: any) => {
          const nodeId = nd._attributes.ref
          if (nodes[nodeId]) {
            segmentNodes.push(nodes[nodeId])
          }
        })
        
        if (segmentNodes.length >= 2) {
          roadSegments.push({
            id: way._attributes.id,
            nodes: segmentNodes,
            tags: tags,
            speed: getSpeedForRoadType(tags, routingMode),
            oneWay: isOneWay(tags),
            accessibleBy: getAccessibleBy(tags)
          })
        }
      }
    })
    
    return roadSegments
    
  } catch (error) {
    console.error('Error parsing OSM data:', error)
    return []
  }
}

function parseTags(tagData: any | any[]): Record<string, string> {
  const tags: Record<string, string> = {}
  
  if (!tagData) return tags
  
  const tagArray = Array.isArray(tagData) ? tagData : [tagData]
  
  tagArray.forEach((tag: any) => {
    if (tag._attributes) {
      tags[tag._attributes.k] = tag._attributes.v
    }
  })
  
  return tags
}

function isRoadWay(tags: Record<string, string>, routingMode: RoutingMode): boolean {
  const highway = tags.highway
  
  if (!highway) return false
  
  // Check if this highway type is accessible by the routing mode
  switch (routingMode) {
    case 'car':
      return isCarAccessible(highway, tags)
    case 'bicycle':
      return isBicycleAccessible(highway, tags)
    case 'pedestrian':
      return isPedestrianAccessible(highway, tags)
    default:
      return false
  }
}

function isCarAccessible(highway: string, tags: Record<string, string>): boolean {
  // Cars can use most roads except footways, cycleways, paths, etc.
  const carAccessibleTypes = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'motorway_link',
    'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
  ]
  
  // Explicit access tags override
  if (tags.access === 'no' || tags.motor_vehicle === 'no' || tags.motorcar === 'no') {
    return false
  }
  
  return carAccessibleTypes.includes(highway)
}

function isBicycleAccessible(highway: string, tags: Record<string, string>): boolean {
  // Bicycles can use most roads plus cycleways
  const bikeAccessibleTypes = [
    'cycleway', 'path', 'footway', 'pedestrian', 'track',
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'living_street'
  ]
  
  // Explicit access tags override
  if (tags.bicycle === 'no' || tags.access === 'no') {
    return false
  }
  
  return bikeAccessibleTypes.includes(highway)
}

function isPedestrianAccessible(highway: string, tags: Record<string, string>): boolean {
  // Pedestrians can use most roads plus footways
  const pedestrianAccessibleTypes = [
    'footway', 'pedestrian', 'path', 'track', 'steps',
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'living_street'
  ]
  
  // Explicit access tags override
  if (tags.foot === 'no' || tags.access === 'no') {
    return false
  }
  
  return pedestrianAccessibleTypes.includes(highway)
}

function getSpeedForRoadType(tags: Record<string, string>, routingMode: RoutingMode): number {
  const highway = tags.highway
  
  switch (routingMode) {
    case 'car':
      return getCarSpeed(highway, tags)
    case 'bicycle':
      return 20 // Always 20 km/h for bicycles
    case 'pedestrian':
      return 5 // Always 5 km/h for pedestrians
    default:
      return 50
  }
}

function getCarSpeed(highway: string, tags: Record<string, string>): number {
  // Default speeds for different road types (in km/h)
  const speedMap: Record<string, number> = {
    'motorway': 120,
    'trunk': 100,
    'primary': 80,
    'secondary': 60,
    'tertiary': 50,
    'unclassified': 40,
    'residential': 30,
    'service': 20,
    'motorway_link': 80,
    'trunk_link': 70,
    'primary_link': 60,
    'secondary_link': 50,
    'tertiary_link': 40,
    'living_street': 15
  }
  
  // Check for explicit maxspeed tag
  if (tags.maxspeed) {
    const maxspeed = parseInt(tags.maxspeed)
    if (!isNaN(maxspeed)) {
      return maxspeed
    }
    // Handle speed limits like "50 mph" or "none"
    if (tags.maxspeed.includes('mph')) {
      const speedMph = parseInt(tags.maxspeed)
      return !isNaN(speedMph) ? Math.round(speedMph * 1.60934) : speedMap[highway] || 50
    }
  }
  
  return speedMap[highway] || 50
}

function isOneWay(tags: Record<string, string>): boolean {
  return tags.oneway === 'yes' || tags.oneway === 'true' || tags.oneway === '1'
}

function getAccessibleBy(tags: Record<string, string>): 'car' | 'bicycle' | 'pedestrian' | 'all' {
  const highway = tags.highway
  
  // Determine accessibility based on highway type and access tags
  let accessibleBy: 'car' | 'bicycle' | 'pedestrian' | 'all' = 'all'
  
  if (highway === 'motorway' || highway === 'motorway_link') {
    accessibleBy = 'car'
  } else if (highway === 'cycleway') {
    accessibleBy = 'bicycle'
  } else if (highway === 'footway' || highway === 'pedestrian') {
    accessibleBy = 'pedestrian'
  }
  
  // Check access restrictions
  if (tags.access === 'no') {
    return 'pedestrian' // Even if access=no, pedestrians might still be allowed
  }
  
  if (tags.motor_vehicle === 'no' || tags.motorcar === 'no') {
    accessibleBy = accessibleBy === 'car' ? 'bicycle' : accessibleBy
  }
  
  if (tags.bicycle === 'no') {
    if (accessibleBy === 'bicycle') return 'pedestrian'
    if (accessibleBy === 'all') accessibleBy = 'car'
  }
  
  if (tags.foot === 'no') {
    if (accessibleBy === 'pedestrian') return 'car'
    if (accessibleBy === 'all') accessibleBy = 'car'
  }
  
  return accessibleBy
}