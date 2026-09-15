import { redirect } from "next/navigation";

// No public landing page (locked decision). The root goes to the admin console;
// buyer walks live at /walk/[slug] from Phase 3.
export default function Home() {
  redirect("/admin");
}
