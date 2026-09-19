import { redirect } from "next/navigation";
import { ROUTES } from "@/constants/routes";

export default function StatsPage() {
  redirect(ROUTES.dashboard);
}
