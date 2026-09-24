import type { WidgetType } from "@/lib/presets";
import { WeatherWidget } from "@/components/WeatherWidget";
import { WorldClocksWidget } from "@/components/WorldClocksWidget";
import { NewsWidget } from "@/components/NewsWidget";

export function WidgetRenderer({ type }: { type: WidgetType }) {
  switch (type) {
    case "weather":
      return <WeatherWidget />;
    case "worldclocks":
      return <WorldClocksWidget />;
    case "news":
      return <NewsWidget />;
    case "clock":
      // The clock itself is always rendered by the screen shell.
      return null;
    default:
      return null;
  }
}
