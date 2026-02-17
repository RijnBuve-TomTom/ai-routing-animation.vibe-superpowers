export interface MapFileInfo {
  name: string;
  path: string;
  size: number;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RoadSegment {
  id: string;
  nodes: Coordinate[];
  tags: Record<string, string>;
  speed: number; // km/h
  oneWay: boolean;
  accessibleBy: 'car' | 'bicycle' | 'pedestrian' | 'all';
}

export interface RoutingNode {
  id: string;
  coordinate: Coordinate;
  neighbors: Map<string, { distance: number; segmentId: string }>;
  heuristic: number;
  gScore: number;
  fScore: number;
  cameFrom?: string;
  visited: boolean;
}

export type RoutingMode = 'car' | 'bicycle' | 'pedestrian';

export interface AnimationState {
  examinedSegments: Set<string>;
  currentPath: string[];
  isAnimating: boolean;
  animationFrame: number;
}