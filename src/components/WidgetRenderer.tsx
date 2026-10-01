import type { WidgetType, WidgetSize } from "@/lib/presets";
import { WeatherWidget } from "@/components/WeatherWidget";
import { WorldClocksWidget } from "@/components/WorldClocksWidget";
import { NewsWidget } from "@/components/NewsWidget";
import { SportsWidget } from "@/components/SportsWidget";
import { ClockWidget } from "@/components/ClockWidget";
import { CalendarWidget } from "@/components/CalendarWidget";
import { TrafficWidget } from "@/components/TrafficWidget";
import { LocationsWidget } from "@/components/LocationsWidget";
import { GmailWidget } from "@/components/GmailWidget";
import { DriveWidget } from "@/components/DriveWidget";
import { PhotosWidget } from "@/components/PhotosWidget";
import { TrafficCameraWidget } from "@/components/TrafficCameraWidget";
import { CountdownWidget } from "@/components/CountdownWidget";
import { AirQualityWidget } from "@/components/AirQualityWidget";
import { HistoryWidget } from "@/components/HistoryWidget";
import { StocksWidget } from "@/components/StocksWidget";
import { RadarWidget } from "@/components/RadarWidget";
import { NotificationsWidget } from "@/components/NotificationsWidget";
import { LyricsWidget } from "@/components/LyricsWidget";

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
    case "traffic":
      return <TrafficWidget size={size} />;
    case "locations":
      return <LocationsWidget size={size} />;
    case "gmail":
      return <GmailWidget size={size} />;
    case "drive":
      return <DriveWidget size={size} />;
    case "photos":
      return <PhotosWidget size={size} />;
    case "trafficcamera":
      return <TrafficCameraWidget size={size} />;
    case "countdown":
      return <CountdownWidget size={size} />;
    case "airquality":
      return <AirQualityWidget size={size} />;
    case "history":
      return <HistoryWidget size={size} />;
    case "stocks":
      return <StocksWidget size={size} />;
    case "radar":
      return <RadarWidget size={size} />;
    case "notifications":
      return <NotificationsWidget size={size} />;
    case "lyrics":
      return <LyricsWidget size={size} />;
    default:
      return null;
  }
}
