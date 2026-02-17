import { MapFileInfo } from '../types/types'

export async function scanMapFiles(): Promise<MapFileInfo[]> {
  try {
    // Fetch the index.json file from public/maps
    const response = await fetch('/maps/index.json')
    if (!response.ok) {
      throw new Error('Failed to fetch map index')
    }
    
    const mapFiles = await response.json() as string[]
    
    // Get file info for each map file
    const fileInfos: MapFileInfo[] = []
    
    for (const fileName of mapFiles) {
      try {
        const fileResponse = await fetch(`/maps/${fileName}`)
        if (fileResponse.ok) {
          const size = fileResponse.headers.get('Content-Length')
          fileInfos.push({
            name: fileName.replace('.osm.gz', ''),
            path: `/maps/${fileName}`,
            size: size ? parseInt(size) : 0
          })
        }
      } catch (error) {
        console.error(`Error fetching info for ${fileName}:`, error)
      }
    }
    
    return fileInfos
  } catch (error) {
    console.error('Error scanning map files:', error)
    return []
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}