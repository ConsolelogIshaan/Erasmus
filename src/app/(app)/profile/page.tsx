import { redirect } from "next/navigation";
import { ROUTES } from "@/constants/routes";

/**
 * Profile is now merged into the home dashboard.
 * Forward all visits from /profile to /dashboard.
 */
export default function ProfilePage() {
  redirect(ROUTES.dashboard);
}
