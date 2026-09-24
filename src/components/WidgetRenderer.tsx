import type { WidgetType, WidgetSize } from "@/lib/presets";
import { WeatherWidget } from "@/components/WeatherWidget";
import { WorldClocksWidget } from "@/components/WorldClocksWidget";
import { NewsWidget } from "@/components/NewsWidget";
import { SportsWidget } from "@/components/SportsWidget";
import { ClockWidget } from "@/components/ClockWidget";
import { CalendarWidget } from "@/components/CalendarWidget";

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
    default:
      return null;
  }
}
