import React, { useState, useEffect, useRef } from 'react'
import { MapFileInfo } from '../types/types'
import { scanMapFiles, formatFileSize } from '../utils/osmFileBrowser'

interface ControlPanelProps {
  mapFiles: MapFileInfo[]
  setMapFiles: (files: MapFileInfo[]) => void
  selectedMap: string | null
  setSelectedMap: (map: string | null) => void
  routingMode: 'car' | 'bicycle' | 'pedestrian'
  setRoutingMode: (mode: 'car' | 'bicycle' | 'pedestrian') => void
  animationSpeed: number
  setAnimationSpeed: (speed: number) => void
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  showOsmTiles: boolean
  setShowOsmTiles: (show: boolean) => void
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  mapFiles,
  setMapFiles,
  selectedMap,
  setSelectedMap,
  routingMode,
  setRoutingMode,
  animationSpeed,
  setAnimationSpeed,
  theme,
  setTheme,
  showOsmTiles,
  setShowOsmTiles
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  
  useEffect(() => {
    if (mapFiles.length === 0) {
      loadMapFiles()
    }
  }, [])
  
  const loadMapFiles = async () => {
    setIsLoading(true)
    try {
      const files = await scanMapFiles()
      setMapFiles(files)
      if (files.length > 0 && !selectedMap) {
        setSelectedMap(files[0].path)
      }
    } catch (error) {
      console.error('Error loading map files:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === panelRef.current || (e.target as HTMLElement).classList.contains('control-panel-header')) {
      setIsDragging(true)
      setDragPosition({
        x: e.clientX - (panelRef.current?.offsetLeft || 0),
        y: e.clientY - (panelRef.current?.offsetTop || 0)
      })
    }
  }
  
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && panelRef.current) {
      panelRef.current.style.left = `${e.clientX - dragPosition.x}px`
      panelRef.current.style.top = `${e.clientY - dragPosition.y}px`
    }
  }
  
  const handleMouseUp = () => {
    setIsDragging(false)
  }
  
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragPosition])
  
  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }
  
  return (
    <div
      ref={panelRef}
      className={`control-panel ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      style={{ cursor: isDragging ? 'move' : 'auto' }}
    >
      <div className="control-panel-header">
        <div className="control-panel-title">Routing Settings</div>
        <div className="theme-toggle">
          <label className="toggle-switch">
            <input 
              type="checkbox"
              checked={theme === 'dark'}
              onChange={handleThemeToggle}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div className="control-section">
        <div className="control-section-title">Map Selection</div>
        {isLoading ? (
          <div className="btn" style={{ display: 'flex', justifyContent: 'center' }}>
            Loading maps...
          </div>
        ) : (
          <select
            className="select-dropdown"
            value={selectedMap || ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedMap(e.target.value || null)}
            disabled={mapFiles.length === 0}
          >
            {mapFiles.length === 0 ? (
              <option value="">No maps found</option>
            ) : (
              mapFiles.map((file: MapFileInfo) => (
                <option key={file.path} value={file.path}>
                  {file.name} ({formatFileSize(file.size)})
                </option>
              ))
            )}
          </select>
        )}
      </div>
      
      <div className="control-section">
        <div className="control-section-title">Routing Mode</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['car', 'bicycle', 'pedestrian'] as const).map((mode: 'car' | 'bicycle' | 'pedestrian') => (
            <button
              key={mode}
              className={`btn ${routingMode === mode ? 'btn-primary' : ''}`}
              onClick={() => setRoutingMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      <div className="control-section">
        <div className="control-section-title">Animation Speed</div>
        <input
          type="range"
          min="1"
          max="10"
          value={animationSpeed}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnimationSpeed(parseInt(e.target.value))}
          className="range-slider"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>
      
      <div className="control-section">
        <div className="control-section-title">OSM Tiles</div>
        <label className="toggle-switch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ marginRight: '10px' }}>Show tiles</span>
          <input
            type="checkbox"
            checked={showOsmTiles}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowOsmTiles(e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
      
      <div className="control-section">
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={loadMapFiles}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Maps'}
        </button>
      </div>
    </div>
  )
}

export default ControlPanel