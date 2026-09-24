import type { WidgetType, WidgetSize } from "@/lib/presets";
import { WeatherWidget } from "@/components/WeatherWidget";
import { WorldClocksWidget } from "@/components/WorldClocksWidget";
import { NewsWidget } from "@/components/NewsWidget";
import { SportsWidget } from "@/components/SportsWidget";
import { ClockWidget } from "@/components/ClockWidget";
import { CalendarWidget } from "@/components/CalendarWidget";
import { LocationsWidget } from "@/components/LocationsWidget";
import { GmailWidget } from "@/components/GmailWidget";
import { DriveWidget } from "@/components/DriveWidget";
import { PhotosWidget } from "@/components/PhotosWidget";

export function WidgetRenderer({ type, size = "md" }: { type: WidgetType; size?: WidgetSize }) {
  switch (type) {
    case "clock":
      return <ClockWidget size={size} />;
    case "weather":
      return <WeatherWidget size={size} />;
    case "worldclocks":
      return <WorldClocksWidget size={size} />;
    case "news":
      return <NewsWidget size={size} />;
    case "sports":
      return <SportsWidget size={size} />;
    case "calendar":
      return <CalendarWidget size={size} />;
    case "locations":
      return <LocationsWidget size={size} />;
    case "gmail":
      return <GmailWidget size={size} />;
    case "drive":
      return <DriveWidget size={size} />;
    case "photos":
      return <PhotosWidget size={size} />;
    default:
      return null;
  }
}
