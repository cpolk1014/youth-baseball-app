import { describe, expect, it } from "vitest";
import {
  forecastFor,
  heatIndex,
  hoursFor,
  parseAlerts,
  parseHourly,
  summarize,
  weatherEmoji,
  weatherFlags,
  weatherLine,
  windMph,
  type Hour,
} from "./forecast";

const hour = (start: string, over: Partial<Hour> = {}): Hour => ({
  start,
  temp: 72,
  rain: 0,
  humidity: 50,
  wind: 5,
  windDir: "S",
  short: "Sunny",
  day: true,
  ...over,
});

/** Saturday 9:00–14:00 Central. */
const day = [9, 10, 11, 12, 13].map((h) =>
  hour(`2026-11-21T${String(h).padStart(2, "0")}:00:00-06:00`),
);

describe("parseHourly", () => {
  it("reads the weather service's periods", () => {
    const { hours, updated } = parseHourly({
      properties: {
        updateTime: "2026-11-18T07:27:32+00:00",
        periods: [
          {
            startTime: "2026-11-18T09:00:00-06:00",
            isDaytime: true,
            temperature: 59,
            temperatureUnit: "F",
            probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: 20 },
            relativeHumidity: { unitCode: "wmoUnit:percent", value: 87 },
            windSpeed: "10 mph",
            windDirection: "E",
            shortForecast: "Mostly Sunny",
          },
          { startTime: "bad" },
          { temperature: 40 },
        ],
      },
    });
    expect(updated).toBe("2026-11-18T07:27:32+00:00");
    expect(hours).toEqual([
      {
        start: "2026-11-18T09:00:00-06:00",
        temp: 59,
        rain: 20,
        humidity: 87,
        wind: 10,
        windDir: "E",
        short: "Mostly Sunny",
        day: true,
      },
    ]);
  });

  it("copes with nothing, nulls and Celsius", () => {
    expect(parseHourly(null)).toEqual({ hours: [], updated: null });
    const { hours } = parseHourly({
      properties: {
        periods: [
          {
            startTime: "2026-11-18T09:00:00-06:00",
            temperature: 20,
            temperatureUnit: "C",
            probabilityOfPrecipitation: { value: null },
            isDaytime: false,
          },
        ],
      },
    });
    expect(hours[0]).toMatchObject({ temp: 68, rain: 0, humidity: null, wind: 0, day: false });
  });
});

describe("windMph", () => {
  it("takes the top of a range", () => {
    expect(windMph("10 to 15 mph")).toBe(15);
    expect(windMph("5 mph")).toBe(5);
    expect(windMph("Calm")).toBe(0);
    expect(windMph(undefined)).toBe(0);
  });
});

describe("parseAlerts", () => {
  it("keeps real alerts and skips tests", () => {
    const alerts = parseAlerts({
      features: [
        {
          properties: {
            event: "Severe Thunderstorm Warning",
            headline: "Severe Thunderstorm Warning until 4:45 PM CST",
            severity: "Severe",
            status: "Actual",
            ends: "2026-11-18T16:45:00-06:00",
          },
        },
        { properties: { event: "Test Message", status: "Test" } },
        { properties: { event: "Heat Advisory", expires: "2026-11-18T20:00:00-06:00" } },
        {},
      ],
    });
    expect(alerts).toEqual([
      {
        event: "Severe Thunderstorm Warning",
        headline: "Severe Thunderstorm Warning until 4:45 PM CST",
        severity: "Severe",
        ends: "2026-11-18T16:45:00-06:00",
      },
      {
        event: "Heat Advisory",
        headline: "Heat Advisory",
        severity: "Unknown",
        ends: "2026-11-18T20:00:00-06:00",
      },
    ]);
    expect(parseAlerts(null)).toEqual([]);
  });
});

describe("heatIndex", () => {
  it("matches the weather service's table", () => {
    expect(heatIndex(90, 60)).toBe(100);
    expect(heatIndex(96, 50)).toBe(108);
    expect(heatIndex(70, 50)).toBe(69);
    expect(heatIndex(80, 40)).toBe(80);
  });
});

describe("weatherEmoji", () => {
  it("picks by the words", () => {
    expect(weatherEmoji("Chance Showers And Thunderstorms")).toBe("⛈️");
    expect(weatherEmoji("Light Rain Likely")).toBe("🌧️");
    expect(weatherEmoji("Partly Cloudy")).toBe("⛅");
    expect(weatherEmoji("Mostly Sunny")).toBe("⛅");
    expect(weatherEmoji("Mostly Cloudy")).toBe("☁️");
    expect(weatherEmoji("Sunny")).toBe("☀️");
    expect(weatherEmoji("Clear", false)).toBe("🌙");
    expect(weatherEmoji("Patchy Fog")).toBe("🌫️");
  });
});

describe("hoursFor", () => {
  it("takes the hour first pitch falls in through two hours later", () => {
    const start = new Date("2026-11-21T10:30:00-06:00");
    expect(hoursFor(day, start).map((h) => h.start.slice(11, 13))).toEqual(["10", "11", "12"]);
    expect(
      hoursFor(day, new Date("2026-11-21T10:00:00-06:00")).map((h) => h.start.slice(11, 13)),
    ).toEqual(["10", "11"]);
  });
});

describe("weatherFlags", () => {
  it("is quiet on a nice day", () => {
    expect(weatherFlags(day)).toEqual([]);
    expect(weatherFlags([])).toEqual([]);
  });

  it("flags storms over rain", () => {
    const hrs = [
      hour("a", { rain: 30 }),
      hour("b", { rain: 70, short: "Showers And Thunderstorms Likely" }),
    ];
    expect(weatherFlags(hrs)).toEqual([
      { kind: "storm", text: "Thunderstorms likely around game time (70%)" },
    ]);
    expect(
      weatherFlags([hour("a", { rain: 20, short: "Slight Chance Thunderstorms" })])[0]!.text,
    ).toBe("Thunderstorms possible around game time");
    expect(weatherFlags([hour("a", { rain: 55, short: "Rain Likely" })])).toEqual([
      { kind: "rain", text: "Rain likely around game time (55%)" },
    ]);
    expect(weatherFlags([hour("a", { rain: 40, short: "Chance Rain" })])).toEqual([]);
  });

  it("flags heat by how hot it feels", () => {
    expect(weatherFlags([hour("a", { temp: 90, humidity: 60 })])).toEqual([
      { kind: "heat", text: "Hot: feels like 100°. Bring extra water" },
    ]);
    expect(weatherFlags([hour("a", { temp: 96, humidity: 50 })])[0]!.text).toMatch(
      /^Dangerous heat: feels like 108°/,
    );
    expect(weatherFlags([hour("a", { temp: 96, humidity: null })])[0]!.text).toBe(
      "Hot: feels like 96°. Bring extra water",
    );
  });

  it("flags cold and wind", () => {
    expect(weatherFlags([hour("a", { temp: 44 }), hour("b", { temp: 50, wind: 22 })])).toEqual([
      { kind: "cold", text: "Cold: 44°. Dress in layers" },
      { kind: "wind", text: "Windy: up to 22 mph" },
    ]);
  });
});

describe("summarize", () => {
  it("sums up the game's hours", () => {
    const hrs = [
      hour("a", { temp: 88, humidity: 70, rain: 10, wind: 8, windDir: "S", short: "Mostly Sunny" }),
      hour("b", { temp: 91, humidity: 60, rain: 30, wind: 12, windDir: "SW" }),
    ];
    const w = summarize(hrs, [], "u")!;
    expect(w).toMatchObject({
      temp: 88,
      short: "Mostly Sunny",
      emoji: "⛅",
      rain: 30,
      wind: 12,
      windDir: "SW",
      high: 91,
      low: 88,
      feelsLike: 102,
      updated: "u",
    });
    expect(weatherLine(w)).toBe("⛅ 88° · 30% rain");
    expect(summarize([], [], null)).toBeNull();
  });

  it("leaves feels-like off when it's about the temperature", () => {
    const w = summarize([hour("a", { temp: 72, humidity: 50 })], [], null)!;
    expect(w.feelsLike).toBeNull();
    expect(weatherLine(w)).toBe("☀️ 72°");
  });
});

describe("forecastFor", () => {
  const hourly = { hours: day, updated: null };
  const alert = {
    event: "Heat Advisory",
    headline: "Heat Advisory",
    severity: "Moderate",
    ends: null,
  };

  it("is later when the forecast doesn't reach the game", () => {
    expect(
      forecastFor(
        hourly,
        [],
        new Date("2026-11-28T10:00:00-06:00"),
        "2026-11-28",
        new Date("2026-11-21T08:00:00-06:00"),
      ),
    ).toEqual({ status: "later", from: "2026-11-22" });
  });

  it("shows alerts only for a game starting soon", () => {
    const start = new Date("2026-11-21T11:00:00-06:00");
    const soon = forecastFor(
      hourly,
      [alert],
      start,
      "2026-11-21",
      new Date("2026-11-21T08:00:00-06:00"),
    );
    expect(soon.status === "ok" && soon.alerts).toEqual([alert]);
    const early = forecastFor(
      hourly,
      [alert],
      start,
      "2026-11-21",
      new Date("2026-11-20T08:00:00-06:00"),
    );
    expect(early.status === "ok" && early.alerts).toEqual([]);
  });

  it("is unavailable with no forecast or a game already over", () => {
    const now = new Date("2026-11-21T08:00:00-06:00");
    expect(forecastFor({ hours: [], updated: null }, [], now, "2026-11-21", now)).toEqual({
      status: "unavailable",
    });
    expect(
      forecastFor(hourly, [], new Date("2026-11-21T05:00:00-06:00"), "2026-11-21", now),
    ).toEqual({ status: "unavailable" });
  });
});
