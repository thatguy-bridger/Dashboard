import Link from "next/link";
import { LivingOrb } from "@/components/LivingOrb";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <LivingOrb size={40} />
      <div className="flex gap-4">
        <Link href="/screen" className="glass-panel px-6 py-4 hover:opacity-80">
          Open as Screen
        </Link>
        <Link href="/control" className="glass-panel px-6 py-4 hover:opacity-80">
          Open Controller
        </Link>
      </div>
    </main>
  );
}
