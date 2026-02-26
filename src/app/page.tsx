import { redirect } from "next/navigation";

/**
 * Root page - redirect to verify
 */
export default function Home() {
  redirect("/verify");
}
