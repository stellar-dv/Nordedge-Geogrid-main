"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import { deleteGridResult, getCompetitors } from "@/lib/geogrid-service"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getRankingColor, formatDateNoTime, revokeObjectUrls, ensureBusinessAtPosition } from "@/lib/geogrid-utils"

interface GridResultType {
  id: string
  gridSize: number
  distanceKm: number
  gridData: number[][]
  businessInfo: {
    name: string
    location: {
      lat: number
      lng: number
    }
    address?: string
    placeId?: string
    businessType?: string
  }
  searchTerm: string
  createdAt: string
  googleRegion?: string
  notes?: string
  metrics: {
    agr: number // average grid ranking
    atgr: number // average top grid ranking
    solv: number // search overlay visibility
  }
}

interface CompetitorBase {
  name: string
  ranking: number
  distance: number
  rating?: number
  address?: string
  userRatingsTotal?: number
  photoReference?: string
  photoUrl?: string
  location?: {
    lat: number
    lng: number
  }
}

interface Competitor extends CompetitorBase {
  id: string
  photoReference?: string
}

type CompetitorDisplay = CompetitorBase

interface DetailedGridViewProps {
  gridResult: GridResultType
  isOpen?: boolean
  onClose: () => void
  onDelete: () => void
}

export function DetailedGridView({ gridResult, isOpen = true, onClose, onDelete }: DetailedGridViewProps) {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [competitorsModalOpen, setCompetitorsModalOpen] = useState(false)
  const [competitorsLoading, setCompetitorsLoading] = useState(false)
  const [savedPngUrl, setSavedPngUrl] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const placesServiceRef = useRef<any>(null)
  const router = useRouter()
  const [competitorSearch, setCompetitorSearch] = useState("")
  const [compSortKey, setCompSortKey] = useState<keyof Competitor>("name")
  const [compSortOrder, setCompSortOrder] = useState<"asc" | "desc">("asc")

  // Parse grid size and distance as numbers with fallbacks
  const gridSize = Number(gridResult.gridSize) || 13 // Default to 13 if NaN
  const distance = Number(gridResult.distanceKm) || 2.5 // Default to 2.5 if NaN

  // Ensure gridData is properly typed and has fallback
  const gridData = Array.isArray(gridResult.gridData) ? gridResult.gridData : []

  // Parse location coordinates with fallbacks
  const location = {
    lat: Number(gridResult.businessInfo?.location?.lat) || 0,
    lng: Number(gridResult.businessInfo?.location?.lng) || 0,
  }

  const filteredCompetitors = useMemo(() => {
    return competitors
      .filter((c) => c.name.toLowerCase().includes(competitorSearch.toLowerCase()))
      .sort((a, b) => {
        let aVal: string | number = a[compSortKey] as any
        let bVal: string | number = b[compSortKey] as any
        if (compSortKey === "rating") {
          aVal = a.rating ?? 0
          bVal = b.rating ?? 0
        }
        if (aVal < bVal) return compSortOrder === "asc" ? -1 : 1
        if (aVal > bVal) return compSortOrder === "asc" ? 1 : -1
        return 0
      })
  }, [competitors, competitorSearch, compSortKey, compSortOrder])

  // Initialize map
  useEffect(() => {
    // Don't try to initialize if the component isn't fully mounted or if not in browser environment
    if (!mapRef.current || !isOpen || typeof window === "undefined") return

    let isMounted = true
    let timeoutId: NodeJS.Timeout

    // Start map initialization
    initMap()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }

    async function initMap() {
      if (!window.google || !window.google.maps) {
        try {
          // Load Google Maps API
          console.log("Loading Google Maps API...")
          await loadGoogleMaps()

          // Safety check after async operation
          if (!isMounted || !mapRef.current) {
            console.log("Component unmounted during API load")
            return
          }
        } catch (error) {
          console.error("Failed to load Google Maps API:", error)
          if (isMounted) {
            setMapError(`Failed to load Google Maps API: ${error instanceof Error ? error.message : "Unknown error"}`)
            setMapLoaded(true) // End loading state even on error
          }
          return
        }
      }

      // Set a timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (isMounted && !mapLoaded) {
          console.warn("Map loading timed out after 10 seconds")
          setMapError("Map loading timed out. Please try again.")
          setMapLoaded(true)
        }
      }, 10000)

      try {
        // Safety check to make sure window.google exists
        if (!window.google || !window.google.maps) {
          throw new Error("Google Maps not available after loading")
        }

        console.log("Creating map instance")
        if (!mapRef.current) {
          throw new Error("Map container element not found")
        }

        // Create the map instance
        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center: location,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          scrollwheel: true, // Enable scrolling to zoom without Ctrl key
          styles: [
            {
              featureType: "administrative",
              elementType: "geometry",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "administrative.land_parcel",
              elementType: "labels",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "poi",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "poi",
              elementType: "labels.text",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "road",
              elementType: "labels.icon",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "road.local",
              elementType: "labels",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
            {
              featureType: "transit",
              stylers: [
                {
                  visibility: "off",
                },
              ],
            },
          ],
        })

        mapInstanceRef.current = mapInstance

        // Create places service only if the map instance is available
        if (window.google.maps.places) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstance)
        }

        // No need to draw grid here since we have a separate useEffect for it

        if (isMounted) {
          console.log("Map initialized successfully")
          setMapLoaded(true)
        }
      } catch (error) {
        console.error("Error initializing map:", error)
        if (isMounted) {
          setMapError(`Failed to initialize map: ${error instanceof Error ? error.message : "Unknown error"}`)
          setMapLoaded(true) // Force loading to end even on error
        }
      } finally {
        // Clear the timeout
        if (timeoutId) clearTimeout(timeoutId)
      }
    }
  }, [isOpen, location])

  // Utility function to get photo URL from reference
  const getPhotoUrl = (photoReference: string | undefined, width = 120, height = 120): string => {
    if (!photoReference) return ""
    return `/api/place-photo?reference=${photoReference}&maxwidth=${width}&maxheight=${height}`
  }

  // Load competitors
  useEffect(() => {
    const loadCompetitors = async () => {
      try {
        const data = await getCompetitors(gridResult.id)
        const typedCompetitors: Competitor[] = data.map((comp: any) => ({
          id: comp.id || "",
          name: comp.name || "",
          ranking: comp.ranking || 0,
          distance: comp.distance || 0,
          location: comp.location
            ? {
                lat: Number(comp.location.lat),
                lng: Number(comp.location.lng),
              }
            : undefined,
          rating: comp.rating ? Number(comp.rating) : undefined,
          userRatingsTotal: comp.userRatingsTotal ? Number(comp.userRatingsTotal) : undefined,
          photoUrl: comp.photoUrl ? comp.photoUrl : undefined,
          photoReference: comp.photoReference || undefined,
        }))
        setCompetitors(typedCompetitors)
      } catch (error) {
        console.error("Error loading competitors:", error)
      }
    }

    loadCompetitors()
  }, [gridResult.id])

  // Helper function to get color based on ranking
  function getRankingColor(ranking: number): string {
    if (ranking <= 3) return "#059669" // emerald-600 for top 3
    if (ranking <= 7) return "#10b981" // green-500 for 4-7
    if (ranking <= 10) return "#f59e0b" // amber-500 for 8-10
    if (ranking <= 15) return "#f97316" // orange-500 for 11-15
    if (ranking >= 16) return "#ef4444" // red-500 for 16 and above (including 20+)
    return "#ef4444" // fallback to red-500
  }

  // Helper function to format ranking label
  function formatRankingLabel(ranking: number): string {
    if (ranking >= 20) {
      return "20+"
    }
    return ranking.toString()
  }

  // Handle repeat search
  const handleRepeatSearch = () => {
    const searchUrl = `/new-search?business=${encodeURIComponent(gridResult.businessInfo.name)}&searchTerm=${encodeURIComponent(
      gridResult.searchTerm,
    )}`

    // Close the current dialog before navigating
    if (onClose) {
      onClose()
    }

    // Use setTimeout to ensure the dialog is closed before navigation
    setTimeout(() => {
      // Navigate to the new search page with pre-filled business and search term
      router.push(searchUrl)

      // Scroll to top after navigation to ensure the form is visible
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      })
    }, 100)
  }

  // Handle PNG download
  const handlePNG = () => {
    // If we already have a saved PNG URL, open it
    if (savedPngUrl) {
      window.open(savedPngUrl, "_blank");
      return;
    }

    // Create loading element with better styling
    const loadingEl = document.createElement("div");
    loadingEl.style.position = "fixed";
    loadingEl.style.top = "0";
    loadingEl.style.left = "0";
    loadingEl.style.width = "100%";
    loadingEl.style.height = "100%";
    loadingEl.style.display = "flex";
    loadingEl.style.alignItems = "center";
    loadingEl.style.justifyContent = "center";
    loadingEl.style.backgroundColor = "rgba(0,0,0,0.6)";
    loadingEl.style.zIndex = "9999";
    loadingEl.style.backdropFilter = "blur(3px)";
    loadingEl.innerHTML = `
      <div style="background: white; padding: 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <div style="margin-bottom: 12px; font-size: 16px; font-weight: 500;">Generating high-quality map export...</div>
        <div style="display: inline-block; width: 48px; height: 48px; border: 4px solid #f3f3f3; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }}</style>
      </div>
    `;
    document.body.appendChild(loadingEl);

    try {
      // Get the map element and its dimensions
      const mapElement = mapRef.current;
      if (!mapElement) {
        document.body.removeChild(loadingEl);
        alert("Map element not found");
        return;
      }

      const width = mapElement.clientWidth;
      const height = mapElement.clientHeight;

      // Format date for the image
      const formattedDate = formatDateNoTime(new Date().toISOString());

      // Load html2canvas from CDN - consider bundling this library in production
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      
      script.onload = () => {
        // Higher quality settings for production
        const pixelRatio = 2; // Higher resolution
        
        // Once loaded, use the global html2canvas function
        (window as any)
          .html2canvas(mapElement, {
            useCORS: true,
            allowTaint: true,
            scale: pixelRatio, // Higher resolution
            width: width,
            height: height,
            backgroundColor: null,
            logging: false,
            windowWidth: document.documentElement.offsetWidth,
            windowHeight: document.documentElement.offsetHeight,
            // Focus only on the map content, ignore UI controls
            ignoreElements: (element: HTMLElement) => {
              // Ignore Google Maps UI elements
              return (
                element.classList.contains("gm-control-active") ||
                element.classList.contains("gm-style-cc") ||
                element.classList.contains("gm-ui-hover-effect") ||
                element.classList.contains("gm-fullscreen-control") ||
                element.classList.contains("gm-bundled-control") ||
                element.getAttribute("aria-label") === "Keyboard shortcuts"
              );
            },
          })
          .then((canvas: HTMLCanvasElement) => {
            try {
              // Create a complete canvas with header
              const finalCanvas = document.createElement("canvas");
              const ctx = finalCanvas.getContext("2d");

              // Set dimensions with space for header
              const headerHeight = 140; // Height for the business info header
              finalCanvas.width = canvas.width;
              finalCanvas.height = canvas.height + headerHeight;

              if (!ctx) {
                document.body.removeChild(loadingEl);
                alert("Could not get canvas context");
                return;
              }

              // Draw white background for the header
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, finalCanvas.width, headerHeight);

              // Draw the map image below the header
              ctx.drawImage(canvas, 0, headerHeight);

              // Add header content with improved styling
              // Business name in bold
              ctx.fillStyle = "#1a202c";
              ctx.font = "bold 22px Arial, sans-serif";
              ctx.fillText(gridResult.businessInfo.name, 20, 32);

              // Address and search term with better typography
              ctx.font = "15px Arial, sans-serif";
              ctx.fillStyle = "#4a5568";
              ctx.fillText(`Address: ${gridResult.businessInfo.address || "N/A"}`, 20, 60);
              ctx.fillText(`Search Term: "${gridResult.searchTerm}"`, 20, 85);

              // Add metrics on the right side with labels
              ctx.textAlign = "right";
              ctx.fillStyle = "#718096";
              ctx.font = "14px Arial, sans-serif";
              ctx.fillText(`Generated: ${formattedDate}`, finalCanvas.width - 20, 32);

              // Metrics with labels in a clearer format
              ctx.font = "bold 15px Arial, sans-serif";
              ctx.fillStyle = "#4a5568";
              ctx.fillText(`AGR: ${gridResult.metrics.agr.toFixed(2)}`, finalCanvas.width - 20, 60);
              ctx.fillText(`ATGR: ${gridResult.metrics.atgr.toFixed(2)}`, finalCanvas.width - 20, 85);
              ctx.fillText(`SoLV: ${Number(gridResult.metrics.solv).toFixed(2)}%`, finalCanvas.width - 20, 110);

              // Add grid size info with a subtle background
              ctx.textAlign = "left";
              
              // Draw a subtle background rectangle for grid info
              ctx.fillStyle = "#f7fafc";
              ctx.fillRect(18, 95, 220, 30);
              ctx.strokeStyle = "#e2e8f0";
              ctx.lineWidth = 1;
              ctx.strokeRect(18, 95, 220, 30);
              
              ctx.fillStyle = "#4a5568";
              ctx.font = "14px Arial, sans-serif";
              ctx.fillText(`Grid: ${gridSize}×${gridSize}, ${distance}km spacing`, 25, 115);

              // Add a subtle border between header and map
              ctx.strokeStyle = "#e2e8f0";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(0, headerHeight);
              ctx.lineTo(finalCanvas.width, headerHeight);
              ctx.stroke();
              
              // Add a subtle watermark
              ctx.textAlign = "center";
              ctx.font = "12px Arial, sans-serif";
              ctx.fillStyle = "rgba(0,0,0,0.3)";
              ctx.fillText("Generated by Nordedge GeoGrid", finalCanvas.width / 2, headerHeight - 10);

              // Export with high quality
              finalCanvas.toBlob(
                (blob) => {
                  if (blob) {
                    const url = URL.createObjectURL(blob);
                    
                    // Save the URL for future use
                    setSavedPngUrl(url);
                    
                    // Create filename with business name and date
                    const businessName = gridResult.businessInfo.name.replace(/\s+/g, "-").replace(/[^\w-]/g, "");
                    const timestamp = new Date().toISOString().split("T")[0];
                    const filename = `geogrid-${businessName}-${timestamp}.png`;

                    // Create a download link
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = filename;

                    // Option 1: Open in new tab
                    window.open(url, "_blank");
                  }
                  document.body.removeChild(loadingEl);
                },
                "image/png",
                0.95, // 95% quality
              );
            } catch (error) {
              console.error("Error creating final image:", error);
              document.body.removeChild(loadingEl);
              alert("Error generating image. Please try again.");
            }
          })
          .catch((error: Error) => {
            console.error("Error generating image:", error);
            document.body.removeChild(loadingEl);
            alert("Error generating image. Please try again.");
          });
      };

      script.onerror = () => {
        document.body.removeChild(loadingEl);
        alert("Failed to load html2canvas library. Please check your internet connection and try again.");
      };

      document.body.appendChild(script);
    } catch (error) {
      console.error("Error initializing image generation:", error);
      document.body.removeChild(loadingEl);
      alert("Failed to initialize image generation. Please try again.");
    }
  };

  // Handle CSV download
  const handleCSVDownload = () => {
    try {
      // Generate CSV content
      let csvContent = ""

      // Add header row with business info
      csvContent += `"GeoGrid Results for ${gridResult.businessInfo.name}"\n`
      csvContent += `"Search Term: ${gridResult.searchTerm}"\n`
      csvContent += `"Date: ${formatDate(gridResult.createdAt)}"\n\n`

      // Add grid data header
      csvContent += "Row,Column,Latitude,Longitude,Ranking\n"

      // Calculate grid coordinates
      const gridSize = Number(gridResult.gridSize) || 13
      const distance = Number(gridResult.distanceKm) || 2.5 // km
      const latKmRatio = 1 / 110.574 // approx km per degree of latitude
      const lngKmRatio = 1 / (111.32 * Math.cos((location.lat * Math.PI) / 180)) // approx km per degree of longitude

      const startLat = location.lat - (distance * latKmRatio * (gridSize - 1)) / 2
      const startLng = location.lng - (distance * lngKmRatio * (gridSize - 1)) / 2

      // Add grid data rows
      if (Array.isArray(gridData)) {
        gridData.forEach((row: number[], rowIndex: number) => {
          if (Array.isArray(row)) {
            row.forEach((ranking: number, colIndex: number) => {
              const lat = startLat + rowIndex * distance * latKmRatio
              const lng = startLng + colIndex * distance * lngKmRatio
              csvContent += `${rowIndex + 1},${colIndex + 1},${lat.toFixed(6)},${lng.toFixed(6)},${ranking}\n`
            })
          }
        })
      }

      // Add metrics
      csvContent += `\n"Metrics:"\n`
      csvContent += `"AGR (Average Grid Ranking)",${Number(gridResult.metrics.agr || 0).toFixed(1)}\n`
      csvContent += `"ATGR (Average Top Grid Ranking)",${Number(gridResult.metrics.atgr || 0).toFixed(2)}\n`
      csvContent += `"SoLV (Share of Local Voice)",${gridResult.metrics.solv || 0}\n`

      // Create a Blob object containing the CSV data
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })

      // Create a download link
      const link = document.createElement("a")

      // Create the download URL from the blob
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `geogrid-${gridResult.businessInfo.name.replace(/\s+/g, "-")}-${Date.now()}.csv`)
      link.style.display = "none"
      document.body.appendChild(link)

      // Trigger download
      link.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)
    } catch (error) {
      console.error("Error generating CSV:", error)
      alert("Failed to generate CSV file. Please try again.")
    }
  }

  // Helper function to format dates (removing time)
  const formatDate = (dateString: string) => {
    return formatDateNoTime(dateString);
  };

  // Handle share
  const handleShare = () => {
    try {
      // Create a shareable link
      const shareUrl = `${window.location.origin}/grid/${gridResult.id}`

      // Check if Web Share API is available
      if (navigator && navigator.share) {
        navigator
          .share({
            title: `GeoGrid Results for ${gridResult.businessInfo.name}`,
            text: `Check out the GeoGrid results for "${gridResult.businessInfo.name}" searching for "${gridResult.searchTerm}"`,
            url: shareUrl,
          })
          .catch((error) => {
            console.log("Error sharing:", error)
            fallbackShare(shareUrl)
          })
      } else {
        fallbackShare(shareUrl)
      }
    } catch (error) {
      console.error("Error sharing:", error)
      fallbackShare(`${window.location.origin}/grid/${gridResult.id}`)
    }
  }

  // Add this helper function for sharing
  const fallbackShare = (url: string) => {
    try {
      // Create a temporary input to copy the URL
      const input = document.createElement("input")
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand("copy")
      document.body.removeChild(input)

      // Show toast notification
      alert("Link copied to clipboard!")
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      alert("Failed to copy link. The shareable URL is: " + url)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete this grid result for "${gridResult.businessInfo.name}"?`)) {
      try {
        setIsDeleting(true)
        const success = await deleteGridResult(gridResult.id)

        if (success) {
          onDelete()
          onClose()
        } else {
          alert("Failed to delete the grid result. Please try again.")
        }
      } catch (error) {
        console.error("Error deleting grid result:", error)
        alert("An error occurred while deleting the grid result.")
      } finally {
        setIsDeleting(false)
      }
    }
  }

  // Handle competitors view
  const handleCompetitorsView = async () => {
    try {
      // Show loading state in the dialog
      setCompetitorsLoading(true)
      setCompetitorsModalOpen(true)

      // First, determine the business type if we don't already have it
      let businessType = gridResult.businessInfo.businessType || ""

      // Check if we need to fetch the business type
      if (!businessType && gridResult.businessInfo.placeId) {
        try {
          // Fetch the business details to get its type
          const detailsResponse = await fetch("/api/place-details", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              placeId: gridResult.businessInfo.placeId,
            }),
          })

          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json()
            if (detailsData.result && detailsData.result.types && detailsData.result.types.length > 0) {
              // Use the first main type (excluding generic types like 'establishment')
              const mainTypes = detailsData.result.types.filter(
                (type: string) => !["establishment", "point_of_interest", "business"].includes(type),
              )
              businessType = mainTypes.length > 0 ? mainTypes[0] : detailsData.result.types[0]
            }
          }
        } catch (error) {
          console.error("Error fetching business type:", error)
        }
      }

      // If we couldn't determine the type, use the search term as a keyword
      const searchQuery = businessType || gridResult.searchTerm

      // Fetch competitors using the places-search API
      try {
        // Call the places-search API directly
        const response = await fetch("/api/places-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // Use the business type or search term to find related businesses
            query: searchQuery,
            location: gridResult.businessInfo.location,
            type: businessType || "", // Use the business type if available
            rankBy: "distance", // Rank by distance instead of prominence
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        const competitorResults = data.results || []

        // Process the results
        const results = competitorResults.map((place: any, index: number) => {
          // Calculate distance
          const R = 6371 // Radius of the earth in km
          const compLat = place.geometry?.location?.lat || 0
          const compLng = place.geometry?.location?.lng || 0
          const businessLat = gridResult.businessInfo.location.lat
          const businessLng = gridResult.businessInfo.location.lng

          const dLat = ((compLat - businessLat) * Math.PI) / 180
          const dLon = ((compLng - businessLng) * Math.PI) / 180
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((businessLat * Math.PI) / 180) *
              Math.cos((compLat * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          const distance = R * c // Distance in km

          return {
            id: place.place_id,
            name: place.name,
            address: place.vicinity || "Address unavailable",
            rating: place.rating || null,
            userRatingsTotal: place.user_ratings_total || 0,
            distance: distance,
            location: {
              lat: compLat,
              lng: compLng,
            },
            // Add a ranking based on the order of results
            ranking: index + 1,
            // Business category
            category:
              place.types && place.types.length > 0
                ? place.types[0].replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                : "Business",
            // Use Google Places Photos API if available, fallback to UI Avatars
            photoReference: place.photos && place.photos.length > 0 ? place.photos[0].photo_reference : undefined,
            photoUrl:
              place.photos && place.photos.length > 0 && place.photos[0].photo_reference
                ? undefined // Don't store URL directly, use photoReference instead
                : null,
            // Keep a reference to all photos
            photos: place.photos || [],
          }
        })

        // Sort by ranking
        const sortedResults = [...results].sort((a: any, b: any) => a.ranking - b.ranking)

        // Take top 20
        const topResults = sortedResults.slice(0, 20)

        // Set the competitors
        setCompetitors(topResults)
      } catch (error) {
        console.error("Error fetching competitors:", error)
      }
    } catch (error) {
      console.error("Error in handleCompetitorsView:", error)
    } finally {
      setCompetitorsLoading(false)
    }
  }

  // Add grid markers with improved precision
  useEffect(() => {
    if (!mapLoaded || mapError || !mapInstanceRef.current || !mapRef.current) return;

    try {
      const mapInstance = mapInstanceRef.current;

      // Clear any existing overlays
      if (window.google && window.google.maps) {
        // Track markers for cleanup
        if (!mapInstance.markers) {
          mapInstance.markers = [];
        } else {
          // Clear existing markers if present
          mapInstance.markers.forEach((marker: any) => marker.setMap(null));
          mapInstance.markers = [];
        }
        
        // More accurate conversion factors for better geographic orientation
        const latitude = location.lat;
        // Earth's radius is ~6371 km
        // 1 degree of latitude is approximately 111.32 km at the equator
        // The formula uses a more accurate calculation that varies with latitude
        const latKmRatio = 1 / 111.32; // km per degree of latitude - more precise

        // 1 degree of longitude varies with latitude
        // At the equator it's about 111.32 km, but decreases as we move towards poles
        // cos(latitude in radians) gives the reduction factor
        const lngKmRatio = 1 / (111.32 * Math.cos((latitude * Math.PI) / 180)); // km per degree of longitude

        // Calculate starting points to center the grid on the business location
        const startLat = latitude - (distance * latKmRatio * (gridSize - 1)) / 2;
        const startLng = location.lng - (distance * lngKmRatio * (gridSize - 1)) / 2;

        // Create bounds to fit all markers
        const bounds = new window.google.maps.LatLngBounds();
        const gridLines: any[] = [];
        const gridCells: any[] = [];

        console.log(`Drawing grid: ${gridSize}x${gridSize}, ${distance}km spacing, center: ${latitude.toFixed(6)},${location.lng.toFixed(6)}`);

        // Add ranking markers with improved data validation
        for (let i = 0; i < gridSize; i++) {
          for (let j = 0; j < gridSize; j++) {
            // Calculate precise latitude and longitude for this grid point
            const lat = startLat + i * distance * latKmRatio;
            const lng = startLng + j * distance * lngKmRatio;

            // Get ranking from grid data with proper validation
            if (!gridData || !Array.isArray(gridData[i]) || typeof gridData[i][j] === "undefined") {
              console.warn(`Missing grid data at position [${i}][${j}]`);
              continue;
            }
            
            const ranking = gridData[i][j];

            // Skip if ranking is 0 (no data) or invalid
            if (ranking === 0 || ranking < 0) continue;

            // Use rank icons instead of rectangles
            const marker = new window.google.maps.Marker({
              position: { lat, lng },
              map: mapInstance,
              icon: {
                url: ranking <= 20 ? `/images/rank-icons/${ranking}.png` : `/images/rank-icons/X.png`,
                scaledSize: new window.google.maps.Size(32, 32),
                anchor: new window.google.maps.Point(16, 16),
              },
              title: `Rank #${ranking} at position [${i+1},${j+1}]`,
              zIndex: 100 - (i * gridSize + j), // Higher rankings appear above lower ones
            });

            // Store ranking in marker for access in click handler
            (marker as any).ranking = ranking;
            (marker as any).gridPosition = {row: i, col: j};
            
            // Store the marker for potential cleanup
            gridCells.push(marker);

            // Add click listener to show nearby competitors
            marker.addListener("click", () => {
              // Build temporary data for this grid point
              const gridPointData = {
                lat: lat,
                lng: lng,
                ranking: ranking,
                pointIndex: i * gridSize + j,
              };

              // For now, just log instead of calling potentially undefined function
              console.log("Grid point clicked:", gridPointData);
              // The actual function will be defined elsewhere
            });
            
            // Add to bounds for fitting map view
            bounds.extend({ lat, lng });
          }
        }

        // Save markers for potential cleanup later
        mapInstance.markers = gridCells;

        // Add grid visualization to show geographic orientation
        // Draw latitude grid lines (horizontal) with improved styling
        for (let i = 0; i <= gridSize; i++) {
          const lat = startLat + i * distance * latKmRatio;
          const line = new window.google.maps.Polyline({
            path: [
              { lat, lng: startLng },
              { lat, lng: startLng + gridSize * distance * lngKmRatio },
            ],
            geodesic: true,
            strokeColor: "#AAAAAA",
            strokeOpacity: 0.5,
            strokeWeight: 1,
            map: mapInstance,
          });
          gridLines.push(line);
        }

        // Draw longitude grid lines (vertical)
        for (let j = 0; j <= gridSize; j++) {
          const lng = startLng + j * distance * lngKmRatio;
          const line = new window.google.maps.Polyline({
            path: [
              { lat: startLat, lng },
              { lat: startLat + gridSize * distance * latKmRatio, lng },
            ],
            geodesic: true,
            strokeColor: "#AAAAAA",
            strokeOpacity: 0.5,
            strokeWeight: 1,
            map: mapInstance,
          });
          gridLines.push(line);
        }
        
        // Save grid lines for potential cleanup later
        mapInstance.gridLines = gridLines;

        // Add business marker at the center
        const businessMarker = new window.google.maps.Marker({
          position: { lat: latitude, lng: location.lng },
          map: mapInstance,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#4285F4',
            fillOpacity: 0.8,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
            scale: 10,
          },
          title: gridResult.businessInfo.name,
          zIndex: 1000,
        });
        gridCells.push(businessMarker);

        // Fit map to include all markers with padding
        mapInstance.fitBounds(bounds, 40); // 40 pixels padding

        // Limit max zoom level to keep context
        const listener = window.google.maps.event.addListener(mapInstance, "idle", () => {
          if (mapInstance.getZoom() > 14) {
            mapInstance.setZoom(14);
          }
          window.google.maps.event.removeListener(listener);
        });
      }
    } catch (error) {
      console.error("Error drawing grid:", error);
    }
  }, [mapLoaded, mapError, gridSize, distance, location, gridData, gridResult.businessInfo.name]);

  // Handle regenerating PNG
  const handleRegeneratePNG = () => {
    // Release the old URL to avoid memory leaks
    if (savedPngUrl) {
      revokeObjectUrls([savedPngUrl]);
    }
    
    // Reset the saved URL to null so handlePNG will generate a new one
    setSavedPngUrl(null);
    
    // Call handlePNG to generate a new PNG
    handlePNG();
  };

  // Add cleanup for the saved PNG URL
  useEffect(() => {
    return () => {
      // Release the URL object when component unmounts
      if (savedPngUrl) {
        revokeObjectUrls([savedPngUrl]);
      }
    };
  }, [savedPngUrl]);

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar with business information */}
        <div className="lg:w-1/4">
          <div className="bg-white rounded-md shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="mb-4">
              <button onClick={onClose} className="inline-flex items-center text-blue-600 hover:underline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to list
              </button>
            </div>

            <div>
              <h1 className="text-xl font-bold text-blue-600 mb-1">{gridResult.businessInfo.name}</h1>
              <p className="text-gray-600">{gridResult.businessInfo.address || "Not available"}</p>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-500">Search term:</div>
              <p className="font-medium">{gridResult.searchTerm}</p>
            </div>

            {/* Grid metrics with visualization */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-500">AGR</div>
                    <div className="font-medium">{Number(gridResult.metrics?.agr || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500">ATGR</div>
                    <div className="font-medium">{Number(gridResult.metrics?.atgr || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500">SoLV</div>
                    <div className="font-medium">{String(gridResult.metrics?.solv || "0%")}</div>
                  </div>
                </div>

                {/* Grid visualization */}
                <div className="h-16 w-16 flex-shrink-0">
                  {Array.isArray(gridData) && gridData.length > 0 ? (
                    <div className="grid grid-cols-5 grid-rows-5 h-full w-full gap-[1px]">
                      {Array(5)
                        .fill(0)
                        .map((_, rowIndex) =>
                          Array(5)
                            .fill(0)
                            .map((_, colIndex) => {
                              // Sample data from the full grid to create a smaller representation
                              const fullRowIndex = Math.floor((rowIndex * gridSize) / 5)
                              const fullColIndex = Math.floor((colIndex * gridSize) / 5)
                              const ranking =
                                gridData[fullRowIndex] && gridData[fullRowIndex][fullColIndex]
                                  ? gridData[fullRowIndex][fullColIndex]
                                  : 0
                              return (
                                <div
                                  key={`${rowIndex}-${colIndex}`}
                                  className="w-full h-full"
                                  style={{
                                    backgroundColor: ranking === 0 ? "#F3F4F6" : getRankingColor(ranking),
                                  }}
                                />
                              )
                            }),
                        )}
                    </div>
                  ) : (
                    <div className="h-full w-full bg-gray-100"></div>
                  )}
                </div>
              </div>
            </div>

            {gridResult.businessInfo.placeId && (
              <div className="bg-gray-50 p-3 rounded-md border border-gray-100">
                <div className="text-sm font-medium text-gray-500 mb-2">Place ID:</div>
                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono truncate flex-1 overflow-hidden">
                    {gridResult.businessInfo.placeId}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-gray-200"
                    onClick={() => {
                      navigator.clipboard.writeText(gridResult.businessInfo.placeId || "")
                      alert("Place ID copied to clipboard")
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-md font-semibold mb-2">TAGS</h3>
              <div className="bg-gray-50 p-3 rounded-md border border-gray-100">
                <div className="text-sm font-medium text-gray-500 mb-1">Note:</div>
                <div className="text-sm text-gray-600">
                  {gridResult.notes || "No tags or notes added for this search."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content area with map */}
        <div className="lg:w-3/4">
          <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden relative">
            {/* Action buttons on top of map */}
            <div className="absolute top-4 left-4 z-10">
              <div className="flex gap-1">
                <button
                  onClick={handleRepeatSearch}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Repeat
                </button>
                <button
                  onClick={handlePNG}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {savedPngUrl ? "View PNG" : "Open PNG"}
                </button>
                {savedPngUrl && (
                  <button
                    onClick={handleRegeneratePNG}
                    className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Regenerate PNG
                  </button>
                )}
                <button
                  onClick={handleCSVDownload}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  CSV
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  Share
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-red-600 text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={handleCompetitorsView}
                  className="flex items-center bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  Competitors
                </button>
              </div>
            </div>

            <div className="h-[600px] bg-gray-100 relative">
              {mapError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-red-500 mb-2">{mapError}</div>
                    <Button
                      onClick={() => {
                        setMapError(null)
                        setMapLoaded(false)
                        // Re-mount the component to force re-initialization
                        if (mapRef.current) {
                          // Clear the map container
                          mapRef.current.innerHTML = ""
                        }
                      }}
                    >
                      Retry Loading Map
                    </Button>
                  </div>
                </div>
              ) : !mapLoaded ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <div className="absolute top-0 left-0 w-full h-full rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                      <div className="absolute top-1 left-1 w-14 h-14 rounded-full border-4 border-t-transparent border-r-primary border-b-transparent border-l-transparent animate-spin animation-delay-150"></div>
                      <div className="absolute top-2 left-2 w-12 h-12 rounded-full border-4 border-t-transparent border-r-transparent border-b-primary border-l-transparent animate-spin animation-delay-300"></div>
                    </div>
                    <p className="text-lg font-medium">Loading map...</p>
                    <p className="text-sm text-muted-foreground mt-1">This may take a moment</p>
                  </div>
                </div>
              ) : null}

              <style jsx global>{`
              .scrollbar-container::-webkit-scrollbar {
                width: 14px;
                height: 14px;
              }
              
              .scrollbar-container::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
              }
              
              .scrollbar-container::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
                border: 3px solid #f1f1f1;
              }
              
              .scrollbar-container::-webkit-scrollbar-thumb:hover {
                background: #555;
              }
              
              /* Firefox */
              .scrollbar-container {
                scrollbar-width: thin;
                scrollbar-color: #888 #f1f1f1;
              }
            `}</style>

              <div
                ref={mapRef}
                className="w-full h-full scrollbar-container overflow-auto"
                style={{ display: mapError || !mapLoaded ? "none" : "block" }}
              />

              {/* Metrics overlay directly on map */}
              {mapLoaded && !mapError && (
                <div className="absolute bottom-4 left-4 z-50 flex gap-1">
                  <div className="bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px] flex items-center">
                    <span>Created:</span>
                    <span className="ml-1">{formatDate(gridResult.createdAt)}</span>
                  </div>
                  <div className="bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px] flex items-center">
                    <span>Grid:</span>
                    <span className="ml-1">
                      {isNaN(gridResult.gridSize) ? "13" : gridResult.gridSize}x
                      {isNaN(gridResult.gridSize) ? "13" : gridResult.gridSize},{" "}
                      {isNaN(gridResult.distanceKm) ? "2.5" : gridResult.distanceKm}km
                    </span>
                  </div>
                  <div className="bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px] flex items-center">
                    <span>AGR:</span>
                    <span className="ml-1">{Number(gridResult.metrics?.agr || 0).toFixed(1)}</span>
                  </div>
                  <div className="bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px] flex items-center">
                    <span>ATGR:</span>
                    <span className="ml-1">{Number(gridResult.metrics?.atgr || 0).toFixed(1)}</span>
                  </div>
                  <div className="bg-white border-0 rounded-[2px] shadow-[0_1px_4px_-1px_rgba(0,0,0,0.3)] text-[#77838f] text-[14px] tracking-[0] py-[4px] px-[8px] flex items-center">
                    <span>SoLV:</span>
                    <span className="ml-1">{String(gridResult.metrics?.solv || "0%")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Map metadata at the bottom */}
            <div className="p-4 border-t border-gray-200 flex flex-wrap gap-4 text-sm">
              <div className="flex-1 min-w-[180px]">
                <div className="text-xs font-medium text-gray-500 mb-1">Created:</div>
                <div>{formatDate(gridResult.createdAt)}</div>
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-xs font-medium text-gray-500 mb-1">Google region:</div>
                <div className="capitalize">{gridResult.googleRegion || "global"}</div>
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-xs font-medium text-gray-500 mb-1">Grid:</div>
                <div>
                  {isNaN(gridResult.gridSize) ? "13" : gridResult.gridSize}x
                  {isNaN(gridResult.gridSize) ? "13" : gridResult.gridSize},{" "}
                  {isNaN(gridResult.distanceKm) ? "2.5" : gridResult.distanceKm}km
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Competitors Dialog - Revamped with shadcn/ui */}
      <Dialog open={competitorsModalOpen} onOpenChange={setCompetitorsModalOpen}>
        <DialogContent className="w-screen h-screen max-w-full p-0 overflow-hidden flex flex-col sm:max-w-[90vw] sm:h-[90vh] sm:rounded-lg">
          <DialogHeader className="p-4 sm:p-6 border-b flex flex-row justify-between items-center space-y-0">
            <div>
              <DialogTitle className="flex items-center gap-2">
                Competitors
                <span className="text-sm font-normal text-gray-500">(Synchronized with grid)</span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-gray-500 mt-1">
                Nearby businesses for "{gridResult.businessInfo.name}"
              </DialogDescription>
            </div>
            <div className="w-1/2 sm:w-1/3">
              <Input
                placeholder="Search..."
                value={competitorSearch}
                onChange={(e) => setCompetitorSearch(e.target.value)}
                className="w-full h-9 text-sm"
              />
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="px-4 sm:px-6 py-4">
              {competitorsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
                </div>
              ) : filteredCompetitors.length === 0 ? (
                <div className="text-center text-gray-500 py-16">No competitors found matching your search.</div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50 z-10">
                    <TableRow>
                      <TableHead className="w-16 sm:w-20">Image</TableHead>
                      {["name", "ranking", "distance", "rating"].map((key) => (
                        <TableHead
                          key={key}
                          className="cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            if (compSortKey === key) setCompSortOrder((o) => (o === "asc" ? "desc" : "asc"))
                            else {
                              setCompSortKey(key as keyof Competitor)
                              setCompSortOrder("asc")
                            }
                          }}
                        >
                          {key.charAt(0).toUpperCase() + key.slice(1)} {/* Capitalize */}
                          {compSortKey === key &&
                            (compSortOrder === "asc" ? (
                              <span className="ml-1">▲</span>
                            ) : (
                              <span className="ml-1">▼</span>
                            ))}
                        </TableHead>
                      ))}
                      <TableHead className="w-16 sm:w-20 text-center">Grid</TableHead>
                      <TableHead className="w-8 sm:w-20 text-center">Grid Pos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompetitors.map((comp) => (
                      <TableRow
                        key={comp.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          // Find position on grid to highlight
                          if (comp.location) {
                            // Calculate grid position
                            const latitude = location.lat
                            const latKmRatio = 1 / 111.32
                            const lngKmRatio = 1 / (111.32 * Math.cos((latitude * Math.PI) / 180))
                            const startLat = latitude - (distance * latKmRatio * (gridSize - 1)) / 2
                            const startLng = location.lng - (distance * lngKmRatio * (gridSize - 1)) / 2

                            // Calculate the closest grid point
                            const latDiff = comp.location.lat - startLat
                            const lngDiff = comp.location.lng - startLng
                            const gridRow = Math.round(latDiff / (distance * latKmRatio))
                            const gridCol = Math.round(lngDiff / (distance * lngKmRatio))

                            const isInGrid = gridRow >= 0 && gridRow < gridSize && gridCol >= 0 && gridCol < gridSize

                            if (isInGrid) {
                              // Highlight this position on the map
                              if (mapInstanceRef.current) {
                                // Center map on this position
                                const gridLat = startLat + gridRow * distance * latKmRatio
                                const gridLng = startLng + gridCol * distance * lngKmRatio
                                mapInstanceRef.current.panTo({ lat: gridLat, lng: gridLng })
                                mapInstanceRef.current.setZoom(16)

                                // Close competitors dialog
                                setCompetitorsModalOpen(false)

                                // Add a temporary highlight marker
                                const highlightMarker = new window.google.maps.Marker({
                                  position: { lat: gridLat, lng: gridLng },
                                  map: mapInstanceRef.current,
                                  icon: {
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 20,
                                    fillColor: "#4285F4",
                                    fillOpacity: 0.4,
                                    strokeColor: "#4285F4",
                                    strokeWeight: 2,
                                  },
                                  zIndex: 1000,
                                })

                                // Remove highlight after 3 seconds
                                setTimeout(() => {
                                  highlightMarker.setMap(null)
                                }, 3000)
                              }
                            }
                          }
                        }}
                      >
                        <TableCell>
                          <img
                            src={
                              comp.photoReference
                                ? getPhotoUrl(comp.photoReference)
                                : comp.photoUrl ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(comp.name.substring(0, 2))}&background=random&color=fff&size=60&bold=true`
                            }
                            alt={comp.name}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded border border-gray-200 bg-gray-100"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.onerror = null
                              target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(comp.name.substring(0, 2))}&background=random&color=fff&size=60&bold=true`
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        <TableCell>{comp.ranking}</TableCell>
                        <TableCell>{comp.distance.toFixed(1)} km</TableCell>
                        <TableCell>
                          {comp.rating ? (
                            <span className="flex items-center">
                              {comp.rating.toFixed(1)} <span className="text-yellow-500 ml-1">★</span>
                            </span>
                          ) : (
                            "–"
                          )}
                        </TableCell>
                        <TableCell className="flex justify-center items-center">
                          <div
                            className="w-12 h-12 sm:w-16 sm:h-16 rounded-md overflow-hidden border border-gray-300"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(13, 1fr)",
                              gridTemplateRows: "repeat(13, 1fr)",
                              gap: "0px",
                            }}
                            title={`Simulated ranking grid for ${comp.name}`}
                          >
                            {Array.from({ length: 169 }).map((_, index) => {
                              const i = Math.floor(index / 13)
                              const j = index % 13
                              const centerRow = 6
                              const centerCol = 6
                              const distanceFromCenter = Math.sqrt(
                                Math.pow(i - centerRow, 2) + Math.pow(j - centerCol, 2),
                              )
                              let cellRanking = comp.ranking || 20
                              if (distanceFromCenter > 0) {
                                const distanceFactor = Math.pow(distanceFromCenter, 1.2)
                                cellRanking = Math.min(20, Math.round(cellRanking + distanceFactor * 1.5))
                              }
                              return (
                                <div
                                  key={`${comp.id}-grid-${i}-${j}`}
                                  style={{
                                    backgroundColor: getRankingColor(cellRanking),
                                    border: "0.5px solid rgba(255, 255, 255, 0.2)",
                                  }}
                                />
                              )
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {comp.location &&
                            (() => {
                              // Calculate grid position for this competitor
                              const latitude = location.lat
                              const latKmRatio = 1 / 111.32
                              const lngKmRatio = 1 / (111.32 * Math.cos((latitude * Math.PI) / 180))
                              const startLat = latitude - (distance * latKmRatio * (gridSize - 1)) / 2
                              const startLng = location.lng - (distance * lngKmRatio * (gridSize - 1)) / 2

                              // Calculate the closest grid point
                              const latDiff = comp.location.lat - startLat
                              const lngDiff = comp.location.lng - startLng
                              const gridRow = Math.round(latDiff / (distance * latKmRatio))
                              const gridCol = Math.round(lngDiff / (distance * lngKmRatio))

                              const isInGrid = gridRow >= 0 && gridRow < gridSize && gridCol >= 0 && gridCol < gridSize

                              if (isInGrid) {
                                return (
                                  <div className="inline-flex items-center justify-center bg-blue-50 text-blue-700 rounded-full px-2 py-1 text-xs font-medium">
                                    {gridRow + 1},{gridCol + 1}
                                  </div>
                                )
                              } else {
                                return <div className="text-gray-400 text-xs">Outside grid</div>
                              }
                            })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
