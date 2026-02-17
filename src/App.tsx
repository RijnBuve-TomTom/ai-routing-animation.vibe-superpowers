import React, { useState } from 'react'
import MapComponent from './components/MapComponent'
import ControlPanel from './components/ControlPanel'
import { MapFileInfo } from './types/types'

const App: React.FC = () => {
  const [mapFiles, setMapFiles] = useState<MapFileInfo[]>([])
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  const [routingMode, setRoutingMode] = useState<'car' | 'bicycle' | 'pedestrian'>('car')
  const [animationSpeed, setAnimationSpeed] = useState<number>(5)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showOsmTiles, setShowOsmTiles] = useState<boolean>(true)

  return (
    <div className={`app ${theme}`}>
      <MapComponent 
        selectedMap={selectedMap}
        routingMode={routingMode}
        animationSpeed={animationSpeed}
        showOsmTiles={showOsmTiles}
      />
      <ControlPanel
        mapFiles={mapFiles}
        setMapFiles={setMapFiles}
        selectedMap={selectedMap}
        setSelectedMap={setSelectedMap}
        routingMode={routingMode}
        setRoutingMode={setRoutingMode}
        animationSpeed={animationSpeed}
        setAnimationSpeed={setAnimationSpeed}
        theme={theme}
        setTheme={setTheme}
        showOsmTiles={showOsmTiles}
        setShowOsmTiles={setShowOsmTiles}
      />
    </div>
  )
}

export default App