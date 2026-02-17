import { RoadSegment } from '../types/types'
import L from 'leaflet'

export class AnimationSystem {
  private map: L.Map
  private examinedSegmentsLayer: L.LayerGroup
  private pathSegmentsLayer: L.LayerGroup
  private animationSpeed: number
  private examinedSegments: Set<string>
  private pathSegments: Set<string>
  
  constructor(map: L.Map, animationSpeed: number = 5) {
    this.map = map
    this.animationSpeed = animationSpeed
    this.examinedSegments = new Set()
    this.pathSegments = new Set()
    
    this.examinedSegmentsLayer = L.layerGroup()
    this.pathSegmentsLayer = L.layerGroup()
    
    this.examinedSegmentsLayer.addTo(map)
    this.pathSegmentsLayer.addTo(map)
    
    // Ensure path layer is on top
    // Note: bringToFront() is available in Leaflet but may need type casting
    if ((this.pathSegmentsLayer as any).bringToFront) {
      (this.pathSegmentsLayer as any).bringToFront()
    }
  }
  
  public setAnimationSpeed(speed: number): void {
    this.animationSpeed = speed
  }
  
  public clearAnimation(): void {
    this.examinedSegmentsLayer.clearLayers()
    this.pathSegmentsLayer.clearLayers()
    this.examinedSegments.clear()
    this.pathSegments.clear()
  }
  

  public async animateRouting(
    examinedNodeIds: string[],
    pathNodeIds: string[],
    roadSegments: RoadSegment[]
  ): Promise<void> {
    this.clearAnimation()
    
    // Convert node IDs to segment IDs for visualization
    const examinedSegmentIds = this.getSegmentIdsFromNodeIds(examinedNodeIds)
    const pathSegmentIds = this.getSegmentIdsFromNodeIds(pathNodeIds)
    
    // Animate examined segments
    for (const segmentId of examinedSegmentIds) {
      const segment = roadSegments.find(s => s.id === segmentId)
      if (segment) {
        this.drawExaminedSegment(segment)
        await this.delay()
      }
    }
    
    // Animate path segments (growing effect)
    for (const segmentId of pathSegmentIds) {
      const segment = roadSegments.find(s => s.id === segmentId)
      if (segment) {
        this.drawPathSegment(segment)
        await this.delay()
      }
    }
  }
  
  private getSegmentIdsFromNodeIds(nodeIds: string[]): Set<string> {
    const segmentIds = new Set<string>()
    
    nodeIds.forEach(nodeId => {
      // Node ID format: "segmentId_nodeIndex"
      const segmentId = nodeId.split('_')[0]
      segmentIds.add(segmentId)
    })
    
    return segmentIds
  }
  
  private drawExaminedSegment(segment: RoadSegment): void {
    if (this.examinedSegments.has(segment.id)) return
    
    const latLngs = segment.nodes.map(node => [node.lat, node.lng] as L.LatLngExpression)
    
    L.polyline(latLngs, {
      color: '#4a90e2',
      weight: 3,
      opacity: 0.7,
      className: 'road-segment examined'
    }).addTo(this.examinedSegmentsLayer)
    
    this.examinedSegments.add(segment.id)
  }
  
  private drawPathSegment(segment: RoadSegment): void {
    if (this.pathSegments.has(segment.id)) return
    
    const latLngs = segment.nodes.map(node => [node.lat, node.lng] as L.LatLngExpression)
    
    L.polyline(latLngs, {
      color: '#e74c3c',
      weight: 5,
      opacity: 0.9,
      className: 'road-segment path'
    }).addTo(this.pathSegmentsLayer)
    
    this.pathSegments.add(segment.id)
  }
  
  private async delay(): Promise<void> {
    // Calculate delay based on animation speed (1-10)
    // 1 = very slow (200ms), 10 = very fast (20ms)
    const delayMs = 200 - (this.animationSpeed - 1) * 18
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  
  public destroy(): void {
    this.map.removeLayer(this.examinedSegmentsLayer)
    this.map.removeLayer(this.pathSegmentsLayer)
  }
}