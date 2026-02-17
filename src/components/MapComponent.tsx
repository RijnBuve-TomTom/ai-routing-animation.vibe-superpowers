import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { parseOsmData } from '../utils/osmParser'
import { RoutingEngine } from '../utils/routingEngine'
import { AnimationSystem } from '../utils/animationSystem'
import { RoadSegment, Coordinate } from '../types/types'

interface MapComponentProps {
  selectedMap: string | null
  routingMode: 'car' | 'bicycle' | 'pedestrian'
  animationSpeed: number
  showOsmTiles: boolean
}

const MapComponent: React.FC<MapComponentProps> = ({
  selectedMap,
  routingMode,
  animationSpeed,
  showOsmTiles
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [origin, setOrigin] = useState<Coordinate | null>(null)
  const [destination, setDestination] = useState<Coordinate | null>(null)
  const [animationSystem, setAnimationSystem] = useState<AnimationSystem | null>(null)
  const [isRouting, setIsRouting] = useState<boolean>(false)
  
  useEffect(() => {
    // Initialize Leaflet map
    if (mapRef.current && !leafletMapRef.current) {
      const map = L.map(mapRef.current, {
        center: [52.3702, 4.8952], // Default to Amsterdam
        zoom: 13,
        zoomControl: false,
        attributionControl: false
      })
      
      // Add OSM tiles (will be toggled based on showOsmTiles)
      const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.5,
        maxZoom: 19
      })
      
      if (showOsmTiles) {
        osmTiles.addTo(map)
      }
      
      leafletMapRef.current = map
      setMapLoaded(true)
      
      // Initialize animation system
      setAnimationSystem(new AnimationSystem(map))
      
      // Add click handler for setting origin/destination
      map.on('click', handleMapClick)
      
      // Cleanup
      return () => {
        map.off('click', handleMapClick)
        map.remove()
      }
    }
  }, [showOsmTiles])
  
  useEffect(() => {
    // Toggle OSM tiles visibility
    if (leafletMapRef.current) {
      const map = leafletMapRef.current
      let tileLayer: L.TileLayer | null = null
      
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          tileLayer = layer as L.TileLayer
        }
      })
      
      if (showOsmTiles) {
        if (!tileLayer) {
          tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            opacity: 0.5,
            maxZoom: 19
          })
          if (tileLayer) {
            tileLayer.addTo(map)
          }
        }
      } else {
        if (tileLayer) {
          map.removeLayer(tileLayer)
        }
      }
    }
  }, [showOsmTiles])
  
  useEffect(() => {
    if (selectedMap && mapLoaded) {
      loadMapData(selectedMap)
    }
  }, [selectedMap, mapLoaded])
  
  const loadMapData = async (mapPath: string) => {
    setIsLoading(true)
    try {
      // Clear existing road segments
      clearRoadSegments()
      
      // Fetch and parse OSM data
      const response = await fetch(mapPath)
      if (!response.ok) {
        throw new Error('Failed to fetch map data')
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const osmData = await parseOsmData(arrayBuffer, routingMode)
      
      setRoadSegments(osmData)
      
      // Fit map to the loaded data bounds
      if (osmData.length > 0 && leafletMapRef.current) {
        const bounds = calculateBounds(osmData)
        leafletMapRef.current.fitBounds(bounds)
      }
      
    } catch (error) {
      console.error('Error loading map data:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const calculateBounds = (segments: RoadSegment[]): L.LatLngBounds => {
    let minLat = Infinity, maxLat = -Infinity
    let minLng = Infinity, maxLng = -Infinity
    
    segments.forEach(segment => {
      segment.nodes.forEach(node => {
        minLat = Math.min(minLat, node.lat)
        maxLat = Math.max(maxLat, node.lat)
        minLng = Math.min(minLng, node.lng)
        maxLng = Math.max(maxLng, node.lng)
      })
    })
    
    return L.latLngBounds(
      L.latLng(minLat, minLng),
      L.latLng(maxLat, maxLng)
    )
  }
  
  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng
    
    if (!origin) {
      setOrigin({ lat, lng })
      addMarker({ lat, lng }, 'origin')
    } else if (!destination) {
      setDestination({ lat, lng })
      addMarker({ lat, lng }, 'destination')
      calculateRoute()
    } else {
      // Clear and start over
      clearMarkers()
      clearRoute()
      setOrigin({ lat, lng })
      setDestination(null)
      addMarker({ lat, lng }, 'origin')
    }
  }
  
  const addMarker = (coord: Coordinate, type: 'origin' | 'destination') => {
    if (leafletMapRef.current) {
      const marker = L.circleMarker([coord.lat, coord.lng], {
        radius: 8,
        fillColor: type === 'origin' ? '#2ecc71' : '#e74c3c',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7
      }).addTo(leafletMapRef.current)
      
      marker.bindTooltip(type === 'origin' ? 'Origin' : 'Destination', {
        permanent: true,
        direction: 'right'
      })
    }
  }
  
  const clearMarkers = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.CircleMarker) {
          leafletMapRef.current?.removeLayer(layer)
        }
      })
    }
  }
  
  const calculateRoute = async () => {
    if (!origin || !destination || !roadSegments.length || !leafletMapRef.current || isRouting) {
      return
    }
    
    setIsRouting(true)
    
    try {
      // Create routing engine
      const engine = new RoutingEngine(roadSegments, routingMode)
      
      // Set start and end points
      const { startNodeId, endNodeId } = engine.setStartAndEndPoints(origin, destination)
      
      if (!startNodeId || !endNodeId) {
        throw new Error('Could not find valid start or end points on the road network')
      }
      
      // Find path using A* algorithm
      const { path, examinedNodes } = await engine.findPath()
      
      // Animate the routing process
      if (animationSystem) {
        await animationSystem.animateRouting(
          examinedNodes,
          path,
          roadSegments
        )
      }
      
    } catch (error) {
      console.error('Error calculating route:', error)
    } finally {
      setIsRouting(false)
    }
  }
  
  const clearRoute = () => {
    if (animationSystem) {
      animationSystem.clearAnimation()
    }
  }
  
  const clearRoadSegments = () => {
    // Remove all road segment layers from the map
    if (leafletMapRef.current) {
      leafletMapRef.current.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Polyline && !layer.options.className?.includes('road-segment')) {
          leafletMapRef.current?.removeLayer(layer)
        }
      })
    }
  }
  

  

  
  useEffect(() => {
    // Draw road segments on the map
    if (roadSegments.length > 0 && leafletMapRef.current) {
      clearRoadSegments()
      
      roadSegments.forEach((segment: RoadSegment) => {
        const latLngs = segment.nodes.map(node => [node.lat, node.lng] as L.LatLngExpression)
        
        const polyline = L.polyline(latLngs, {
          color: '#666',
          weight: 2,
          opacity: 0.8,
          className: 'road-segment'
        })
        if (leafletMapRef.current) {
          polyline.addTo(leafletMapRef.current)
        }
      })
    }
  }, [roadSegments])
  
  useEffect(() => {
    // When routing mode changes, we need to re-parse the map data and clear current route
    if (selectedMap && roadSegments.length > 0) {
      clearRoute()
      clearMarkers()
      setOrigin(null)
      setDestination(null)
      loadMapData(selectedMap)
    }
  }, [routingMode])
  
  useEffect(() => {
    // Update animation speed
    if (animationSystem) {
      animationSystem.setAnimationSpeed(animationSpeed)
    }
  }, [animationSpeed])
  
  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{ position: 'relative' }}
    >
      {isLoading && (
        <div style={
          {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: 1000
          }
        }>
          Loading map data...
        </div>
      )}
    </div>
  )
}

export default MapComponent