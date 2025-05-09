"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Download, FileText, ImageIcon, Table } from "lucide-react"
import type { BusinessInfo } from "@/types/business-info"
import type { GridResult } from "@/lib/geogrid-service"

interface ExportReportProps {
  businessInfo: BusinessInfo
  gridResult?: GridResult
}

export function ExportReport({ businessInfo, gridResult }: ExportReportProps) {
  const [exportOptions, setExportOptions] = useState({
    includeRankingMap: true,
    includeCompetitiveAnalysis: true,
    includeHistoricalData: true,
    includeRecommendations: true,
    format: "pdf" as "pdf" | "csv" | "image" | "jpg",
  })
  const [isExporting, setIsExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const handleExport = () => {
    if (exportOptions.format === "jpg") {
      exportAsJpg()
    } else {
      // In a real implementation, this would generate and download the report
      // For now, we'll just show an alert
      alert(`Exporting report for ${businessInfo.name} with options: ${JSON.stringify(exportOptions)}`)
    }
  }

  const exportAsJpg = async () => {
    try {
      setIsExporting(true)
      
      // Load html2canvas from CDN if it's not already loaded
      if (!(window as any).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error("Failed to load html2canvas"))
          document.head.appendChild(script)
        })
      }
      
      // Create a temporary popup window that matches LocalViking format
      const popupContainer = document.createElement('div')
      popupContainer.style.position = 'fixed'
      popupContainer.style.left = '-9999px'
      popupContainer.style.width = '800px' // Fixed width to match LocalViking format
      popupContainer.style.backgroundColor = 'white'
      popupContainer.style.padding = '20px'
      document.body.appendChild(popupContainer)
      
      // Create the content of the popup window
      const header = document.createElement('div')
      header.style.display = 'flex'
      header.style.alignItems = 'center'
      header.style.justifyContent = 'space-between'
      header.style.marginBottom = '20px'
      
      const title = document.createElement('h2')
      title.textContent = `GeoGrid Analysis: ${businessInfo.name}`
      title.style.fontSize = '20px'
      title.style.fontWeight = 'bold'
      title.style.margin = '0'
      
      const date = document.createElement('div')
      date.textContent = new Date().toLocaleDateString()
      date.style.fontSize = '14px'
      date.style.color = '#666'
      
      header.appendChild(title)
      header.appendChild(date)
      popupContainer.appendChild(header)
      
      // Add business information
      const businessSection = document.createElement('div')
      businessSection.style.marginBottom = '20px'
      businessSection.style.padding = '15px'
      businessSection.style.backgroundColor = '#f5f5f5'
      businessSection.style.borderRadius = '5px'
      
      const businessHeader = document.createElement('h3')
      businessHeader.textContent = 'Business Information'
      businessHeader.style.fontSize = '16px'
      businessHeader.style.marginTop = '0'
      businessHeader.style.marginBottom = '10px'
      
      const businessDetails = document.createElement('div')
      businessDetails.innerHTML = `
        <div style="margin-bottom: 8px;"><strong>Name:</strong> ${businessInfo.name}</div>
        <div style="margin-bottom: 8px;"><strong>Address:</strong> ${businessInfo.address || 'N/A'}</div>
        <div style="margin-bottom: 8px;"><strong>Search Term:</strong> ${gridResult?.searchTerm || 'N/A'}</div>
        <div><strong>Location:</strong> ${typeof businessInfo.location === 'object' ? `${businessInfo.location.lat.toFixed(6)}, ${businessInfo.location.lng.toFixed(6)}` : 'N/A'}</div>
      `
      
      businessSection.appendChild(businessHeader)
      businessSection.appendChild(businessDetails)
      popupContainer.appendChild(businessSection)
      
      // Add grid visualization if available
      if (gridResult && exportOptions.includeRankingMap) {
        const mapSection = document.createElement('div')
        mapSection.style.marginBottom = '20px'
        
        const mapHeader = document.createElement('h3')
        mapHeader.textContent = 'Ranking Map Visualization'
        mapHeader.style.fontSize = '16px'
        mapHeader.style.marginTop = '0'
        mapHeader.style.marginBottom = '10px'
        
        const mapContainer = document.createElement('div')
        mapContainer.style.height = '400px'
        mapContainer.style.backgroundColor = '#eaf7ff'
        mapContainer.style.display = 'flex'
        mapContainer.style.alignItems = 'center'
        mapContainer.style.justifyContent = 'center'
        mapContainer.style.border = '1px solid #ddd'
        mapContainer.style.borderRadius = '5px'
        
        // Create canvas for grid data visualization
        const canvas = document.createElement('canvas')
        canvas.width = 600
        canvas.height = 400
        
        const ctx = canvas.getContext('2d')
        if (ctx) {
          // Draw grid visualization using grid data
          const gridData = gridResult.gridData
          const rows = gridData.length
          const cols = gridData[0].length
          
          const cellWidth = canvas.width / cols
          const cellHeight = canvas.height / rows
          
          // Draw grid cells with ranking colors
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const value = gridData[y][x]
              
              // Set color based on ranking value
              let bgColor = "#b71c1c" // Default red for 20+
              const textColor = "#ffffff"
              
              if (value <= 3) {
                bgColor = "#1b5e20" // Dark green for top 3
              } else if (value <= 10) {
                bgColor = "#388e3c" // Green for 4-10
              } else if (value <= 15) {
                bgColor = "#fbc02d" // Yellow for 11-15
              } else if (value <= 20) {
                bgColor = "#e64a19" // Orange for 16-20
              }
              
              // Draw cell background
              ctx.fillStyle = bgColor
              ctx.fillRect(x * cellWidth + 1, y * cellHeight + 1, cellWidth - 2, cellHeight - 2)
              
              // Draw ranking text
              ctx.fillStyle = textColor
              ctx.font = `${Math.min(cellWidth, cellHeight) * 0.5}px Arial`
              ctx.textAlign = "center"
              ctx.textBaseline = "middle"
              
              const displayValue = value > 20 ? "20+" : value.toString()
              ctx.fillText(displayValue, x * cellWidth + cellWidth / 2, y * cellHeight + cellHeight / 2)
            }
          }
          
          // Draw business location marker in the center
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          
          // Draw marker
          ctx.fillStyle = "#1976d2"
          ctx.beginPath()
          ctx.arc(centerX, centerY, Math.min(cellWidth, cellHeight) * 0.3, 0, Math.PI * 2)
          ctx.fill()
        }
        
        mapContainer.appendChild(canvas)
        mapSection.appendChild(mapHeader)
        mapSection.appendChild(mapContainer)
        popupContainer.appendChild(mapSection)
      }
      
      // Add metrics if available
      if (gridResult && exportOptions.includeCompetitiveAnalysis) {
        const metricsSection = document.createElement('div')
        metricsSection.style.marginBottom = '20px'
        
        const metricsHeader = document.createElement('h3')
        metricsHeader.textContent = 'Performance Metrics'
        metricsHeader.style.fontSize = '16px'
        metricsHeader.style.marginTop = '0'
        metricsHeader.style.marginBottom = '10px'
        
        const metricsContainer = document.createElement('div')
        metricsContainer.style.display = 'flex'
        metricsContainer.style.gap = '15px'
        metricsContainer.style.flexWrap = 'wrap'
        
        // Add metrics cards
        const metrics = [
          { name: 'AGR', value: gridResult.metrics.agr.toFixed(1), description: 'Average Grid Ranking' },
          { name: 'ATGR', value: gridResult.metrics.atgr.toFixed(2), description: 'Average Top Grid Ranking' },
          { name: 'SoLV', value: gridResult.metrics.solv, description: 'Share of Local Voice' }
        ]
        
        metrics.forEach(metric => {
          const metricCard = document.createElement('div')
          metricCard.style.flex = '1'
          metricCard.style.minWidth = '150px'
          metricCard.style.padding = '15px'
          metricCard.style.backgroundColor = '#f5f5f5'
          metricCard.style.borderRadius = '5px'
          metricCard.style.textAlign = 'center'
          
          const metricValue = document.createElement('div')
          metricValue.textContent = metric.value
          metricValue.style.fontSize = '24px'
          metricValue.style.fontWeight = 'bold'
          metricValue.style.color = '#1976d2'
          metricValue.style.marginBottom = '5px'
          
          const metricName = document.createElement('div')
          metricName.textContent = metric.name
          metricName.style.fontSize = '16px'
          metricName.style.fontWeight = 'bold'
          metricName.style.marginBottom = '5px'
          
          const metricDescription = document.createElement('div')
          metricDescription.textContent = metric.description
          metricDescription.style.fontSize = '12px'
          metricDescription.style.color = '#666'
          
          metricCard.appendChild(metricValue)
          metricCard.appendChild(metricName)
          metricCard.appendChild(metricDescription)
          metricsContainer.appendChild(metricCard)
        })
        
        metricsSection.appendChild(metricsHeader)
        metricsSection.appendChild(metricsContainer)
        popupContainer.appendChild(metricsSection)
      }
      
      // Use html2canvas to convert the popup container to a JPEG image
      const canvas = await (window as any).html2canvas(popupContainer, {
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })
      
      // Convert to JPG and trigger download
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const link = document.createElement('a')
      link.href = imgData
      link.download = `geogrid-${businessInfo.name.replace(/\s+/g, '-')}-${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      document.body.removeChild(popupContainer)
      
    } catch (error) {
      console.error('Error generating JPG:', error)
      alert('Failed to generate JPG. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Report</CardTitle>
        <CardDescription>Generate a shareable report of your GeoGrid analysis</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Report Sections</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-ranking-map"
                  checked={exportOptions.includeRankingMap}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeRankingMap: checked as boolean })
                  }
                />
                <Label htmlFor="include-ranking-map">Ranking Map Visualization</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-competitive-analysis"
                  checked={exportOptions.includeCompetitiveAnalysis}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeCompetitiveAnalysis: checked as boolean })
                  }
                />
                <Label htmlFor="include-competitive-analysis">Competitive Analysis</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-historical-data"
                  checked={exportOptions.includeHistoricalData}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeHistoricalData: checked as boolean })
                  }
                />
                <Label htmlFor="include-historical-data">Historical Data</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-recommendations"
                  checked={exportOptions.includeRecommendations}
                  onCheckedChange={(checked) =>
                    setExportOptions({ ...exportOptions, includeRecommendations: checked as boolean })
                  }
                />
                <Label htmlFor="include-recommendations">Strategic Recommendations</Label>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Export Format</h3>
            <div className="grid grid-cols-4 gap-2">
              <Button
                variant={exportOptions.format === "pdf" ? "default" : "outline"}
                className="flex flex-col items-center justify-center h-20 p-2"
                onClick={() => setExportOptions({ ...exportOptions, format: "pdf" })}
              >
                <FileText className="h-6 w-6 mb-1" />
                <span className="text-xs">PDF Report</span>
              </Button>
              <Button
                variant={exportOptions.format === "csv" ? "default" : "outline"}
                className="flex flex-col items-center justify-center h-20 p-2"
                onClick={() => setExportOptions({ ...exportOptions, format: "csv" })}
              >
                <Table className="h-6 w-6 mb-1" />
                <span className="text-xs">CSV Data</span>
              </Button>
              <Button
                variant={exportOptions.format === "image" ? "default" : "outline"}
                className="flex flex-col items-center justify-center h-20 p-2"
                onClick={() => setExportOptions({ ...exportOptions, format: "image" })}
              >
                <ImageIcon className="h-6 w-6 mb-1" />
                <span className="text-xs">PNG</span>
              </Button>
              <Button
                variant={exportOptions.format === "jpg" ? "default" : "outline"}
                className="flex flex-col items-center justify-center h-20 p-2"
                onClick={() => setExportOptions({ ...exportOptions, format: "jpg" })}
              >
                <ImageIcon className="h-6 w-6 mb-1" />
                <span className="text-xs">JPG Format</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={handleExport} disabled={isExporting}>
          {isExporting ? (
            <>Exporting...</>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
