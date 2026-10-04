// Reads every calendar the macOS Calendar app shows (iCloud, Google, Exchange/Microsoft,
// subscribed) through EventKit and posts the next 14 days to the dashboard.
//
//   CalendarSync                      sync using ~/.config/homebase/calendar.json
//   CalendarSync --dry-run [--out f]  print/write the JSON instead of posting
import Foundation
import EventKit

struct Config: Decodable { let url: String; let token: String }

let args = CommandLine.arguments
let dryRun = args.contains("--dry-run")
let outPath: String? = args.firstIndex(of: "--out").flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil }

func fail(_ msg: String, _ code: Int32 = 1) -> Never {
    let line = "CalendarSync: \(msg)\n"
    FileHandle.standardError.write(line.data(using: .utf8)!)
    if let p = outPath { try? line.write(toFile: p, atomically: true, encoding: .utf8) }
    exit(code)
}

func hex(_ c: CGColor?) -> String? {
    guard let c = c, let rgb = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil),
          let comps = rgb.components, comps.count >= 3 else { return nil }
    return String(format: "#%02X%02X%02X", Int(comps[0] * 255), Int(comps[1] * 255), Int(comps[2] * 255))
}

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var granted = false
if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { ok, _ in granted = ok; sem.signal() }
} else {
    store.requestAccess(to: .event) { ok, _ in granted = ok; sem.signal() }
}
sem.wait()
guard granted else { fail("calendar access not granted (System Settings > Privacy & Security > Calendars)", 2) }

let cal = Calendar.current
let start = cal.startOfDay(for: Date())
let end = cal.date(byAdding: .day, value: 14, to: start)!

let timed = ISO8601DateFormatter()
timed.timeZone = TimeZone.current
timed.formatOptions = [.withInternetDateTime]
let dayFmt = DateFormatter()
dayFmt.dateFormat = "yyyy-MM-dd"
dayFmt.timeZone = TimeZone.current

var calendars: [[String: Any]] = []
for c in store.calendars(for: .event) {
    calendars.append(["name": c.title, "account": c.source.title, "color": hex(c.cgColor) as Any])
}

var events: [[String: Any]] = []
for e in store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)) {
    // Skip things you've declined.
    if let me = e.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { continue }
    var item: [String: Any] = [
        "summary": e.title ?? "(no title)",
        "calendar": e.calendar.title,
        "account": e.calendar.source.title,
        "color": hex(e.calendar.cgColor) as Any,
        "allDay": e.isAllDay,
    ]
    if e.isAllDay {
        // EventKit's all-day end is 23:59:59 of the last day; send an exclusive end date.
        item["start"] = dayFmt.string(from: e.startDate)
        item["end"] = dayFmt.string(from: e.endDate.addingTimeInterval(1))
    } else {
        item["start"] = timed.string(from: e.startDate)
        item["end"] = timed.string(from: e.endDate)
    }
    events.append(item)
}

let payload: [String: Any] = ["events": events, "calendars": calendars]
let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])

if dryRun {
    if let p = outPath { try data.write(to: URL(fileURLWithPath: p)) } else { FileHandle.standardOutput.write(data) }
    exit(0)
}

let cfgPath = ProcessInfo.processInfo.environment["HOMEBASE_CONFIG"] ?? NSHomeDirectory() + "/.config/homebase/calendar.json"
guard let cfgData = FileManager.default.contents(atPath: cfgPath), let cfg = try? JSONDecoder().decode(Config.self, from: cfgData)
else { fail("missing or invalid config at \(cfgPath)") }

var req = URLRequest(url: URL(string: cfg.url + "/api/calendar/push")!)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.setValue(cfg.token, forHTTPHeaderField: "x-notify-token")
req.httpBody = data
let done = DispatchSemaphore(value: 0)
var status = 0
URLSession.shared.dataTask(with: req) { _, resp, err in
    status = (resp as? HTTPURLResponse)?.statusCode ?? -1
    if let err = err { FileHandle.standardError.write("CalendarSync: \(err.localizedDescription)\n".data(using: .utf8)!) }
    done.signal()
}.resume()
done.wait()
guard status == 200 else { fail("dashboard responded \(status)") }
print("CalendarSync: pushed \(events.count) events from \(calendars.count) calendars")
