import { RoadSegment, Coordinate, RoutingNode, RoutingMode } from '../types/types'

export class RoutingEngine {
  private roadSegments: RoadSegment[]
  private routingMode: RoutingMode
  private nodes: Map<string, RoutingNode>
  private startNodeId: string | null
  private endNodeId: string | null
  
  constructor(roadSegments: RoadSegment[], routingMode: RoutingMode) {
    this.roadSegments = roadSegments
    this.routingMode = routingMode
    this.nodes = new Map()
    this.startNodeId = null
    this.endNodeId = null
    this.buildGraph()
  }
  
  private buildGraph(): void {
    // Clear existing nodes
    this.nodes.clear()
    
    // Create nodes for each road segment
    this.roadSegments.forEach(segment => {
      // Skip segments not accessible by current routing mode
      if (!this.isSegmentAccessible(segment)) {
        return
      }
      
      // Create nodes for each coordinate in the segment
      segment.nodes.forEach((node, index) => {
        const nodeId = this.getNodeId(segment.id, index)
        
        if (!this.nodes.has(nodeId)) {
          this.nodes.set(nodeId, {
            id: nodeId,
            coordinate: node,
            neighbors: new Map(),
            heuristic: 0,
            gScore: Infinity,
            fScore: Infinity,
            visited: false
          })
        }
        
        // Connect to previous node in the segment
        if (index > 0) {
          const prevNodeId = this.getNodeId(segment.id, index - 1)
          const distance = this.calculateDistance(node, segment.nodes[index - 1])
          
          // Add bidirectional connection unless it's a one-way road
          this.addNeighborConnection(nodeId, prevNodeId, distance, segment.id)
          
          if (!segment.oneWay || this.routingMode !== 'car') {
            this.addNeighborConnection(prevNodeId, nodeId, distance, segment.id)
          }
        }
      })
    })
  }
  
  private getNodeId(segmentId: string, nodeIndex: number): string {
    return `${segmentId}_${nodeIndex}`
  }
  
  private calculateDistance(node1: Coordinate, node2: Coordinate): number {
    // Haversine formula for distance between two coordinates
    const R = 6371 // Earth radius in km
    const dLat = this.toRadians(node2.lat - node1.lat)
    const dLon = this.toRadians(node2.lng - node1.lng)
    
    const lat1 = this.toRadians(node1.lat)
    const lat2 = this.toRadians(node2.lat)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    
    return R * c // Distance in km
  }
  
  private toRadians(degrees: number): number {
    return degrees * Math.PI / 180
  }
  
  private addNeighborConnection(
    fromNodeId: string,
    toNodeId: string,
    distance: number,
    segmentId: string
  ): void {
    const fromNode = this.nodes.get(fromNodeId)
    if (fromNode) {
      fromNode.neighbors.set(toNodeId, { distance, segmentId })
    }
  }
  
  private isSegmentAccessible(segment: RoadSegment): boolean {
    // Check if the segment is accessible by the current routing mode
    switch (this.routingMode) {
      case 'car':
        return segment.accessibleBy === 'car' || segment.accessibleBy === 'all'
      case 'bicycle':
        return segment.accessibleBy === 'bicycle' || segment.accessibleBy === 'all'
      case 'pedestrian':
        return segment.accessibleBy === 'pedestrian' || segment.accessibleBy === 'all'
      default:
        return true
    }
  }
  
  public setStartAndEndPoints(
    startCoord: Coordinate,
    endCoord: Coordinate
  ): { startNodeId: string | null, endNodeId: string | null } {
    // Find the closest nodes to the given coordinates
    this.startNodeId = this.findClosestNodeId(startCoord)
    this.endNodeId = this.findClosestNodeId(endCoord)
    
    return { startNodeId: this.startNodeId, endNodeId: this.endNodeId }
  }
  
  private findClosestNodeId(coord: Coordinate): string | null {
    let closestNodeId: string | null = null
    let minDistance = Infinity
    
    this.nodes.forEach((node, nodeId) => {
      const distance = this.calculateDistance(coord, node.coordinate)
      if (distance < minDistance) {
        minDistance = distance
        closestNodeId = nodeId
      }
    })
    
    return closestNodeId
  }
  
  public async findPath(): Promise<{
    path: string[],
    examinedNodes: string[],
    distance: number,
    time: number
  }> {
    if (!this.startNodeId || !this.endNodeId) {
      throw new Error('Start and end points not set')
    }
    
    const startNode = this.nodes.get(this.startNodeId)
    const endNode = this.nodes.get(this.endNodeId)
    
    if (!startNode || !endNode) {
      throw new Error('Start or end node not found')
    }
    
    // Reset node scores
    this.nodes.forEach(node => {
      node.gScore = Infinity
      node.fScore = Infinity
      node.visited = false
      node.cameFrom = undefined
    })
    
    startNode.gScore = 0
    startNode.fScore = this.calculateHeuristic(startNode.coordinate, endNode.coordinate)
    
    const openSet = new Set<string>([this.startNodeId])
    const examinedNodes: string[] = []
    
    while (openSet.size > 0) {
      // Find node with lowest fScore
      let currentNodeId = this.getNodeWithLowestFScore(openSet)
      if (!currentNodeId) break
      
      const currentNode = this.nodes.get(currentNodeId)
      if (!currentNode) break
      
      // Check if we've reached the destination
      if (currentNodeId === this.endNodeId) {
        return this.reconstructPath(currentNode, examinedNodes)
      }
      
      // Move current node from open to examined
      openSet.delete(currentNodeId)
      examinedNodes.push(currentNodeId)
      currentNode.visited = true
      
      // Examine neighbors
      currentNode.neighbors.forEach((neighborData, neighborId) => {
        if (currentNode.visited) return
        
        const neighbor = this.nodes.get(neighborId)
        if (!neighbor) return
        
        // Calculate tentative gScore
        const segment = this.roadSegments.find(s => s.id === neighborData.segmentId)
        if (!segment) return
        
        const speed = segment.speed
        const time = neighborData.distance / speed // time = distance / speed
        const tentativeGScore = currentNode.gScore + time
        
        if (tentativeGScore < neighbor.gScore) {
          // This path to neighbor is better than any previous one
          neighbor.cameFrom = currentNodeId
          neighbor.gScore = tentativeGScore
          neighbor.fScore = tentativeGScore + this.calculateHeuristic(neighbor.coordinate, endNode.coordinate)
          
          if (!openSet.has(neighborId)) {
            openSet.add(neighborId)
          }
        }
      })
      
      // Add small delay for animation
      await this.delayForAnimation()
    }
    
    // No path found
    return { path: [], examinedNodes, distance: 0, time: 0 }
  }
  
  private getNodeWithLowestFScore(openSet: Set<string>): string | null {
    let lowestFScore = Infinity
    let lowestNodeId: string | null = null
    
    openSet.forEach(nodeId => {
      const node = this.nodes.get(nodeId)
      if (node && node.fScore < lowestFScore) {
        lowestFScore = node.fScore
        lowestNodeId = nodeId
      }
    })
    
    return lowestNodeId
  }
  
  private calculateHeuristic(coord1: Coordinate, coord2: Coordinate): number {
    // Simple Euclidean distance heuristic (straight line distance)
    return this.calculateDistance(coord1, coord2)
  }
  
  private reconstructPath(
    currentNode: RoutingNode,
    examinedNodes: string[]
  ): { path: string[], examinedNodes: string[], distance: number, time: number } {
    const path: string[] = []
    let currentNodeId = currentNode.id
    let totalDistance = 0
    let totalTime = 0
    
    while (currentNodeId) {
      path.unshift(currentNodeId)
      const current = this.nodes.get(currentNodeId)
      if (!current || !current.cameFrom) break
      
      // Calculate distance and time for this segment
      const cameFromNode = this.nodes.get(current.cameFrom)
      if (cameFromNode) {
        const distance = this.calculateDistance(current.coordinate, cameFromNode.coordinate)
        const segmentId = this.findSegmentIdBetweenNodes(current.cameFrom, currentNodeId)
        if (segmentId) {
          const segment = this.roadSegments.find(s => s.id === segmentId)
          if (segment) {
            const time = distance / segment.speed
            totalDistance += distance
            totalTime += time
          }
        }
      }
      
      currentNodeId = current.cameFrom
    }
    
    return { path, examinedNodes, distance: totalDistance, time: totalTime }
  }
  
  private findSegmentIdBetweenNodes(nodeId1: string, nodeId2: string): string | null {
    const node1 = this.nodes.get(nodeId1)
    if (!node1) return null
    
    const neighborData = node1.neighbors.get(nodeId2)
    return neighborData ? neighborData.segmentId : null
  }
  
  private async delayForAnimation(): Promise<void> {
    // This will be controlled by animation speed from UI
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  public getNodeCoordinate(nodeId: string): Coordinate | null {
    const node = this.nodes.get(nodeId)
    return node ? node.coordinate : null
  }
  
  public getSegmentById(segmentId: string): RoadSegment | undefined {
    return this.roadSegments.find(segment => segment.id === segmentId)
  }
}