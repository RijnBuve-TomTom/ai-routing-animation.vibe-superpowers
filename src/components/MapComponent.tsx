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
  const [mapInitError, setMapInitError] = useState<string | null>(null)
  
  const initializeMap = () => {
    try {
      if (!mapRef.current) return
      
      console.log('Initializing map...', {
        mapRefCurrent: !!mapRef.current,
        offsetWidth: mapRef.current.offsetWidth,
        offsetHeight: mapRef.current.offsetHeight
      })
      
      // Fix for Leaflet icon issue
      const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png'
      const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png'
      const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
      
      // @ts-ignore - Leaflet icon types
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl,
        iconUrl,
        shadowUrl
      })
      
      const map = L.map(mapRef.current, {
        center: [52.3702, 4.8952], // Default to Amsterdam
        zoom: 13,
        zoomControl: true,
        attributionControl: true
      })
      
      console.log('Map created:', map)
      
      // Add OSM tiles
      const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.5,
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      })
      
      osmTiles.addTo(map)
      console.log('Tiles added to map')
      
      leafletMapRef.current = map
      setMapLoaded(true)
      setAnimationSystem(new AnimationSystem(map))
      map.on('click', handleMapClick)
      
      console.log('Map initialization complete')
      
    } catch (error) {
      console.error('Error in map initialization:', error)
      setMapInitError('Failed to initialize map. Error: ' + error)
    }
  }
  
  useEffect(() => {
    if (mapRef.current && !leafletMapRef.current) {
      // Check if container has dimensions
      if (mapRef.current.offsetWidth === 0 || mapRef.current.offsetHeight === 0) {
        console.warn('Map container has zero dimensions, trying to fix...')
        
        // Try to force layout
        setTimeout(() => {
          if (mapRef.current) {
            console.log('Retrying after layout...', {
              offsetWidth: mapRef.current.offsetWidth,
              offsetHeight: mapRef.current.offsetHeight
            })
            
            if (mapRef.current.offsetWidth > 0 && mapRef.current.offsetHeight > 0) {
              initializeMap()
            } else {
              setMapInitError('Map container has no dimensions. Please check browser console.')
            }
          }
        }, 100)
      } else {
        initializeMap()
      }
    }
  }, [showOsmTiles])
  
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
      const engine = new RoutingEngine(roadSegments, routingMode)
      const { startNodeId, endNodeId } = engine.setStartAndEndPoints(origin, destination)
      
      if (!startNodeId || !endNodeId) {
        throw new Error('Could not find valid start or end points on the road network')
      }
      
      const { path, examinedNodes } = await engine.findPath()
      
      if (animationSystem) {
        await animationSystem.animateRouting(examinedNodes, path, roadSegments)
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
  
  const loadMapData = async (mapPath: string) => {
    setIsLoading(true)
    try {
      clearRoadSegments()
      
      const response = await fetch(mapPath)
      if (!response.ok) {
        throw new Error('Failed to fetch map data')
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const osmData = await parseOsmData(arrayBuffer, routingMode)
      
      setRoadSegments(osmData)
      
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
  
  const clearRoadSegments = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Polyline && !layer.options.className?.includes('road-segment')) {
          leafletMapRef.current?.removeLayer(layer)
        }
      })
    }
  }
  
  useEffect(() => {
    if (selectedMap && mapLoaded) {
      loadMapData(selectedMap)
    }
  }, [selectedMap, mapLoaded])
  
  useEffect(() => {
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
    if (selectedMap && roadSegments.length > 0) {
      clearRoute()
      clearMarkers()
      setOrigin(null)
      setDestination(null)
      loadMapData(selectedMap)
    }
  }, [routingMode])
  
  useEffect(() => {
    if (animationSystem) {
      animationSystem.setAnimationSpeed(animationSpeed)
    }
  }, [animationSpeed])
  
  useEffect(() => {
    // Toggle OSM tiles visibility
    const map = leafletMapRef.current
    if (map) {
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          if (showOsmTiles) {
            if (!map.hasLayer(layer)) {
              layer.addTo(map)
            }
          } else {
            map.removeLayer(layer)
          }
        }
      })
    }
  }, [showOsmTiles])
  
  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f0f0f0'
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          zIndex: 1000
        }}>
          Loading map data...
        </div>
      )}
      {mapInitError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 2000,
          textAlign: 'center'
        }}>
          <h3>Map Initialization Error</h3>
          <p>{mapInitError}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: 'white',
              color: 'red',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      )}
    </div>
  )
}

export default MapComponent