import { redirect } from "next/navigation";

// GroupMe was replaced by Chatter: old links and bookmarks land there.
export default function GroupMePage() {
  redirect("/chatter");
}
