import { redirect } from "next/navigation";

// Opening the app always means "show the kiosk" — there's no chooser
// screen to tap through. Control is reachable only by navigating to
// /control directly, deliberately: it's an admin surface, not something
// offered as an equal option every time the app launches.
export default function Home() {
  redirect("/screen");
}
