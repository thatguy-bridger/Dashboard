import test from "node:test";
import assert from "node:assert/strict";
import { compass, dayOutlook, parseForecast } from "./forecast.ts";

const raw = {
  current: { temperature_2m: 60, apparent_temperature: 58, weather_code: 1, is_day: 1, wind_speed_10m: 8, wind_gusts_10m: 15, wind_direction_10m: 200, relative_humidity_2m: 40, precipitation: 0, surface_pressure: 1010 },
  hourly: { time: ["2026-11-09T10:00", "2026-11-09T11:00"], temperature_2m: [60, 62], weather_code: [1, 61], is_day: [1, 1], precipitation_probability: [10, 70], precipitation: [0, 0.1], wind_speed_10m: [8, 9], wind_direction_10m: [200, 210], uv_index: [2, 3] },
  daily: { time: ["2026-11-09"], temperature_2m_max: [65], temperature_2m_min: [48], weather_code: [61], precipitation_probability_max: [70], precipitation_sum: [0.2], sunrise: ["2026-11-09T07:00"], sunset: ["2026-11-09T17:00"], wind_speed_10m_max: [14] },
};
test("forecast", () => {
  const f = parseForecast(raw)!;
  assert.equal(f.hours.length, 2); assert.equal(f.days[0].hi, 65);
  assert.equal(compass(200), "SSW"); assert.equal(compass(0), "N");
  assert.match(dayOutlook(f, new Date("2026-11-09T10:00").getTime(), () => "Rain"), /Rain likely from/);
  assert.equal(parseForecast({}), null);
});
