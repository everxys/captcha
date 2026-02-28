import { redirect } from "next/navigation";

/**
 * Root page - redirect to admin login
 */
export default function Home() {
  redirect("/captchas");
}
